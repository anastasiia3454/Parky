//Diese Klassse ruft ÖPNV-Daten ab und sucht die passenden Haltestellen
using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Backend.Models;

namespace Backend.Services
{
    public class TransitService
    {
        private readonly HttpClient _httpClient;

        public TransitService(HttpClient httpClient)
        {
            _httpClient = httpClient;
            if (!_httpClient.DefaultRequestHeaders.Contains("User-Agent"))
            {
                _httpClient.DefaultRequestHeaders.Add("User-Agent", "ParkAndRideOptimizer/1.0");
            }
        }

        public async Task<TransitStop?> GetNearbyStopAsync(double Lat, double Lon)
        {
            try
            {
                string url = $"https://v6.vbb.transport.rest/locations/nearby?latitude={Lat.ToString(System.Globalization.CultureInfo.InvariantCulture)}&longitude={Lon.ToString(System.Globalization.CultureInfo.InvariantCulture)}&results=1&distance=1000";
                var stops = await _httpClient.GetFromJsonAsync<JsonElement[]>(url);
                if (stops != null && stops.Length > 0)
                {
                    var firstStop = stops[0];
                    return new TransitStop
                    {
                        Id = firstStop.GetProperty("id").GetString() ?? string.Empty,
                        Name = firstStop.GetProperty("name").GetString() ?? "Unbekannte Haltestelle",
                        Lat = firstStop.GetProperty("location").GetProperty("latitude").GetDouble(),
                        Lon = firstStop.GetProperty("location").GetProperty("longitude").GetDouble()
                    };
                }
            }
            catch { }
            return null;
        }

        public async Task<TransitConnection?> GetConnectionAsync(string stopId, double targetLat, double targetLon, DateTimeOffset departureTime)
        {
            try
            {
                var targetStop = await GetNearbyStopAsync(targetLat, targetLon);
                if (targetStop == null) return null;

                string url = $"https://v6.vbb.transport.rest/journeys?from={stopId}&to={targetStop.Id}&departure={departureTime.ToString("o")}&results=1";
                using var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var jsonDoc = await response.ContentReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(jsonDoc);
                var root = doc.RootElement;
                if (!root.TryGetProperty("journeys", out var journeys) || journeys.GetArrayLength() == 0) return null;

                var firstJourney = journeys[0];
                var legs = firstJourney.GetProperty("legs");
                int totalMinutes = 0;
                string lineName = "ÖPNV";

                foreach (var leg in legs.EnumerateArray())
                {
                    if (leg.TryGetProperty("line", out var line) && line.TryGetProperty("name", out var nameProp))
                    {
                        lineName = nameProp.GetString() ?? lineName;
                    }
                    if (leg.TryGetProperty("departure", out var dep) && leg.TryGetProperty("arrival", out var arr))
                    {
                        if (DateTimeOffset.TryParse(dep.GetString(), out var depTime) && DateTimeOffset.TryParse(arr.GetString(), out var arrTime))
                        {
                            totalMinutes += (int)(arrTime - depTime).TotalMinutes;
                        }
                    }
                }

                return new TransitConnection
                {
                    DurationMinutes = Math.Max(1, totalMinutes),
                    LineName = lineName,
                    Polyline = ""
                };
            }
            catch { return null; }
        }
    }
}