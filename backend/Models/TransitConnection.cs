namespace Backend.Models

// beschreibt die reine Fahrt mit Bus, S-Bahn oder U-Bahn 
// von der Haltestelle (TransitStop) bis zum Ziel.
public class TransitConnection 
{

// Fahrzeit im Öffentlichen Nachverkehr in Minuten
public int DurationMinutes {get; set;}

// z.B U-bahn, S-bahn
public string LineName {get; set; } = "";

// Linie auf der Karte
public string Polyline {get; set; } = "";
}