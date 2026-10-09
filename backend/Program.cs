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

        if (response == null)
        {
            return Results.Problem("Fehler bei der Abfrage der Overpass API.");
        }

        var jsonString = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(jsonString);

        if (!doc.RootElement.TryGetProperty("elements", out var elements))
        {
            return Results.Ok(new { directCarRoute = (object?)null, parkings = new List<ParkingCandidate>() });
        }

        var rawCandidates = new List<ParkingCandidate>();

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
            if (element.TryGetProperty("tags", out var tags) && tags.TryGetProperty("name", out var nameProp))
            {
                name = nameProp.GetString() ?? name;
            }

            if (pLat != 0 && pLon != 0)
            {
                rawCandidates.Add(new ParkingCandidate(name, pLat, pLon, 0, 0));
            }
        }

        if (rawCandidates.Count == 0)
        {
            return Results.Ok(new { directCarRoute = (object?)null, parkings = new List<ParkingCandidate>() });
        }

        var osrmCandidates = rawCandidates.Take(25).ToList();
        string coordinatesString = $"{lonStr},{latStr}";
        foreach (var cand in osrmCandidates)
        {
            string cLat = cand.Lat.ToString(CultureInfo.InvariantCulture);
            string cLon = cand.Lon.ToString(CultureInfo.InvariantCulture);
            coordinatesString += $";{cLon},{cLat}";
        }

        string osrmUrl = $"https://router.project-osrm.org/table/v1/driving/{coordinatesString}?sources=0";

        try
        {
            var osrmResponse = await client.GetAsync(osrmUrl);
            if (osrmResponse.IsSuccessStatusCode)
            {
                var osrmJson = await osrmResponse.Content.ReadAsStringAsync();
                using var osrmDoc = JsonDocument.Parse(osrmJson);

                if (osrmDoc.RootElement.TryGetProperty("durations", out var durations))
                {
                    var durationArray = durations[0];

                    for (int i = 0; i < osrmCandidates.Count; i++)
                    {
                        if (i + 1 < durationArray.GetArrayLength() && durationArray[i + 1].ValueKind == JsonValueKind.Number)
                        {
                            osrmCandidates[i].DriveDurationSeconds = durationArray[i + 1].GetDouble();
                        }
                    }
                }
            }
        }
        catch { }

        candidates = osrmCandidates
            .Where(c => c.DriveDurationSeconds > 0)
            .OrderBy(c => c.DriveDurationSeconds)
            .Take(15)
            .ToList();

        if (candidates.Count == 0)
        {
            candidates = rawCandidates.Take(15).ToList();
        }

        cache.Set(cacheKey, candidates, TimeSpan.FromMinutes(30));
    }

    DirectCarRoute? directCarRoute = null;
    if (destLat.HasValue && destLon.HasValue)
    {
        var client = clientFactory.CreateClient();
        string sLat = lat.ToString(CultureInfo.InvariantCulture);
        string sLon = lon.ToString(CultureInfo.InvariantCulture);
        string dLat = destLat.Value.ToString(CultureInfo.InvariantCulture);
        string dLon = destLon.Value.ToString(CultureInfo.InvariantCulture);

        string carRouteUrl = $"https://router.project-osrm.org/route/v1/driving/{sLon},{sLat};{dLon},{dLat}?overview=false";

        try
        {
            var carRes = await client.GetAsync(carRouteUrl);
            if (carRes.IsSuccessStatusCode)
            {
                var carJson = await carRes.Content.ReadAsStringAsync();
                using var carDoc = JsonDocument.Parse(carJson);
                if (carDoc.RootElement.TryGetProperty("routes", out var routes) && routes.GetArrayLength() > 0)
                {
                    var firstRoute = routes[0];
                    double duration = firstRoute.GetProperty("duration").GetDouble();
                    double distance = firstRoute.GetProperty("distance").GetDouble();
                    directCarRoute = new DirectCarRoute(duration, distance);
                }
            }
        }
        catch { }
    }
    double wSpeed = weightSpeed ?? 0.5;
    double wTransfers = 1.0 - wSpeed;

    foreach (var cand in candidates)
    {

        double durationMinutes = cand.DriveDurationSeconds / 60.0;
        
    
        cand.Score = (wSpeed * durationMinutes) + (wTransfers * (cand.Transfers * 10));
    }

  
    var sortedCandidates = candidates.OrderBy(c => c.Score).ToList();

    return Results.Ok(new
    {
        directCarRoute = directCarRoute,
        parkings = sortedCandidates
    });
});

app.Run();

public class ParkingCandidate
{
    public string Name { get; set; }
    public double Lat { get; set; }
    public double Lon { get; set; }
    public double DriveDurationSeconds { get; set; }
    public double DriveDistanceMeters { get; set; }
    public int Transfers { get; set; } = 1;
    public double Score { get; set; }

    public ParkingCandidate(string name, double lat, double lon, double driveDurationSeconds, double driveDistanceMeters)
    {
        Name = name;
        Lat = lat;
        Lon = lon;
        DriveDurationSeconds = driveDurationSeconds;
        DriveDistanceMeters = driveDistanceMeters;
    }
}

public class DirectCarRoute
{
    public double DurationSeconds { get; set; }
    public double DistanceMeters { get; set; }

    public DirectCarRoute(double durationSeconds, double distanceMeters)
    {
        DurationSeconds = durationSeconds;
        DistanceMeters = distanceMeters;
    }
}