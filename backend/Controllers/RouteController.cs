using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RouteController : ControllerBase
    {
        private const int MaxRoutesToCalculate = 6;
        private const int MaxParallelTransitCalls = 3;
        private const int MaxParkingRoutesToReturn = 3;
        private const int MaxStartStops = 3;

        private readonly TransitService _transitService;
        private readonly ParkAndRideService _parkAndRideService;

        public RouteController(TransitService transitService, ParkAndRideService parkAndRideService)
        {
            _transitService = transitService;
            _parkAndRideService = parkAndRideService;
        }

        [HttpPost("calculate")]
        public async Task<IActionResult> CalculateRoute([FromBody] RouteRequest request)
        {
            if (request == null)
            {
                return BadRequest("Ungültige Anfrage.");
            }

            ParkAndRideResult parkResult;
            try
            {
                parkResult = await _parkAndRideService.GetParkingsAsync(
                    request.OriginLat, request.OriginLon, null, null, 0.5);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Fehler beim Abrufen der Parkplätze: {ex.Message}");
            }

            var semaphore = new SemaphoreSlim(MaxParallelTransitCalls);

            var candidates = parkResult.Parkings.Take(MaxRoutesToCalculate).ToList();
            var tasks = candidates
                .Select(parking => RunLimitedAsync(semaphore, () => BuildRouteAsync(parking, request)))
                .ToList();

            // Reine ÖPNV-Verbindung ohne Auto, ab der Haltestelle am Startpunkt
            tasks.Add(RunLimitedAsync(semaphore, () => BuildTransitOnlyRouteAsync(request)));

            var built = await Task.WhenAll(tasks);
            var results = built.Where(r => r != null).Select(r => r!).ToList();

            // Passende Routen zuerst, danach nach Gesamtzeit. Erst danach wird begrenzt,
            // damit eine passende Route nicht von schnelleren, nicht passenden verdrängt wird.
            var parkingRoutes = results
                .Where(r => r.DriveMinutes > 0)
                .OrderByDescending(r => r.MatchesProductFilter)
                .ThenBy(r => r.TotalMinutes)
                .Take(MaxParkingRoutesToReturn);

            var transitRoutes = results
                .Where(r => r.DriveMinutes == 0)
                .OrderBy(r => r.TotalMinutes)
                .Take(1);

            return Ok(parkingRoutes.Concat(transitRoutes).ToList());
        }

        private static async Task<RouteResult?> RunLimitedAsync(SemaphoreSlim semaphore, Func<Task<RouteResult?>> work)
        {
            await semaphore.WaitAsync();
            try
            {
                return await work();
            }
            finally
            {
                semaphore.Release();
            }
        }

        private async Task<RouteResult?> BuildRouteAsync(ParkingCandidate parking, RouteRequest request)
        {
            int driveMinutes = Math.Max(3, (int)Math.Ceiling(parking.DriveDurationSeconds / 60.0));

            var stop = await _transitService.GetNearbyStopAsync(parking.Lat, parking.Lon);
            if (stop == null) return null;

            var transitDeparture = request.DepartureTime.AddMinutes(driveMinutes + 5);

            var connection = await _transitService.GetConnectionAsync(
                stop.Id, request.TargetLat, request.TargetLon, transitDeparture, request.Products);
            if (connection == null) return null;

            double walkDistanceKm = CalculateHaversineDistance(
                connection.ArrivalStopLat,
                connection.ArrivalStopLon,
                request.TargetLat,
                request.TargetLon);
            int walkingMinutes = Math.Max(2, WalkingMinutesFor(walkDistanceKm));

            return new RouteResult
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
                PolylineTransit = connection.Polyline,
                Legs = connection.Legs,
                FeeStatus = parking.FeeStatus,
                FeeDescription = parking.FeeDescription,
                MatchesProductFilter = connection.MatchesProductFilter
            };
        }

        // Verbindung ohne Auto: Fußweg zur nahen Haltestelle, dann ÖPNV bis zum Ziel.
        // Mehrere nahe Haltestellen werden geprüft, die schnellste passende Verbindung gewinnt.
        private async Task<RouteResult?> BuildTransitOnlyRouteAsync(RouteRequest request)
        {
            var stops = await _transitService.GetNearbyStopsAsync(request.OriginLat, request.OriginLon, MaxStartStops);

            RouteResult? best = null;
            foreach (var stop in stops)
            {
                var route = await BuildTransitFromStopAsync(stop, request);
                if (route != null && (best == null || route.TotalMinutes < best.TotalMinutes))
                {
                    best = route;
                }
            }
            return best;
        }

        private async Task<RouteResult?> BuildTransitFromStopAsync(TransitStop stop, RouteRequest request)
        {
            double walkToStartKm = CalculateHaversineDistance(
                request.OriginLat, request.OriginLon, stop.Lat, stop.Lon);
            int startWalkMinutes = Math.Max(1, WalkingMinutesFor(walkToStartKm));

            var departure = request.DepartureTime.AddMinutes(startWalkMinutes);
            var connection = await _transitService.GetConnectionAsync(
                stop.Id, request.TargetLat, request.TargetLon, departure, request.Products);
            if (connection == null) return null;

            bool filterActive = request.Products is { Count: > 0 };
            if (filterActive && !connection.MatchesProductFilter) return null;

            double walkToTargetKm = CalculateHaversineDistance(
                connection.ArrivalStopLat, connection.ArrivalStopLon, request.TargetLat, request.TargetLon);

            // Fußweg zur Haltestelle als eigener Abschnitt, damit die Details ihn zeigen
            var startWalkLeg = new TransitLeg
            {
                IsWalk = true,
                FromName = "Start",
                ToName = stop.Name,
                Departure = "",
                Arrival = "",
                Minutes = startWalkMinutes
            };
            var legs = new List<TransitLeg> { startWalkLeg };
            legs.AddRange(connection.Legs);

            return new RouteResult
            {
                ParkingName = $"ÖPNV ab {stop.Name}",
                ParkingLat = stop.Lat,
                ParkingLon = stop.Lon,
                TargetStopLat = connection.ArrivalStopLat,
                TargetStopLon = connection.ArrivalStopLon,
                DriveMinutes = 0,
                ParkingBufferMinutes = 0,
                StartWalkingMinutes = startWalkMinutes,
                TransitMinutes = connection.DurationMinutes,
                WalkingMinutes = Math.Max(2, WalkingMinutesFor(walkToTargetKm)),
                PolylineDrive = "",
                PolylineTransit = connection.Polyline,
                Legs = legs,
                FeeStatus = "unknown",
                FeeDescription = null,
                MatchesProductFilter = connection.MatchesProductFilter
            };
        }

        // Gleiche Gehzeit-Annahme wie bisher: 12 Minuten pro km mit Faktor 0,15
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