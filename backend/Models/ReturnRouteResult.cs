using System;
using System.Collections.Generic;

namespace Backend.Models;

/// <summary>
/// Berechnete Rückfahrt vom Ziel zum Parkplatz, danach mit dem Auto nach Hause
/// </summary>
public class ReturnRouteResult
{
    /// <summary>Alle Abschnitte: Fußweg, ÖPNV, Fußweg zum Auto</summary>
    public List<TransitLeg> Legs { get; set; } = new();

    /// <summary>Fußweg vom Ziel zur Einstiegshaltestelle</summary>
    public int StartWalkingMinutes { get; set; }

    /// <summary>Reine Fahrzeit mit dem ÖPNV</summary>
    public int TransitMinutes { get; set; }

    /// <summary>Fußweg vom Ausstieg zum Parkplatz</summary>
    public int WalkingMinutes { get; set; }

    /// <summary>Abfahrt am Ziel</summary>
    public DateTimeOffset DepartureFromTarget { get; set; }

    /// <summary>Ankunft am Parkplatz (dort endet die Parkdauer)</summary>
    public DateTimeOffset ArrivalAtParking { get; set; }

    /// <summary>Fahrzeit mit dem Auto vom Parkplatz nach Hause</summary>
    public int DriveHomeMinutes { get; set; }

    /// <summary>Ankunft zu Hause</summary>
    public DateTimeOffset ArrivalHome { get; set; }
}