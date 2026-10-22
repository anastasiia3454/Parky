using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Backend.Models;
using Backend.Services;
using System.Text.Json.Serialization;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RouteController : ControllerBase
    {
        private readonly TransitService _transitService;
        private readonly IHttpClientFactory _clientFactory;

        public RouteController(TransitService transitService, IHttpClientFactory clientFactory)
        {
            _transitService = transitService;
            _clientFactory = clientFactory;
        }

        [HttpPost("calculate")]
        public async Task<IActionResult> CalculateRoute([FromBody] RouteRequest request)
        {
            if (request == null)
            {
                return BadRequest("Ungültige Anfrage.");
            }

            var client = _clientFactory.CreateClient();
            string pnrUrl = $"http://localhost:5000/api/parkandride?lat={request.OriginLat.ToString(System.Globalization.CultureInfo.InvariantCulture)}&lon={request.OriginLon.ToString(System.Globalization.CultureInfo.InvariantCulture)}";

            ParkAndRideResponse? pnrResponse = null;
            try
            {
                pnrResponse = await client.GetFromJsonAsync<ParkAndRideResponse>(pnrUrl);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Fehler beim Abrufen der Parkplätze: {ex.Message}");
            }

            if (pnrResponse == null || pnrResponse.Parkings == null || !pnrResponse.Parkings.Any())
            {
                return NotFound("Keine verfügbaren P+R Parkplätze in der Nähe gefunden.");
            }

            var results = new List<RouteResult>();

            foreach (var parking in pnrResponse.Parkings)
            {
                int driveMinutes = Math.Max(3, (int)Math.Ceiling(parking.DriveDurationSeconds / 60.0));

                // 1. Haltestelle am Parkplatz suchen
                var stop = await _transitService.GetNearbyStopAsync(parking.Lat, parking.Lon);
                if (stop == null) continue;

                var transitDeparture = request.DepartureTime.AddMinutes(driveMinutes + 5);

                // 2. ÖPNV-Verbindung berechnen
                var connection = await _transitService.GetConnectionAsync(stop.Id, request.TargetLat, request.TargetLon, transitDeparture);
                if (connection == null) continue;

                // 3. Fußweg berechnen ab Ausstiegshaltestelle
                double walkDistanceKm = CalculateHaversineDistance(
                    connection.ArrivalStopLat, 
                    connection.ArrivalStopLon, 
                    request.TargetLat, 
                    request.TargetLon
                );
                int walkingMinutes = Math.Max(2, (int)Math.Ceiling(walkDistanceKm * 0.15 * 12.0));

                results.Add(new RouteResult
                {
                    ParkingName = parking.Name,
                    ParkingLat = parking.Lat,
                    ParkingLon = parking.Lon,
                    TargetStopLat = connection.ArrivalStopLat,
                    TargetStopLon = connection.ArrivalStopLon,
                    DriveMinutes = driveMinutes,
                    ParkingBufferMinutes = 5,
                    TransitMinutes = connection.DurationMinutes,
                    WalkingMinutes = walkingMinutes,
                    PolylineDrive = "",
                    PolylineTransit = connection.Polyline
                });
            }

            // Falls keine Route mit ÖPNV gefunden wurde, leeres Array zurückgeben statt 404
            if (!results.Any())
            {
                return Ok(new List<RouteResult>());
            }

            var bestRoutes = results.OrderBy(r => r.TotalMinutes).Take(3).ToList();
            return Ok(bestRoutes);
        }

        private static double CalculateHaversineDistance(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371.0;
            double dLat = (lat2 - lat1) * Math.PI / 180.0;
            double dLon = (lon2 - lon1) * Math.PI / 180.0;
            double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                       Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) *
                       Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        }
    }

    public class ParkAndRideResponse
    {
        [JsonPropertyName("parkings")]
        public List<ParkingCandidateDto>? Parkings { get; set; }
    }

    public class ParkingCandidateDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("lat")]
        public double Lat { get; set; }

        [JsonPropertyName("lon")]
        public double Lon { get; set; }

        [JsonPropertyName("driveDurationSeconds")]
        public double DriveDurationSeconds { get; set; }
    }
}