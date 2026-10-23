namespace Backend.Models;

/// <summary>
/// Ein möglicher P+R Parkplatz mit Position und Fahrzeit mit dem Auto
/// </summary>
public class ParkingCandidate
{
    /// <summary>Name des Parkplatzes (aus OpenStreetMap)</summary>
    public string Name { get; set; }

    /// <summary>Breitengrad des Parkplatzes</summary>
    public double Lat { get; set; }

    /// <summary>Längengrad des Parkplatzes</summary>
    public double Lon { get; set; }

    /// <summary>Fahrzeit mit dem Auto vom Startpunkt bis zum Parkplatz in Sekunden</summary>
    public double DriveDurationSeconds { get; set; }

    /// <summary>Fahrstrecke mit dem Auto in Metern</summary>
    public double DriveDistanceMeters { get; set; }

    /// <summary>Anzahl der Umstiege (für die Bewertung)</summary>
    public int Transfers { get; set; } = 1;

    /// <summary>Bewertung für die Sortierung (kleiner ist besser)</summary>
    public double Score { get; set; }

    public ParkingCandidate(string name, double lat, double lon, double driveDurationSeconds, double driveDistanceMeters)
    {
        Name = name;
        Lat = lat;
        Lon = lon;
        DriveDurationSeconds = driveDurationSeconds;
        DriveDistanceMeters = driveDistanceMeters;
    }
}