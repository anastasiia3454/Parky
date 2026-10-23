namespace Backend.Models;
/// <summary>
/// Ein einzelner Abschnitt der ÖPNV-Verbindung: entweder eine Linienfahrt
/// (z. B. U6 nach Alt-Tegel) oder ein Fußweg.
/// </summary>
public class TransitLeg
{
    /// <summary>
    /// True, wenn dieser Abschnitt ein Fußweg ist (keine Linie)
    /// </summary>
    public bool IsWalk { get; set; }

    /// <summary>
    /// Liniennummer bzw. Name, z. B. "U6" oder "S7"
    /// </summary>
    public string LineName { get; set; } = "";

    /// <summary>
    /// VBB-Produktart: subway, suburban, tram, bus, ferry, regional, express
    /// </summary>
    public string Product { get; set; } = "";

    /// <summary>
    /// Fahrtrichtung bzw. Endhaltestelle der Linie, z. B. "Alt-Tegel"
    /// </summary>
    public string Direction { get; set; } = "";

    /// <summary>
    /// Name der Einstiegshaltestelle
    /// </summary>
    public string FromName { get; set; } = "";

    /// <summary>
    /// Name der Ausstiegshaltestelle
    /// </summary>
    public string ToName { get; set; } = "";

    /// <summary>
    /// Abfahrtszeit als ISO-Zeitstempel, z. B. "2026-10-23T08:14:00+02:00"
    /// </summary>
    public string Departure { get; set; } = "";

    /// <summary>
    /// Ankunftszeit als ISO-Zeitstempel
    /// </summary>
    public string Arrival { get; set; } = "";

    /// <summary>
    /// Dauer dieses Abschnitts in Minuten
    /// </summary>
    public int Minutes { get; set; }
}