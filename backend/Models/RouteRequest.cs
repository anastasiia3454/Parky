using System;

namespace Backend.Models

//Informationen das Frontend an das Backend schicken muss
{
    public class RouteRequest
    {
        //Breitengrad Startpunkts
        public double OriginLat { get; set; }
        
        //Längengrad Startpunkts
        public double OriginLon { get; set; }

        //Breitengrad Zielorts
        public double TargetLat { get; set; }

        //Längengrad Zielorts
        public double TargetLon { get; set; }

        //Datum und Uhrzeit der geplanten Abfahrt
        public DateTimeOffset DepartureTime { get; set; }
    }
}