using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers
{
    /// <summary>
    /// Berechnet die Rückfahrt: Fußweg zur Haltestelle am Ziel, ÖPNV bis zum Parkplatz,
    /// dann mit dem Auto nach Hause. Die Fahrzeit mit dem Auto entspricht der Hinfahrt.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class ReturnRouteController : ControllerBase
    {
        private readonly TransitService _transitService;

        public ReturnRouteController(TransitService transitService)
        {
            _transitService = transitService;
        }

        [HttpPost("calculate")]
        public async Task<IActionResult> Calculate([FromBody] ReturnRouteRequest request)
        {
            if (request == null)
            {
                return BadRequest("Ungültige Anfrage.");
            }

            var stop = await _transitService.GetNearbyStopAsync(request.TargetLat, request.TargetLon);
            if (stop == null)
            {
                return NotFound("Keine Haltestelle am Ziel gefunden.");
            }

            double walkToStopKm = CalculateHaversineDistance(
                request.TargetLat, request.TargetLon, stop.Lat, stop.Lon);
            int startWalk = Math.Max(1, WalkingMinutesFor(walkToStopKm));
            var departure = request.DepartureTime.AddMinutes(startWalk);

            var connection = await _transitService.GetConnectionAsync(
                stop.Id, request.ParkingLat, request.ParkingLon, departure, request.Products);
            if (connection == null)
            {
                return NotFound("Keine Rückfahrt zum Parkplatz gefunden.");
            }

            bool filterActive = request.Products is { Count: > 0 };
            if (filterActive && !connection.MatchesProductFilter)
            {
                return NotFound("Keine Rückfahrt mit der gewählten Verkehrsart gefunden.");
            }

            double walkToCarKm = CalculateHaversineDistance(
                connection.ArrivalStopLat, connection.ArrivalStopLon,
                request.ParkingLat, request.ParkingLon);
            int endWalk = Math.Max(1, WalkingMinutesFor(walkToCarKm));

            var legs = new List<TransitLeg>
            {
                new TransitLeg
                {
                    IsWalk = true,
                    FromName = "Ziel",
                    ToName = stop.Name,
                    Minutes = startWalk
                }
            };
            legs.AddRange(connection.Legs);
            legs.Add(new TransitLeg
            {
                IsWalk = true,
                FromName = "Haltestelle",
                ToName = request.DriveMinutes > 0 ? "Parkplatz" : "Zuhause",
                Minutes = endWalk
            });

            var arrivalAtParking = departure.AddMinutes(connection.DurationMinutes + endWalk);

            return Ok(new ReturnRouteResult
            {
                Legs = legs,
                StartWalkingMinutes = startWalk,
                TransitMinutes = connection.DurationMinutes,
                WalkingMinutes = endWalk,
                DepartureFromTarget = request.DepartureTime,
                ArrivalAtParking = arrivalAtParking,
                DriveHomeMinutes = request.DriveMinutes,
                ArrivalHome = arrivalAtParking.AddMinutes(request.DriveMinutes)
            });
        }

        private static int WalkingMinutesFor(double distanceKm)
        {
            return (int)Math.Ceiling(distanceKm * 0.15 * 12.0);
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
}