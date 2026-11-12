using System;
using System.Collections.Generic;

namespace Backend.Models;

/// <summary>
/// Anfrage für die Rückfahrt: vom Ziel zurück zum P+R-Parkplatz, dann mit dem Auto nach Hause
/// </summary>
public class ReturnRouteRequest
{
    /// <summary>Breitengrad des Startpunkts (Zuhause)</summary>
    public double OriginLat { get; set; }

    /// <summary>Längengrad des Startpunkts (Zuhause)</summary>
    public double OriginLon { get; set; }

    /// <summary>Breitengrad des P+R-Parkplatzes, an dem das Auto steht</summary>
    public double ParkingLat { get; set; }

    /// <summary>Längengrad des P+R-Parkplatzes, an dem das Auto steht</summary>
    public double ParkingLon { get; set; }

    /// <summary>Breitengrad des Ziels</summary>
    public double TargetLat { get; set; }

    /// <summary>Längengrad des Ziels</summary>
    public double TargetLon { get; set; }

    /// <summary>Gewünschte Abfahrtszeit am Ziel</summary>
    public DateTimeOffset DepartureTime { get; set; }

    /// <summary>Fahrzeit mit dem Auto vom Parkplatz nach Hause (aus der Hinfahrt)</summary>
    public int DriveMinutes { get; set; }

    /// <summary>Ausgewählte VBB-Verkehrsmittel. Null oder leer: alle.</summary>
    public List<string>? Products { get; set; }
}