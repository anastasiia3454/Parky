using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

var app = builder.Build();
app.UseCors();

string[] overpassEndpoints = new[]
{
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
};

app.MapGet("/api/parkandride", async (
    double lat, 
    double lon, 
    double? destLat, 
    double? destLon, 
    double? weightSpeed, 
    IHttpClientFactory clientFactory, 
    IMemoryCache cache) =>
{
    string cacheKey = $"pr_eval_{Math.Round(lat, 3)}_{Math.Round(lon, 3)}";

    if (!cache.TryGetValue(cacheKey, out List<ParkingCandidate>? candidates) || candidates == null)
    {
        var client = clientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(20);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("ParkAndRideApp/1.0 (https://github.com/parkyapp)");

        string latStr = lat.ToString(CultureInfo.InvariantCulture);
        string lonStr = lon.ToString(CultureInfo.InvariantCulture);

        string overpassQuery = $"[out:json][timeout:15];(node[\"park_ride\"=\"yes\"](around:20000,{latStr},{lonStr});way[\"park_ride\"=\"yes\"](around:20000,{latStr},{lonStr}););out center;";

        HttpResponseMessage? response = null;

        foreach (var endpoint in overpassEndpoints)
        {
            try
            {
                var formData = new Dictionary<string, string> { { "data", overpassQuery } };
                var content = new FormUrlEncodedContent(formData);
                var res = await client.PostAsync(endpoint, content);
                if (res.IsSuccessStatusCode)
                {
                    response = res;
                    break;
                }
            }
            catch { continue; }
        }
    }
});