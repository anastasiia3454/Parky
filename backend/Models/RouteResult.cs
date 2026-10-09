namespace Backend.Models

// Liste für Frontend
public class RouteResult 
{
    // Name des Parkingplatzes
    public string ParkingName { get; set; } = "";

    // Autofahrt zum Parkplatz
    public int DriveMinutes { get; set; }

    // Zeit für Parken
    public int ParkingMinutes { get; set; }

    // ÖPNV Fahrzeit
    public int TransitMinutes { get; set;}

    // Fußweg vom Bahnhof zum Ziel
    public int WalkingMinutes { get; set; }


    // Automatische Berechnung Gesamtzeit:
    public int TotalMinutes => DriveMinutes  + ParkingMinutes + TransitMinutes + WalkingMinutes;


    // Linie für die Autofahrt auf der Karte
    public string PolylineDrive { get; set; } = "";

    // Linie für die ÖPNV Fahrt auf der Karte
    public string PolylineTransit { get; set; } = "";
}