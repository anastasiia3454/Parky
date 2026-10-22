# Parky – P+R Parkplatz- & Routenfinder 🚗🅿️

**Parky** ist ein webbasierter Park-and-Ride (P+R) Finder, der Autofahrern hilft, optimale P+R-Parkplätze rund um Städte zu finden und direkt Routen dorthin zu berechnen.

---

## 🌟 Funktionen

- **P+R Suche:** Automatische Erkennung von nahegelegenen Park-and-Ride-Möglichkeiten basierend auf Start- und Zieladresse.
- **Interaktive Karte:** Visualisierung von Start- und Zielpunkt sowie Parkplätzen auf einer OpenStreetMap-Karte.
- **Routenberechnung:** Live-Anzeige der Autofahrt-Route vom Startpunkt zum ausgewählten P+R-Platz.
- **Priorisierung:** Berechnung von Vorschlägen basierend auf Fahrzeit, Komfort und Entfernung.

---

## 🛠️ Technologien & APIs

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** C# / .NET Web API
- **Kartenanzeige:** [Leaflet.js](https://leafletjs.com/)
- **Kartendaten:** [OpenStreetMap](https://www.openstreetmap.org/)
- **Routing API:** [OSRM (Open Source Routing Machine)](http://project-osrm.org/)
- **Parkplatzdaten:** [Overpass API (OpenStreetMap)](https://overpass-api.de/)

---

## 🚀 Lokale Installation & Start

### Voraussetzungen
- [.NET SDK](https://dotnet.microsoft.com/download) (Version 7.0 oder neuer)

### Schritte
1. Repository klonen:
   ```bash
   git clone https://github.com/dein-benutzername/parky.git
   cd parky
   ```

2. Anwendung starten:
   ```bash
   dotnet run
   ```

3. Die Anwendung im Browser öffnen unter:
   `http://localhost:5000` (oder dem in der Konsole angezeigten Port)

---

## ⚠️ Haftungsausschluss / Disclaimer

Dieses Projekt ist eine private **Lern- und Hobbyanwendung** und dient ausschließlich Bildungs- und Demonstrationszwecken. 

Die bereitgestellten Karten-, Parkplatz- und Routeninformationen basieren auf externen, offenen Diensten (*OpenStreetMap, Overpass API, OSRM*) und erheben keinen Anspruch auf Vollständigkeit, Richtigkeit oder Aktualität.

Es wird **keinerlei Haftung** für eventuelle Fehler in den Daten, fehlerhafte Routenführungen oder Schäden jeglicher Art übernommen, die durch die Nutzung dieser Anwendung entstehen könnten. Die Nutzung erfolgt auf eigene Gefahr.

---

## ⚖️ Urheberrecht & Lizenzen

- **OpenStreetMap:** Die Kartendaten stehen unter der [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Data © OpenStreetMap contributors.
- **Leaflet.js:** Lizenziert unter der BSD-2-Clause Lizenz.