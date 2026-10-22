using System;
using System.Globalization;
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

        // Sucht die nächstgelegene ÖPNV-Haltestelle zu Koordinaten
        public async Task<TransitStop?> GetNearbyStopAsync(double Lat, double Lon)
        {
            try
            {
                string url = $"https://v6.vbb.transport.rest/locations/nearby?latitude={Lat.ToString(CultureInfo.InvariantCulture)}&longitude={Lon.ToString(CultureInfo.InvariantCulture)}&results=1&distance=2000";
                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var jsonDoc = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(jsonDoc);
                var root = doc.RootElement;

                if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0)
                {
                    var firstStop = root[0];
                    if (firstStop.TryGetProperty("id", out var idProp) && !string.IsNullOrEmpty(idProp.GetString()))
                    {
                        return new TransitStop
                        {
                            Id = idProp.GetString()!,
                            Name = firstStop.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "Haltestelle" : "Haltestelle",
                            Lat = Lat,
                            Lon = Lon
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DEBUG] Fehler bei Haltestellensuche: {ex.Message}");
            }
            return null;
        }

        // Berechnet die Verbindung zwischen Start-Haltestelle und Ziel-Koordinaten
        public async Task<TransitConnection?> GetConnectionAsync(string stopId, double targetLat, double targetLon, DateTimeOffset departureTime)
        {
            try
            {
                // 1. Ziel-Haltestelle suchen
                var targetStop = await GetNearbyStopAsync(targetLat, targetLon);
                if (targetStop == null || string.IsNullOrEmpty(targetStop.Id))
                {
                    Console.WriteLine("[DEBUG] Keine Ziel-Haltestelle gefunden.");
                    return null;
                }

                // 2. ISO 8601 Datum formatieren
                string formattedDeparture = departureTime.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);

                // 3. VBB Journeys abfragen
                string url = $"https://v6.vbb.transport.rest/journeys?from={stopId}&to={targetStop.Id}&departure={formattedDeparture}&results=1";

                using var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[DEBUG VBB JOURNEYS FEHLER] Status Code: {response.StatusCode}");
                    return null;
                }

                var jsonDoc = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(jsonDoc);
                var root = doc.RootElement;

                if (!root.TryGetProperty("journeys", out var journeys) || journeys.GetArrayLength() == 0)
                {
                    Console.WriteLine("[DEBUG] Keine Verbingung im Journeys-Array gefunden.");
                    return null;
                }

                var firstJourney = journeys[0];
                int totalMinutes = 0;
                string lineName = "ÖPNV";

                if (firstJourney.TryGetProperty("departure", out var journeyDep) && firstJourney.TryGetProperty("arrival", out var journeyArr))
                {
                    if (DateTimeOffset.TryParse(journeyDep.GetString(), out var depTime) && DateTimeOffset.TryParse(journeyArr.GetString(), out var arrTime))
                    {
                        totalMinutes = (int)(arrTime - depTime).TotalMinutes;
                    }
                }

                if (firstJourney.TryGetProperty("legs", out var legs))
                {
                    foreach (var leg in legs.EnumerateArray())
                    {
                        if (leg.TryGetProperty("line", out var line) && line.TryGetProperty("name", out var nameProp))
                        {
                            lineName = nameProp.GetString() ?? lineName;
                            break;
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
            catch (Exception ex)
            {
                Console.WriteLine($"[DEBUG] Exception in GetConnectionAsync: {ex.Message}");
                return null;
            }
        }
    }
}