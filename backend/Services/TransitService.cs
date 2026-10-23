using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Backend.Models;

namespace Backend.Services
{
    /// <summary>
    /// Service zur Kommunikation mit der VBB API (Haltestellensuche, Verbindungen und Routen)
    /// </summary>
    public class TransitService
    {
        private readonly HttpClient _httpClient;

        // Haltestellen-Suchergebnisse werden zwischengespeichert, damit die Ziel-Haltestelle
        // nicht für jeden Parkplatz erneut abgefragt wird. Gilt für die Laufzeit des Servers.
        private static readonly ConcurrentDictionary<string, TransitStop> StopCache = new();

        /// <summary>
        /// Kostruktor für HttpClient und Logger
        /// </summary>
        /// <param name="httpClient"></param>
        public TransitService(HttpClient httpClient)
        {
            _httpClient = httpClient;
            if (!_httpClient.DefaultRequestHeaders.Contains("User-Agent"))
            {
                _httpClient.DefaultRequestHeaders.Add("User-Agent", "ParkAndRideOptimizer/1.0");
            }
        }

        /// <summary>
        /// Sucht NUR echte ÖPNV-Haltestellen (mit Cache für erfolgreiche Treffer)
        /// </summary>

        public async Task<TransitStop?> GetNearbyStopAsync(double Lat, double Lon)
        {
            string cacheKey = $"{Lat.ToString("F4", CultureInfo.InvariantCulture)},{Lon.ToString("F4", CultureInfo.InvariantCulture)}";

            if (StopCache.TryGetValue(cacheKey, out var cached))
            {
                return cached;
            }

            var stop = await FetchNearbyStopAsync(Lat, Lon);
            if (stop != null)
            {
                StopCache[cacheKey] = stop;
            }
            return stop;
        }

        /// <summary>
        /// Interne Methode zum Abfragen der VBB-API für Haltestellen in der Nähe
        /// </summary>
        /// </summary>
        private async Task<TransitStop?> FetchNearbyStopAsync(double Lat, double Lon)
        {
            try
            {
                string url = $"https://v6.vbb.transport.rest/locations/nearby?latitude={Lat.ToString(CultureInfo.InvariantCulture)}&longitude={Lon.ToString(CultureInfo.InvariantCulture)}&results=5&distance=2000&stops=true&poi=false";
                using var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var jsonDoc = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(jsonDoc);
                var root = doc.RootElement;

                if (root.ValueKind != JsonValueKind.Array) return null;

                foreach (var location in root.EnumerateArray())
                {
                    if (location.ValueKind != JsonValueKind.Object) continue;

                    string type = location.TryGetProperty("type", out var typeProp) && typeProp.ValueKind == JsonValueKind.String
                        ? typeProp.GetString() ?? ""
                        : "";

                    if ((type == "stop" || type == "station") && location.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
                    {
                        double stopLat = Lat;
                        double stopLon = Lon;

                        if (location.TryGetProperty("location", out var locProp) && locProp.ValueKind == JsonValueKind.Object)
                        {
                            if (locProp.TryGetProperty("latitude", out var latProp) && latProp.ValueKind == JsonValueKind.Number) stopLat = latProp.GetDouble();
                            if (locProp.TryGetProperty("longitude", out var lonProp) && lonProp.ValueKind == JsonValueKind.Number) stopLon = lonProp.GetDouble();
                        }

                        string name = location.TryGetProperty("name", out var nameProp) && nameProp.ValueKind == JsonValueKind.String
                            ? nameProp.GetString() ?? "Haltestelle"
                            : "Haltestelle";

                        return new TransitStop
                        {
                            Id = idProp.GetString()!,
                            Name = name,
                            Lat = stopLat,
                            Lon = stopLon
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

       /// <summary>
       /// Berechnet eine ÖPNV-Verbindung zwischen einer Start-Haltestelle und Ziel-Koordinaten
       /// </summary>
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

                // polylines=true: VBB liefert die Streckengeometrie jedes Legs mit
                string url = $"https://v6.vbb.transport.rest/journeys?from={stopId}&to={targetStop.Id}&departure={formattedDeparture}&results=1&polylines=true";

                using var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var jsonDoc = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(jsonDoc);
                var root = doc.RootElement;

                if (root.ValueKind != JsonValueKind.Object ||
                    !root.TryGetProperty("journeys", out var journeys) ||
                    journeys.ValueKind != JsonValueKind.Array ||
                    journeys.GetArrayLength() == 0)
                {
                    return null;
                }

                var firstJourney = journeys[0];
                if (firstJourney.ValueKind != JsonValueKind.Object) return null;

                if (!firstJourney.TryGetProperty("legs", out var legs) ||
                    legs.ValueKind != JsonValueKind.Array ||
                    legs.GetArrayLength() == 0)
                {
                    return null;
                }

                // 1. ZEIT: Abfahrt aus leg[0], Ankunft aus leg[last]
                int totalMinutes = 0;
                string lineName = "ÖPNV";

                var legList = new List<JsonElement>(legs.EnumerateArray());
                var firstLeg = legList[0];
                var lastLeg = legList[legList.Count - 1];

                // Ersten Fahrtabschnitt suchen (für LineName)
                foreach (var leg in legList)
                {
                    if (TryGetObject(leg, "line", out var line) &&
                        TryGetObject(line, "name", out var nameProp) &&
                        nameProp.ValueKind == JsonValueKind.String)
                    {
                        lineName = nameProp.GetString() ?? lineName;
                        break;
                    }
                }

                string? depStr = TryGetObject(firstLeg, "departure", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() : null;
                string? arrStr = TryGetObject(lastLeg, "arrival", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString() : null;

                if (DateTimeOffset.TryParse(depStr, out var depTime) && DateTimeOffset.TryParse(arrStr, out var arrTime))
                {
                    totalMinutes = Math.Max(1, (int)Math.Round((arrTime - depTime).TotalMinutes));
                    Console.WriteLine($"[DEBUG SUCCESS] ÖPNV-Fahrzeit von {stopId} nach {targetStop.Name}: {totalMinutes} Min.");
                }

                if (totalMinutes <= 0) return null;

                // 2. Geometrie für die Karte encodieren
                string encodedPolyline = "";
                try
                {
                    var points = ExtractLegCoordinates(legList);
                    encodedPolyline = EncodePolyline(points);
                    Console.WriteLine($"[DEBUG] Polyline-Punkte: {points.Count}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DEBUG] Polyline konnte nicht erzeugt werden: {ex.Message}");
                }

                return new TransitConnection
                {
                    DurationMinutes = totalMinutes,
                    LineName = lineName,
                    Polyline = encodedPolyline,
                    ArrivalStopLat = targetStop.Lat,
                    ArrivalStopLon = targetStop.Lon,
                    Legs = ParseLegs(legList)
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DEBUG] Exception in GetConnectionAsync: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Zerlegt die Legs einer VBB-Verbindung in lesbare Abschnitte (Linie oder Fußweg)
        /// </summary>
        public static List<TransitLeg> ParseLegs(IEnumerable<JsonElement> legs)
        {
            var result = new List<TransitLeg>();

            foreach (var leg in legs)
            {
                if (leg.ValueKind != JsonValueKind.Object) continue;

                var item = new TransitLeg
                {
                    IsWalk = leg.TryGetProperty("walking", out var walking) && walking.ValueKind == JsonValueKind.True,
                    Direction = StringOf(leg, "direction"),
                    FromName = NameOf(leg, "origin"),
                    ToName = NameOf(leg, "destination"),
                    Departure = StringOf(leg, "departure"),
                    Arrival = StringOf(leg, "arrival")
                };

                if (TryGetObject(leg, "line", out var line))
                {
                    item.LineName = StringOf(line, "name");
                    item.Product = StringOf(line, "product");
                }

                if (DateTimeOffset.TryParse(item.Departure, out var dep) && DateTimeOffset.TryParse(item.Arrival, out var arr))
                {
                    item.Minutes = Math.Max(0, (int)Math.Round((arr - dep).TotalMinutes));
                }

                result.Add(item);
            }

            return result;
        }

        // Liest einen String-Wert aus einem Objekt (leer, falls nicht vorhanden)
        private static string StringOf(JsonElement el, string name)
        {
            return el.ValueKind == JsonValueKind.Object &&
                   el.TryGetProperty(name, out var v) &&
                   v.ValueKind == JsonValueKind.String
                ? v.GetString() ?? ""
                : "";
        }

        // Liest den Namen eines Ortes, z. B. origin.name oder destination.name
        private static string NameOf(JsonElement el, string place)
        {
            return TryGetObject(el, place, out var p) ? StringOf(p, "name") : "";
        }

        // Sicherer Zugriff auf eine Objekt-Eigenschaft (wirft nie, auch wenn el kein Objekt ist)
        private static bool TryGetObject(JsonElement el, string name, out JsonElement value)
        {
            value = default;
            return el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out value);
        }

        // Liest alle Koordinaten aus legs[].polyline (GeoJSON, Format [lon, lat]).
        private static List<(double Lat, double Lon)> ExtractLegCoordinates(List<JsonElement> legs)
        {
            var points = new List<(double Lat, double Lon)>();
            int legIndex = 0;

            foreach (var leg in legs)
            {
                try
                {
                    if (TryGetObject(leg, "polyline", out var poly) &&
                        TryGetObject(poly, "features", out var features) &&
                        features.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var feature in features.EnumerateArray())
                        {
                            if (TryGetObject(feature, "geometry", out var geom) &&
                                TryGetObject(geom, "coordinates", out var coords))
                            {
                                CollectCoordinates(coords, points);
                            }
                        }
                    }
                    else
                    {
                        // Rohdaten-Ausschnitt, falls die Struktur nicht passt
                        Console.WriteLine($"[DEBUG] Leg {legIndex} ohne lesbare polyline: {Truncate(leg.GetRawText(), 300)}");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DEBUG] Leg {legIndex} Polyline-Fehler: {ex.Message} | {Truncate(leg.GetRawText(), 300)}");
                }

                legIndex++;
            }

            return points;
        }

        // Rekursiv: Ein Array, dessen erstes Element eine Zahl ist, ist eine Position [lon, lat].
        // Andernfalls wird in die Unterarrays abgestiegen. Funktioniert für Point, LineString und MultiLineString.
        private static void CollectCoordinates(JsonElement node, List<(double Lat, double Lon)> points)
        {
            if (node.ValueKind != JsonValueKind.Array) return;

            var items = new List<JsonElement>(node.EnumerateArray());
            if (items.Count == 0) return;

            if (items[0].ValueKind == JsonValueKind.Number)
            {
                if (items.Count < 2 || items[1].ValueKind != JsonValueKind.Number) return;

                double lon = items[0].GetDouble();
                double lat = items[1].GetDouble();

                // Doppelte Punkte an Abschnittsgrenzen überspringen
                if (points.Count > 0 && points[points.Count - 1].Lat == lat && points[points.Count - 1].Lon == lon) return;

                points.Add((lat, lon));
                return;
            }

            foreach (var child in items)
            {
                CollectCoordinates(child, points);
            }
        }

        /// <summary>
        /// Encodiert Koordinaten in das Google Polyline Format für die Leaflet-Karte.
        /// <summary/>
        public static string EncodePolyline(IList<(double Lat, double Lon)> points)
        {
            var sb = new StringBuilder();
            long prevLat = 0;
            long prevLon = 0;

            foreach (var p in points)
            {
                long lat = (long)Math.Round(p.Lat * 1e5);
                long lon = (long)Math.Round(p.Lon * 1e5);

                EncodeValue(lat - prevLat, sb);
                EncodeValue(lon - prevLon, sb);

                prevLat = lat;
                prevLon = lon;
            }

            return sb.ToString();
        }

        private static void EncodeValue(long value, StringBuilder sb)
        {
            value = value < 0 ? ~(value << 1) : (value << 1);

            while (value >= 0x20)
            {
                sb.Append((char)((0x20 | (value & 0x1f)) + 63));
                value >>= 5;
            }

            sb.Append((char)(value + 63));
        }

        private static string Truncate(string text, int max)
        {
            return text.Length <= max ? text : text.Substring(0, max) + "…";
        }
    }
}