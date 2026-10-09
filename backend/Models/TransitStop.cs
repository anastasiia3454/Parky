namespace Backend.Models;

//Datenbehälter für eine einzelne Bus oder Bahnhaltestelle
public class TransitStop {

    //Id Haltestelle
    public string Id { get; set; } = string.Empty;

    //Name von Haltestelle (z.B. Alexander Platz)
    public string Name { get; set; } = string.Empty;
}