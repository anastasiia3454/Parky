using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Backend.Models;
using Microsoft.Extensions.Caching.Memory;

namespace Backend.Services
{
    /// <summary>
    /// Wird geworfen, wenn kein Overpass-Server erreichbar ist
    /// </summary>
    public class OverpassUnavailableException : Exception
    {
        public OverpassUnavailableException()
            : base("Alle Overpass-Server sind aktuell überlastet.") { }
    }

    /// <summary>
    /// Sucht P+R Parkplätze in der Nähe, berechnet die Fahrzeit mit dem Auto
    /// und bewertet sie. Ergebnisse werden 30 Minuten zwischengespeichert.
    /// </summary>
    public class ParkAndRideService
    {
        private static readonly string[] OverpassEndpoints =
        {
            "https://overpass.openstreetmap.fr/api/interpreter",
            "https://overpass-api.de/api/interpreter",
            "https://lz4.overpass-api.de/api/interpreter",
            "https://z.overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
            "https://overpass.private.coffee/api/interpreter"
        };

        private const int SearchRadiusMeters = 10000;
        private const double GridDegrees = 0.02;
        private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(3);
        private const int MaxAttempts = 1;

        private readonly IHttpClientFactory _clientFactory;
        private readonly IMemoryCache _cache;

        public ParkAndRideService(IHttpClientFactory clientFactory, IMemoryCache cache)
        {
            _clientFactory = clientFactory;
            _cache = cache;
        }

        public async Task<ParkAndRideResult> GetParkingsAsync(
            double lat, double lon, double? destLat, double? destLon, double weightSpeed)
        {
            var candidates = await GetCandidatesAsync(lat, lon);

            DirectCarRoute? directCarRoute = null;
            if (destLat.HasValue && destLon.HasValue)
            {
                directCarRoute = await GetDirectCarRouteAsync(lat, lon, destLat.Value, destLon.Value);
            }

            double wTransfers = 1.0 - weightSpeed;
            foreach (var cand in candidates)
            {
                double durationMinutes = cand.DriveDurationSeconds / 60.0;
                cand.Score = (weightSpeed * durationMinutes) + (wTransfers * (cand.Transfers * 10));
            }

            return new ParkAndRideResult
            {
                DirectCarRoute = directCarRoute,
                Parkings = candidates.OrderBy(c => c.Score).ToList()
            };
        }

        // ---------- Parkplätze (mit Cache) ----------

        private async Task<List<ParkingCandidate>> GetCandidatesAsync(double lat, double lon)
        {
            double gridLat = Math.Round(lat / GridDegrees) * GridDegrees;
            double gridLon = Math.Round(lon / GridDegrees) * GridDegrees;
            string cacheKey = $"pr_eval_{gridLat.ToString("F2", CultureInfo.InvariantCulture)}_{gridLon.ToString("F2", CultureInfo.InvariantCulture)}";

            if (_cache.TryGetValue(cacheKey, out List<ParkingCandidate>? cached) && cached != null)
            {
                return cached;
            }

            var client = _clientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("ParkAndRideApp/1.0 (https://github.com/parkyapp)");

            string latStr = gridLat.ToString(CultureInfo.InvariantCulture);
            string lonStr = gridLon.ToString(CultureInfo.InvariantCulture);

            string overpassQuery = $"[out:json][timeout:10];nwr[\"park_ride\"=\"yes\"](around:{SearchRadiusMeters},{latStr},{lonStr});out center;";

            var rawCandidates = await QueryOverpassAsync(client, overpassQuery);
            if (rawCandidates.Count == 0)
            {
                return new List<ParkingCandidate>();
            }

            var osrmCandidates = rawCandidates.Take(25).ToList();
            await LoadDriveDurationsAsync(client, lat, lon, osrmCandidates);

            var candidates = osrmCandidates
                .Where(c => c.DriveDurationSeconds > 0)
                .OrderBy(c => c.DriveDurationSeconds)
                .Take(15)
                .ToList();

            if (candidates.Count == 0)
            {
                candidates = rawCandidates.Take(15).ToList();
            }

            _cache.Set(cacheKey, candidates, TimeSpan.FromHours(2));
            return candidates;
        }

        // Fragt alle Overpass-Server gleichzeitig ab. Die erste erfolgreiche Antwort gewinnt.
        private static async Task<List<ParkingCandidate>> QueryOverpassAsync(HttpClient client, string query)
        {
            for (int attempt = 1; attempt <= MaxAttempts; attempt++)
            {
                var pending = OverpassEndpoints
                    .Select(endpoint => TryPostOverpassAsync(client, endpoint, query))
                    .ToList();

                while (pending.Count > 0)
                {
                    var finished = await Task.WhenAny(pending);
                    pending.Remove(finished);

                    var result = await finished;
                    if (result != null)
                    {
                        return result;
                    }
                }

                if (attempt < MaxAttempts)
                {
                    await Task.Delay(RetryDelay);
                }
            }

            throw new OverpassUnavailableException();
        }

        // Ein einzelner Overpass-Server. Gibt null zurück, wenn er fehlschlägt.
        private static async Task<List<ParkingCandidate>?> TryPostOverpassAsync(HttpClient client, string endpoint, string query)
        {
            try
            {
                var content = new FormUrlEncodedContent(new Dictionary<string, string> { { "data", query } });
                using var response = await client.PostAsync(endpoint, content);
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                var jsonString = await response.Content.ReadAsStringAsync();
                return ParseOverpassElements(jsonString);
            }
            catch
            {
                return null;
            }
        }

        private static List<ParkingCandidate> ParseOverpassElements(string jsonString)
        {
            using var doc = JsonDocument.Parse(jsonString);

            var result = new List<ParkingCandidate>();
            if (!doc.RootElement.TryGetProperty("elements", out var elements))
            {
                return result;
            }

            foreach (var element in elements.EnumerateArray())
            {
                double pLat = 0, pLon = 0;

                if (element.TryGetProperty("lat", out var latProp))
                {
                    pLat = latProp.GetDouble();
                    pLon = element.GetProperty("lon").GetDouble();
                }
                else if (element.TryGetProperty("center", out var centerProp))
                {
                    pLat = centerProp.GetProperty("lat").GetDouble();
                    pLon = centerProp.GetProperty("lon").GetDouble();
                }

                string name = "P+R Parkplatz";
                JsonElement tags = default;
                bool hasTags = element.TryGetProperty("tags", out tags);

                if (hasTags && tags.TryGetProperty("name", out var nameProp))
                {
                    name = nameProp.GetString() ?? name;
                }

                if (pLat != 0 && pLon != 0)
                {
                    var candidate = new ParkingCandidate(name, pLat, pLon, 0, 0);
                    if (hasTags)
                    {
                        ApplyTags(candidate, tags);
                    }
                    result.Add(candidate);
                }
            }

            return result;
        }

        // Fahrzeiten aller Parkplätze in einer einzigen OSRM-Anfrage holen
        private static void ApplyTags(ParkingCandidate candidate, JsonElement tags)
        {
            string fee = TagValue(tags, "fee");
            string charge = TagValue(tags, "charge");

            if (charge != "" || fee == "yes")
            {
                candidate.FeeStatus = "paid";
                candidate.FeeDescription = charge != "" ? charge : "gebührenpflichtig";
            }
            else if (fee == "no")
            {
                candidate.FeeStatus = "free";
                candidate.FeeDescription = "kostenlos";
            }

            candidate.OpeningHours = NullIfEmpty(TagValue(tags, "opening_hours"));
            candidate.Capacity = NullIfEmpty(TagValue(tags, "capacity"));
            candidate.Operator = NullIfEmpty(TagValue(tags, "operator"));
        }

        private static string TagValue(JsonElement tags, string key)
        {
            return tags.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? ""
                : "";
        }

        private static string? NullIfEmpty(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        private static async Task LoadDriveDurationsAsync(HttpClient client, double lat, double lon, List<ParkingCandidate> candidates)
        {
            string coordinates = $"{lon.ToString(CultureInfo.InvariantCulture)},{lat.ToString(CultureInfo.InvariantCulture)}";
            foreach (var cand in candidates)
            {
                coordinates += $";{cand.Lon.ToString(CultureInfo.InvariantCulture)},{cand.Lat.ToString(CultureInfo.InvariantCulture)}";
            }

            try
            {
                var response = await client.GetAsync($"https://router.project-osrm.org/table/v1/driving/{coordinates}?sources=0");
                if (!response.IsSuccessStatusCode) return;

                var json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("durations", out var durations)) return;
                if (durations.ValueKind != JsonValueKind.Array || durations.GetArrayLength() == 0) return;

                var row = durations[0];
                for (int i = 0; i < candidates.Count; i++)
                {
                    if (i + 1 < row.GetArrayLength() && row[i + 1].ValueKind == JsonValueKind.Number)
                    {
                        candidates[i].DriveDurationSeconds = row[i + 1].GetDouble();
                    }
                }
            }
            catch
            {
                // Ohne Fahrzeiten bleibt DriveDurationSeconds = 0
            }
        }

        // ---------- Direkte Autofahrt ----------
        private async Task<DirectCarRoute?> GetDirectCarRouteAsync(double lat, double lon, double destLat, double destLon)
        {
            var client = _clientFactory.CreateClient();
            // Der öffentliche OSRM-Server lehnt Anfragen ohne User-Agent mit 403 ab
            client.Timeout = TimeSpan.FromSeconds(8);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("ParkAndRideApp/1.0 (https://github.com/parkyapp)");
            string url = $"https://router.project-osrm.org/route/v1/driving/" +
                         $"{lon.ToString(CultureInfo.InvariantCulture)},{lat.ToString(CultureInfo.InvariantCulture)};" +
                         $"{destLon.ToString(CultureInfo.InvariantCulture)},{destLat.ToString(CultureInfo.InvariantCulture)}?overview=false";

            Console.WriteLine($"[DEBUG] Rufe OSRM Direkt-Route auf: {url}");

            try
            {
                var response = await client.GetAsync(url);
                Console.WriteLine($"[DEBUG] OSRM Status Code: {response.StatusCode}");

                if (!response.IsSuccessStatusCode)
                {
                    // Fallback: Fahrzeit über den Table-Endpunkt (funktioniert, wenn /route abgelehnt wird)
                    return await GetDirectCarRouteViaTableAsync(client, lat, lon, destLat, destLon);
                }

                var json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);

                if (doc.RootElement.TryGetProperty("routes", out var routes) && routes.GetArrayLength() > 0)
                {
                    var first = routes[0];
                    double duration = first.GetProperty("duration").GetDouble();
                    double distance = first.GetProperty("distance").GetDouble();

                    Console.WriteLine($"[DEBUG] Erfolg! Dauer: {duration}s, Distanz: {distance}m");
                    return new DirectCarRoute(duration, distance);
                }
                else
                {
                    Console.WriteLine("[DEBUG] Keine 'routes' im OSRM-JSON gefunden!");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FEHLER beim Abrufen der direkten Autofahrt]: {ex.Message}");
            }

            return null;
        }
    
        // Fahrzeit Start → Ziel über den Table-Endpunkt (ohne Distanz)
        private static async Task<DirectCarRoute?> GetDirectCarRouteViaTableAsync(HttpClient client, double lat, double lon, double destLat, double destLon)
        {
            string coordinates = $"{lon.ToString(CultureInfo.InvariantCulture)},{lat.ToString(CultureInfo.InvariantCulture)};" +
                                 $"{destLon.ToString(CultureInfo.InvariantCulture)},{destLat.ToString(CultureInfo.InvariantCulture)}";
            string url = $"https://router.project-osrm.org/table/v1/driving/{coordinates}?sources=0&destinations=1";
            try
            {
                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("durations", out var durations)) return null;
                if (durations.ValueKind != JsonValueKind.Array || durations.GetArrayLength() == 0) return null;

                var value = durations[0][0];
                if (value.ValueKind != JsonValueKind.Number) return null;

                double duration = value.GetDouble();
                Console.WriteLine($"[DEBUG] Direkt-Fahrzeit über Table: {duration}s");
                return new DirectCarRoute(duration, 0);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FEHLER Table-Fallback]: {ex.Message}");
                return null;
            }
        }
}
}