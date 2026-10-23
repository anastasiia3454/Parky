namespace Backend.Models;

/// <summary>
/// Repräsentiert eine ÖPNV Haltestelle (S-Bahn, U-Bahn, Bus)
/// die in der Nähe einers Parkplatzes oder eines Zieles gefunden wurde
/// </summary>
public class TransitStop
{

    /// <summary>
    /// Eindeutige ID der Haltestelle aus dem VBB System
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Name der Haltestelle (z.B. Alexander Platz)
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Breitengrad der Haltestelle für Standortbestimmung
    /// </summary>
    public double Lat { get; set; }

    /// <summary>
    /// Längengrad der Haltestelle für Standortbestimmung
    /// </summary>
    public double Lon { get; set; }
}