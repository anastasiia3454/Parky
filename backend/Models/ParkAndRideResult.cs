namespace Backend.Models;

/// <summary>
/// Antwort des Park & Ride Endpunkts an das Frontend
/// </summary>
public class ParkAndRideResult
{
    /// <summary>Direkte Autofahrt zum Ziel, falls ein Ziel angegeben wurde</summary>
    public DirectCarRoute? DirectCarRoute { get; set; }

    /// <summary>Sortierte Liste der Parkplätze</summary>
    public List<ParkingCandidate> Parkings { get; set; } = new();
}