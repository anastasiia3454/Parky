using System;

namespace Backend.Models;
/// <summary>
/// Stellt die Suchanfrage dar, die vom Frontend an das Backend gesendet wird
/// </summary>

public class RouteRequest
{
    /// <summary>
    /// Breitgrad des Startpunkts
    /// </summary>
    public double OriginLat { get; set; }
    /// <summary>
    /// Längegrad des Startpunkts
    /// </summary>
    public double OriginLon { get; set; }

    /// <summary>
    /// Breitgrad des Zielorts
    /// </summary>
    public double TargetLat { get; set; }

    /// <summary>
    /// Längegrad des Tielorts
    /// </summary>
    public double TargetLon { get; set; }

    /// <summary>
    /// Geplante Abfahrtszeit für die Routberechnung
    /// </summary>
    public DateTimeOffset DepartureTime { get; set; }
}
