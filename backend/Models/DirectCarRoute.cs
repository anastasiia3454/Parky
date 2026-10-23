namespace Backend.Models;

/// <summary>
/// Direkte Autofahrt vom Start zum Ziel (ohne Park & Ride)
/// </summary>
public class DirectCarRoute
{
    /// <summary>Fahrzeit in Sekunden</summary>
    public double DurationSeconds { get; set; }

    /// <summary>Strecke in Metern</summary>
    public double DistanceMeters { get; set; }

    public DirectCarRoute(double durationSeconds, double distanceMeters)
    {
        DurationSeconds = durationSeconds;
        DistanceMeters = distanceMeters;
    }
}