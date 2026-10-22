using System;
using System.Globalization;
using System.Net.Http;
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

        // Sucht NUR echte ÖPNV-Haltestellen
        public async Task<TransitStop?> GetNearbyStopAsync(double Lat, double Lon)
        {
            try
            {
                string url = $"https://v6.vbb.transport.rest/locations/nearby?latitude={Lat.ToString(CultureInfo.InvariantCulture)}&longitude={Lon.ToString(CultureInfo.InvariantCulture)}&results=5&distance=2000&stops=true&poi=false";
                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var jsonDoc = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(jsonDoc);
                var root = doc.RootElement;

                if (root.ValueKind == JsonValueKind.Array)
                {
                    foreach (var location in root.EnumerateArray())
                    {
                        string type = location.TryGetProperty("type", out var typeProp) ? typeProp.GetString() ?? "" : "";
                        
                        if ((type == "stop" || type == "station") && location.TryGetProperty("id", out var idProp))
                        {
                            double stopLat = Lat;
                            double stopLon = Lon;

                            if (location.TryGetProperty("location", out var locProp))
                            {
                                if (locProp.TryGetProperty("latitude", out var latProp)) stopLat = latProp.GetDouble();
                                if (locProp.TryGetProperty("longitude", out var lonProp)) stopLon = lonProp.GetDouble();
                            }

                            return new TransitStop
                            {
                                Id = idProp.GetString()!,
                                Name = location.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "Haltestelle" : "Haltestelle",
                                Lat = stopLat,
                                Lon = stopLon
                            };
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DEBUG] Fehler bei Haltestellensuche: {ex.Message}");
            }
            return null;
        }

        // Berechnet die ÖPNV-Fahrzeit aus den Legs
        public async Task<TransitConnection?> GetConnectionAsync(string stopId, double targetLat, double targetLon, DateTimeOffset departureTime)
        {
            try
            {
                var targetStop = await GetNearbyStopAsync(targetLat, targetLon);
                if (targetStop == null || string.IsNullOrEmpty(targetStop.Id))
                {
                    Console.WriteLine("[DEBUG] Keine Ziel-Haltestelle gefunden.");
                    return null;
                }

                if (stopId == targetStop.Id)
                {
                    Console.WriteLine($"[DEBUG] Start- ({stopId}) und Ziel-Haltestelle ({targetStop.Id}) sind identisch.");
                    return null;
                }

                string formattedDeparture = departureTime.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
                string url = $"https://v6.vbb.transport.rest/journeys?from={stopId}&to={targetStop.Id}&departure={formattedDeparture}&results=1";

                using var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var jsonDoc = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(jsonDoc);
                var root = doc.RootElement;

                if (!root.TryGetProperty("journeys", out var journeys) || journeys.GetArrayLength() == 0)
                {
                    return null;
                }

                var firstJourney = journeys[0];
                int totalMinutes = 0;
                string lineName = "ÖPNV";

                // VBB liefert departure/arrival in den `legs`
                if (firstJourney.TryGetProperty("legs", out var legs) && legs.GetArrayLength() > 0)
                {
                    int legCount = legs.GetArrayLength();
                    var firstLeg = legs[0];
                    var lastLeg = legs[legCount - 1];

                    // Ersten Fahrtabschnitt suchen (für LineName)
                    foreach (var leg in legs.EnumerateArray())
                    {
                        if (leg.TryGetProperty("line", out var line) && line.TryGetProperty("name", out var nameProp))
                        {
                            lineName = nameProp.GetString() ?? lineName;
                            break;
                        }
                    }

                    // Abfahrt aus leg[0] und Ankunft aus leg[last] auslesen
                    string? depStr = firstLeg.TryGetProperty("departure", out var d) ? d.GetString() : null;
                    string? arrStr = lastLeg.TryGetProperty("arrival", out var a) ? a.GetString() : null;

                    if (DateTimeOffset.TryParse(depStr, out var depTime) && DateTimeOffset.TryParse(arrStr, out var arrTime))
                    {
                        totalMinutes = Math.Max(1, (int)Math.Round((arrTime - depTime).TotalMinutes));
                        Console.WriteLine($"[DEBUG SUCCESS] ÖPNV-Fahrzeit von {stopId} nach {targetStop.Name}: {totalMinutes} Min.");
                    }
                }

                if (totalMinutes <= 0) return null;

                return new TransitConnection
                {
                    DurationMinutes = totalMinutes,
                    LineName = lineName,
                    Polyline = "",
                    ArrivalStopLat = targetStop.Lat,
                    ArrivalStopLon = targetStop.Lon
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