using System;
using System.Collections.Generic;

namespace Backend.Models;

/// <summary>
/// Anfrage des Frontends für die Berechnung der Gesamtrouten
/// </summary>
public class RouteRequest
{
    /// <summary>Breitengrad des Startpunkts</summary>
    public double OriginLat { get; set; }

    /// <summary>Längengrad des Startpunkts</summary>
    public double OriginLon { get; set; }

    /// <summary>Breitengrad des Ziels</summary>
    public double TargetLat { get; set; }

    /// <summary>Längengrad des Ziels</summary>
    public double TargetLon { get; set; }

    /// <summary>Gewünschte Abfahrtszeit (ISO-Format)</summary>
    public DateTimeOffset DepartureTime { get; set; }

    /// <summary>
    /// Ausgewählte VBB-Verkehrsmittel, z. B. "subway", "bus", "regional".
    /// Null oder leer bedeutet: alle Verkehrsmittel.
    /// </summary>
    public List<string>? Products { get; set; }
}