using Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    /// <summary>
    /// HTTP-Endpunkt für die Parkplatzsuche: GET api/parkandride
    /// </summary>
    [ApiController]
    [Route("api/parkandride")]
    public class ParkAndRideController : ControllerBase
    {
        private readonly ParkAndRideService _parkAndRideService;

        public ParkAndRideController(ParkAndRideService parkAndRideService)
        {
            _parkAndRideService = parkAndRideService;
        }

        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] double lat,
            [FromQuery] double lon,
            [FromQuery] double? destLat,
            [FromQuery] double? destLon,
            [FromQuery] double? weightSpeed)
        {
            try
            {
                var result = await _parkAndRideService.GetParkingsAsync(
                    lat, lon, destLat, destLon, weightSpeed ?? 0.5);

                return Ok(result);
            }
            catch (OverpassUnavailableException ex)
            {
                return Problem(ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\n[KRITISCHER FEHLER]: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
                return Problem($"Serverfehler: {ex.Message}");
            }
        }
    }
}