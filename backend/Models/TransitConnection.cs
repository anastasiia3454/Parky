using System.Collections.Generic;

namespace Backend.Models;

/// <summary>
/// Repräsentiert eine konkrete ÖPNV Verbindung inklusive aller Teilstrecken
/// und der finalen Ausstiegsposition
/// </summary>
public class TransitConnection
{

    /// <summary>
    /// Gesamte Fahrzeit im öffentlichen Nahverkehr in Minuten
    /// </summary>
    public int DurationMinutes { get; set; }

    /// <summary>
    /// Name der ÖPNV Linie 
    /// </summary>
    public string LineName { get; set; } = "";

    /// <summary>
    /// Kodierte Linie für die Karte
    /// </summary>
    public string Polyline { get; set; } = "";

    /// <summary>
    /// Breitengrad der finalen Aussstiegshaltestelle (Startpunkt für den Fußweg)
    /// </summary>
    public double ArrivalStopLat { get; set; }

    /// <summary>
    /// Längengrad der finalen Ausstiegshaltestelle
    /// </summary>
    public double ArrivalStopLon { get; set; }


    /// <summary>
    /// Liste aller einzeln Teilstrecken (z. Erst Bus, dann U-Bahn)
    /// </summary>
    public List<TransitLeg> Legs { get; set; } = new();
}