using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RouteController : ControllerBase
    {
        private readonly TransitService _transitService;
        private readonly IHttpClientFactory _clientFactory;

        // IHttpClientFactory injizieren, um den Endpunkt von Person 1 aufrufen zu können
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

            // 1. Die Parkplätze von Person 1 (aus Program.cs /api/parkandride) abfragen
            var client = _clientFactory.CreateClient();
            
            // Aufruf des Endpunkts aus Program.cs mit den Start-Koordinaten aus dem Request
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

            // 2. Durch alle gefundenen Parkplätze von Person 1 iterieren
            foreach (var parking in pnrResponse.Parkings)
            {
                // Autofahrtzeit in Minuten aus der OSRM-Berechnung von Person 1 übernehmen
                int driveMinutes = Math.Max(3, (int)Math.Ceiling(parking.DriveDurationSeconds / 60.0));

                // Nächstgelegene ÖPNV-Haltestelle am Parkplatz suchen
                var stop = await _transitService.GetNearbyStopAsync(parking.Lat, parking.Lon);
                if (stop == null) continue;

                // ÖPNV-Abfahrtszeit = Startzeit + Autofahrt + 5 Min Park-Puffer
                var transitDeparture = request.DepartureTime.AddMinutes(driveMinutes + 5);

                // ÖPNV-Verbindung über VBB-API abfragen
                var connection = await _transitService.GetConnectionAsync(stop.Id, request.TargetLat, request.TargetLon, transitDeparture);
                if (connection == null) continue;

                // Fußweg vom Ausstieg zum Ziel berechnen (Haversine)
                double walkDistanceKm = CalculateHaversineDistance(parking.Lat, parking.Lon, request.TargetLat, request.TargetLon);
                int walkingMinutes = Math.Max(2, (int)Math.Ceiling(walkDistanceKm * 0.15 * 12.0));

                // Route zum Ergebnis hinzufügen
                results.Add(new RouteResult
                {
                    ParkingName = parking.Name,
                    DriveMinutes = driveMinutes,
                    ParkingBufferMinutes = 5,
                    TransitMinutes = connection.DurationMinutes,
                    WalkingMinutes = walkingMinutes,
                    PolylineDrive = "",
                    PolylineTransit = connection.Polyline
                });
            }

            // Nach schnellster Gesamtzeit sortieren und die besten 3 zurückgeben
            var bestRoutes = results.OrderBy(r => r.TotalMinutes).Take(3).ToList();

            if (!bestRoutes.Any())
            {
                return NotFound("Keine passenden Routen gefunden.");
            }

            return Ok(bestRoutes);
        }

        // Hilfsmethode: Entfernung zwischen zwei Punkten auf der Erde in KM
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

    // Hilfsklassen zum Einlesen der JSON-Antwort aus Program.cs (Person 1)
    public class ParkAndRideResponse
    {
        public List<ParkingCandidateDto>? Parkings { get; set; }
    }

    public class ParkingCandidateDto
    {
        public string Name { get; set; } = string.Empty;
        public double Lat { get; set; }
        public double Lon { get; set; }
        public double DriveDurationSeconds { get; set; }
    }
}