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

            if (parkResult.Parkings.Count == 0)
            {
                return Ok(new List<RouteResult>());
            }

            var candidates = parkResult.Parkings.Take(MaxRoutesToCalculate).ToList();
            var semaphore = new SemaphoreSlim(MaxParallelTransitCalls);

            var tasks = candidates.Select(async parking =>
            {
                await semaphore.WaitAsync();
                try
                {
                    return await BuildRouteAsync(parking, request);
                }
                finally
                {
                    semaphore.Release();
                }
            });

            var built = await Task.WhenAll(tasks);
            var results = built.Where(r => r != null).Select(r => r!).ToList();

            if (results.Count == 0)
            {
                return Ok(new List<RouteResult>());
            }

            var bestRoutes = results.OrderBy(r => r.TotalMinutes).Take(3).ToList();
            return Ok(bestRoutes);
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
            int walkingMinutes = Math.Max(2, (int)Math.Ceiling(walkDistanceKm * 0.15 * 12.0));

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