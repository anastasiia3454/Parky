namespace Backend.Models;

/// <summary>
/// Repräsentiert eine vollständig berechnete Intermodal-Route
/// die als Ergebnis an das Frontend geschickt wird
/// </summary>
public class RouteResult
{
    /// <summary>Name des P+R Parkplatzes</summary>
    public string ParkingName { get; set; } = "";

    /// <summary>Breitengrad des Parkplatzes</summary>
    public double ParkingLat { get; set; }

    /// <summary>Längengrad des Parkplatzes</summary>
    public double ParkingLon { get; set; }

    /// <summary>Breitengrad der Haltestelle, an der der Nutzer aus dem ÖPNV aussteigt</summary>
    public double TargetStopLat { get; set; }

    /// <summary>Längengrad der Haltestelle, an der der Nutzer aus dem ÖPNV aussteigt</summary>
    public double TargetStopLon { get; set; }

    /// <summary>Dauer der Autofahrt vom Start zum P+R Parkplatz</summary>
    public int DriveMinutes { get; set; }

    /// <summary>Feste Zeit für das Parken und den Weg zum Bahnsteig (5 Minuten)</summary>
    public int ParkingBufferMinutes { get; set; }

    /// <summary>Reine Fahrzeit mit dem ÖPNV</summary>
    public int TransitMinutes { get; set; }

    /// <summary>Dauer des Fußwegs von der Ausstiegshaltestelle zum Ziel</summary>
    public int WalkingMinutes { get; set; }

    /// <summary>Fußweg vom Startpunkt zur Einstiegshaltestelle (nur bei Verbindungen ohne Auto)</summary>
    public int StartWalkingMinutes { get; set; }

    /// <summary>Automatisch berechnete Gesamtdauer aller Reiseabschnitte</summary>
    public int TotalMinutes => DriveMinutes + ParkingBufferMinutes + StartWalkingMinutes + TransitMinutes + WalkingMinutes;

    /// <summary>Kodierte Linie für die Autofahrt auf der Karte</summary>
    public string PolylineDrive { get; set; } = string.Empty;

    /// <summary>Kodierte Linie für die ÖPNV-Fahrt auf der Karte</summary>
    public string PolylineTransit { get; set; } = string.Empty;

    /// <summary>Einzelne ÖPNV-Abschnitte für die Routendetails</summary>
    public List<TransitLeg> Legs { get; set; } = new();

    /// <summary>Parkgebühr: free, paid oder unknown</summary>
    public string FeeStatus { get; set; } = "unknown";

    /// <summary>Gebührenangabe aus OpenStreetMap, z. B. „2 €/Std.“</summary>
    public string? FeeDescription { get; set; }

    /// <summary>False, wenn keine Verbindung exakt zur Verkehrsmittel-Auswahl passt und die schnellste gezeigt wird</summary>
    public bool MatchesProductFilter { get; set; } = true;
}