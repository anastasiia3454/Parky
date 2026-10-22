namespace Backend.Models;

// Liste für Frontend
public class RouteResult
{
    // Name des Parkingplatzes
    public string ParkingName { get; set; } = "";

    public double ParkingLat { get; set; }
    public double ParkingLon { get; set; }


    public double TargetStopLat { get; set; }
    public double TargetStopLon { get; set; }

    // Autofahrt zum Parkplatz
    public int DriveMinutes { get; set; }

    // ÖPNV Fahrzeit
    public int TransitMinutes { get; set; }

    // Fußweg vom Bahnhof zum Ziel
    public int WalkingMinutes { get; set; }
    //Zeit für Parken
    public int ParkingBufferMinutes { get; set; }

    // Automatische Berechnung Gesamtzeit:
    public int TotalMinutes => DriveMinutes + ParkingBufferMinutes + TransitMinutes + WalkingMinutes;


    // Linie für die Autofahrt auf der Karte
    public string PolylineDrive { get; set; } = "";

    // Linie für die ÖPNV Fahrt auf der Karte
    public string PolylineTransit { get; set; } = "";

}