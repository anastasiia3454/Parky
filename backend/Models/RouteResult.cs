namespace Backend.Models;

/// <summary>
/// Repräsentiert eine vollständig berechnete Intermodal-Route
/// die als Ergebnis an das Frontend geschikt wird
/// </summary>
public class RouteResult
{
    // --------------Parkplatz-Informationen--------------------

    /// <summary>
    /// Name des P+R Parkplatzes
    /// </summary>
    public string ParkingName { get; set; } = "";

    /// <summary>
    /// Breitengrad des Parkplatzes für die Karten-Markierung
    /// </summary>
    public double ParkingLat { get; set; }

    /// <summary>
    /// Längengrad des Parkplatzes für die Karten-Markierung
    /// </summary>
    public double ParkingLon { get; set; }

    // ---------Ziel-Haltestelle-----------------------------------

    /// <summary>
    /// Breitengrad der Haltestelle. an der Nutzer aus dem ÖPNV aussteigt
    /// </summary>
    public double TargetStopLat { get; set; }
    /// <summary>
    /// Längengrad der Haltestelle, an der Nutzer aus dem ÖPNV aussteigt
    /// </summary>
    public double TargetStopLon { get; set; }

    //---------------Reisezeiten (in Minuten)----------------------------

    /// <summary>
    /// Dauer der Autofahrt vom Startpunkt zum P+R Parkplatz
    /// </summary>
    public int DriveMinutes { get; set; }

    /// <summary>
    /// Feste Zeit für das Parken und den Weg zum Bahnsteig (5 Minuten)
    /// </summary>
    public int ParkingBufferMinutes { get; set; }

    /// <summary>
    /// Reine Fahrzeit mit ÖPNV
    /// </summary>
    public int TransitMinutes { get; set; }

    /// <summary>
    /// Dauer des Fußwegs von der Ausstiegshaltestelle bis zum finalen Ziel
    /// </summary>
    public int WalkingMinutes { get; set; }

    /// <summary>
    /// Automatisch berechnete Gesamtdauer aller Reiseabschnitte
    /// </summary>
    public int TotalMinutes => DriveMinutes + ParkingBufferMinutes + TransitMinutes + WalkingMinutes;

    //-----------------------Karten Visualisierung-------------------------

    /// <summary>
    /// Kodierte Linie für die Autofahrt auf der Karte
    /// </summary>
    public string PolylineDrive { get; set; } = string.Empty;

    /// <summary>
    /// Kodierte Linie für die ÖPNV Fahrt auf der Karte
    /// </summary>
    public string PolylineTransit { get; set; } = string.Empty;

}