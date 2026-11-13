using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Backend.Services;

namespace Backend.Controllers
{
    /// <summary>
    /// Verkehrslage entlang der Strecke zwischen zwei Punkten (z. B. Start → P+R-Parkplatz).
    /// Es werden drei Punkte auf der Geraden abgefragt und mit der freien Fahrgeschwindigkeit verglichen.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class TrafficController : ControllerBase
    {
        private static readonly double[] SamplePositions = { 0.25, 0.5, 0.75 };

        private readonly TrafficService _traffic;

        public TrafficController(TrafficService traffic)
        {
            _traffic = traffic;
        }

        [HttpGet("drive")]
        public async Task<IActionResult> Drive(
            [FromQuery] double fromLat, [FromQuery] double fromLon,
            [FromQuery] double toLat, [FromQuery] double toLon)
        {
            if (!_traffic.IsConfigured)
            {
                return StatusCode(503, "Verkehrsdienst ist nicht konfiguriert.");
            }

            var samples = new List<FlowSample>();
            foreach (double f in SamplePositions)
            {
                double lat = fromLat + (toLat - fromLat) * f;
                double lon = fromLon + (toLon - fromLon) * f;
                var sample = await _traffic.GetFlowAsync(lat, lon);
                if (sample != null) samples.Add(sample);
            }

            if (samples.Count == 0)
            {
                return StatusCode(502, "Verkehrsdaten sind gerade nicht verfügbar.");
            }

            bool closed = samples.Any(s => s.Closed);
            var valid = samples.Where(s => s.FreeFlowSpeed > 0).ToList();
            double ratio = valid.Count == 0
                ? 1.0
                : valid.Average(s => Math.Min(1.0, s.CurrentSpeed / s.FreeFlowSpeed));

            string level;
            string label;
            if (closed)
            {
                level = "closed";
                label = "gesperrt";
            }
            else if (ratio >= 0.85)
            {
                level = "free";
                label = "flüssig";
            }
            else if (ratio >= 0.6)
            {
                level = "medium";
                label = "mittel";
            }
            else
            {
                level = "slow";
                label = "stockend";
            }

            return Ok(new
            {
                level,
                label,
                ratio = Math.Round(ratio, 2),
                samples = samples.Count
            });
        }
    }
}