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
    /// Adressvorschläge über Photon. Die Anfrage läuft über das Backend,
    /// dadurch entfallen CORS-Probleme im Browser und die Ergebnisse werden zwischengespeichert.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class GeocodeController : ControllerBase
    {
        private const int MinChars = 3;
        private const int MaxChars = 120;

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

            var client = _clientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("ParkAndRideApp/1.0 (https://github.com/parkyapp)");

            string url = "https://photon.komoot.io/api/?q=" + Uri.EscapeDataString(query)
                + "&limit=10&lang=de&lat=52.52&lon=13.405&layer=house&layer=street";

            try
            {
                using var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode(502, $"Adressdienst antwortet mit {(int)response.StatusCode}.");
                }

                var json = await response.Content.ReadAsStringAsync();
                var labels = ParseLabels(json);

                _cache.Set(cacheKey, labels, TimeSpan.FromHours(6));
                return Ok(labels);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FEHLER Adressvorschläge]: {ex.Message}");
                return StatusCode(502, "Adressdienst nicht erreichbar.");
            }
        }

        private static List<string> ParseLabels(string json)
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

                string osmKey = Str(props, "osm_key");
                if (PoiKeys.Contains(osmKey)) continue;

                string label = FormatLabel(props);
                if (label == "" || !seen.Add(label)) continue;

                labels.Add(label);
            }

            return labels;
        }

        private static string FormatLabel(JsonElement props)
        {
            string street = JoinNonEmpty(" ", Str(props, "street"), Str(props, "housenumber"));
            string name = Str(props, "name");
            string place = name != "" && name != Str(props, "street") && name != street ? name : "";
            string cityPart = FirstNonEmpty(
                Str(props, "city"), Str(props, "town"), Str(props, "village"), Str(props, "district"));
            string city = JoinNonEmpty(" ", Str(props, "postcode"), cityPart);

            return JoinNonEmpty(", ", place, street, city);
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