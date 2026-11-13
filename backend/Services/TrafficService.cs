using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using System;
using System.Globalization;
using System.Text.Json;
using System.Threading.Tasks;

namespace Backend.Services
{
    /// <summary>Verkehrsfluss an einem Punkt: aktuelle und freie Geschwindigkeit</summary>
    public class FlowSample
    {
        public double CurrentSpeed { get; set; }
        public double FreeFlowSpeed { get; set; }
        public bool Closed { get; set; }
    }

    /// <summary>
    /// Verkehrsdaten von TomTom (Traffic Flow API). Der Schlüssel liegt auf dem Server,
    /// Antworten werden 10 Minuten zwischengespeichert, um das kostenlose Kontingent zu schonen.
    /// </summary>
    public class TrafficService
    {
        private static readonly TimeSpan CacheTime = TimeSpan.FromMinutes(10);

        private readonly IHttpClientFactory _clientFactory;
        private readonly IMemoryCache _cache;
        private readonly string _apiKey;

        public TrafficService(IHttpClientFactory clientFactory, IMemoryCache cache, IConfiguration configuration)
        {
            _clientFactory = clientFactory;
            _cache = cache;
            _apiKey = Environment.GetEnvironmentVariable("TOMTOM_API_KEY") ?? configuration["TomTom:ApiKey"] ?? "";
        }

        public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

        public async Task<FlowSample?> GetFlowAsync(double lat, double lon)
        {
            string cacheKey = $"flow_{lat.ToString("F3", CultureInfo.InvariantCulture)}_{lon.ToString("F3", CultureInfo.InvariantCulture)}";
            if (_cache.TryGetValue(cacheKey, out FlowSample? cached) && cached != null)
            {
                return cached;
            }

            var client = _clientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(5);

            string point = $"{lat.ToString(CultureInfo.InvariantCulture)},{lon.ToString(CultureInfo.InvariantCulture)}";
            string url = $"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={point}&unit=KMPH&key={_apiKey}";

            try
            {
                using var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                if (!doc.RootElement.TryGetProperty("flowSegmentData", out var seg)) return null;

                var sample = new FlowSample
                {
                    CurrentSpeed = seg.GetProperty("currentSpeed").GetDouble(),
                    FreeFlowSpeed = seg.GetProperty("freeFlowSpeed").GetDouble(),
                    Closed = seg.TryGetProperty("roadClosure", out var rc) && rc.ValueKind == JsonValueKind.True
                };

                _cache.Set(cacheKey, sample, CacheTime);
                return sample;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Verkehr] TomTom-Abfrage fehlgeschlagen: {ex.Message}");
                return null;
            }
        }
    }
}