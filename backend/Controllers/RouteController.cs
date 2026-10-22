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
    // Das ist die Schnittstelle für Routen
    [ApiController]
    [Route("api/[controller]")]
    public class RouteController : ControllerBase
    {
        private readonly TransitService _transitService;
        private readonly IHttpClientFactory _clientFactory;

        // Baut den Controller zusammen und holt Hilfs-Dienste
        public RouteController(TransitService transitService, IHttpClientFactory clientFactory)
        {
            _transitService = transitService;
            _clientFactory = clientFactory;
        }

        // Berechnet die besten Routen aus Auto + Bahn/Bus
        [HttpPost("calculate")]
        public async Task<IActionResult> CalculateRoute([FromBody] RouteRequest request)
        {
            // Prüft, ob Daten mitgeschickt wurden
            if (request == null)
            {
                return BadRequest("Ungültige Anfrage.");
            }

            // Holt Parkplätze von Person 1 (Lat und Lon mit Großbuchstaben im URL-Parameter)
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

            // Abbruch, wenn keine Parkplätze gefunden wurden
            if (pnrResponse == null || pnrResponse.Parkings == null || !pnrResponse.Parkings.Any())
            {
                return NotFound("Keine verfügbaren P+R Parkplätze in der Nähe gefunden.");
            }

            var results = new List<RouteResult>();

            // Rechnet für jeden Parkplatz die Gesamtzeit aus
            foreach (var parking in pnrResponse.Parkings)
            {
                // Auto-Fahrzeit in Minuten umrechnen
                int driveMinutes = Math.Max(3, (int)Math.Ceiling(parking.DriveDurationSeconds / 60.0));

                // Nächste Haltestelle am Parkplatz suchen (nutzt jetzt parking.Lat und parking.Lon)
                var stop = await _transitService.GetNearbyStopAsync(parking.Lat, parking.Lon);
                if (stop == null) continue;

                // Abfahrtszeit für die Bahn berechnen (Autozeit + 5 Min Parken)
                var transitDeparture = request.DepartureTime.AddMinutes(driveMinutes + 5);

                // Bahn-Verbindung suchen
                var connection = await _transitService.GetConnectionAsync(stop.Id, request.TargetLat, request.TargetLon, transitDeparture);
                if (connection == null) continue;

                // Fußweg zum Ziel berechnen (nutzt parking.Lat und parking.Lon)
                double walkDistanceKm = CalculateHaversineDistance(parking.Lat, parking.Lon, request.TargetLat, request.TargetLon);
                int walkingMinutes = Math.Max(2, (int)Math.Ceiling(walkDistanceKm * 0.15 * 12.0));

                // Fertige Route speichern
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

            // Nach Zeit sortieren und die 3 schnellsten Routen wählen
            var bestRoutes = results.OrderBy(r => r.TotalMinutes).Take(3).ToList();

            if (!bestRoutes.Any())
            {
                return NotFound("Keine passenden Routen gefunden.");
            }

            // Schickt die 3 besten Routen zurück
            return Ok(bestRoutes);
        }

        // Berechnet den Abstand zwischen zwei Punkten auf der Erde
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

    // Liest die Parkplatz-Antwort von Person 1
    public class ParkAndRideResponse
    {
        public List<ParkingCandidateDto>? Parkings { get; set; }
    }

    // Einzelner Parkplatz von Person 1 (Lat und Lon jetzt großgeschrieben)
    public class ParkingCandidateDto
    {
        public string Name { get; set; } = string.Empty;
        public double Lat { get; set; }
        public double Lon { get; set; }
        public double DriveDurationSeconds { get; set; }
    }
}