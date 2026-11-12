using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace Backend.Controllers
{
    /// <summary>
    /// Adressvorschläge. Zuerst Photon, bei Fehler oder Timeout Nominatim.
    /// Die Abfrage läuft über das Backend, dadurch entfallen CORS-Probleme im Browser.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class GeocodeController : ControllerBase
    {
        private const int MinChars = 3;
        private const int MaxChars = 120;
        // Photon kurz warten lassen, dann direkt auf Nominatim ausweichen
        private static readonly TimeSpan PhotonTimeout = TimeSpan.FromSeconds(3);
        private static readonly TimeSpan NominatimTimeout = TimeSpan.FromSeconds(6);
        private const string UserAgent = "ParkAndRideApp/1.0 (https://github.com/parkyapp)";

        private static readonly HashSet<string> PoiKeys = new(StringComparer.OrdinalIgnoreCase)
        {
            "amenity", "shop", "tourism", "leisure", "office", "craft", "healthcare",
            "historic", "emergency", "natural", "sport", "aeroway", "man_made"
        };

        private readonly IHttpClientFactory _clientFactory;
        private readonly IMemoryCache _cache;

        public GeocodeController(IHttpClientFactory clientFactory, IMemoryCache cache)
        {
            _clientFactory = clientFactory;
            _cache = cache;
        }

        [HttpGet("suggest")]
        public async Task<IActionResult> Suggest([FromQuery] string? q)
        {
            string query = (q ?? "").Trim();
            if (query.Length < MinChars)
            {
                return Ok(new List<string>());
            }
            if (query.Length > MaxChars)
            {
                query = query.Substring(0, MaxChars);
            }

            string cacheKey = "geo_suggest_" + query.ToLowerInvariant();
            if (_cache.TryGetValue(cacheKey, out List<string>? cached) && cached != null)
            {
                return Ok(cached);
            }

            List<string>? labels = null;
            try
            {
                labels = await QueryPhotonAsync(query);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Adressvorschläge] Photon fehlgeschlagen: {ex.Message}");
            }

            if (labels == null)
            {
                try
                {
                    labels = await QueryNominatimAsync(query);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Adressvorschläge] Nominatim fehlgeschlagen: {ex.Message}");
                    return StatusCode(502, "Adressdienste sind gerade nicht erreichbar.");
                }
            }

            _cache.Set(cacheKey, labels, TimeSpan.FromHours(6));
            return Ok(labels);
        }

        private async Task<List<string>?> QueryPhotonAsync(string query)
        {
            var client = _clientFactory.CreateClient();
            client.Timeout = PhotonTimeout;
            client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);

            string url = "https://photon.komoot.io/api/?q=" + Uri.EscapeDataString(query)
                + "&limit=10&lang=de&lat=52.52&lon=13.405&layer=house&layer=street";

            using var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            return ParsePhoton(json);
        }

        private async Task<List<string>> QueryNominatimAsync(string query)
        {
            var client = _clientFactory.CreateClient();
            client.Timeout = NominatimTimeout;
            client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
            client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("de");

            string url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=de&limit=10&q="
                + Uri.EscapeDataString(query);

            using var response = await client.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            return ParseNominatim(json);
        }

        private static List<string> ParsePhoton(string json)
        {
            var labels = new List<string>();
            var seen = new HashSet<string>();

            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("features", out var features) ||
                features.ValueKind != JsonValueKind.Array)
            {
                return labels;
            }

            foreach (var feature in features.EnumerateArray())
            {
                if (!feature.TryGetProperty("properties", out var props) ||
                    props.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string country = Str(props, "countrycode");
                if (country != "" && !country.Equals("DE", StringComparison.OrdinalIgnoreCase)) continue;

                if (PoiKeys.Contains(Str(props, "osm_key"))) continue;

                string label = FormatPhotonLabel(props);
                if (label == "" || !seen.Add(label)) continue;

                labels.Add(label);
            }

            return labels;
        }

        private static string FormatPhotonLabel(JsonElement props)
        {
            string street = JoinNonEmpty(" ", Str(props, "street"), Str(props, "housenumber"));
            string name = Str(props, "name");
            string place = name != "" && name != Str(props, "street") && name != street ? name : "";
            string cityPart = FirstNonEmpty(
                Str(props, "city"), Str(props, "town"), Str(props, "village"), Str(props, "district"));
            string city = JoinNonEmpty(" ", Str(props, "postcode"), cityPart);

            return JoinNonEmpty(", ", place, street, city);
        }

        private static List<string> ParseNominatim(string json)
        {
            var labels = new List<string>();
            var seen = new HashSet<string>();

            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return labels;

            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (!item.TryGetProperty("address", out var addr) || addr.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string road = Str(addr, "road");
                string street = JoinNonEmpty(" ", road, Str(addr, "house_number"));
                string name = Str(item, "name");
                string place = name != "" && name != road && name != street ? name : "";
                string cityPart = FirstNonEmpty(
                    Str(addr, "city"), Str(addr, "town"), Str(addr, "village"), Str(addr, "suburb"));
                string city = JoinNonEmpty(" ", Str(addr, "postcode"), cityPart);

                string label = JoinNonEmpty(", ", place, street, city);
                if (label == "" || !seen.Add(label)) continue;

                labels.Add(label);
            }

            return labels;
        }

        private static string Str(JsonElement el, string name)
        {
            return el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString() ?? ""
                : "";
        }

        private static string JoinNonEmpty(string separator, params string[] parts)
        {
            return string.Join(separator, parts.Where(p => !string.IsNullOrEmpty(p)));
        }

        private static string FirstNonEmpty(params string[] parts)
        {
            return parts.FirstOrDefault(p => !string.IsNullOrEmpty(p)) ?? "";
        }
    }
}