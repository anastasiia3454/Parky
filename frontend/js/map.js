const map = L.map('map').setView([52.5200, 13.4050], 11);

L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let startMarker = null;
let destinationMarker = null;
let parkingMarkers = [];
let currentDriveRouteLayer = null;
let currentTransitRouteLayer = null;
let currentWalkRouteLayer = null;

const mapContainer = document.getElementById('map');
if (mapContainer && 'ResizeObserver' in window) {
    new ResizeObserver(() => map.invalidateSize()).observe(mapContainer);
}
window.addEventListener('resize', () => map.invalidateSize());

function isValidCoord(value) {
    return typeof value === 'number' && isFinite(value);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function attachPopup(marker, html, radius) {
    marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        map.invalidateSize();

        L.popup({
            offset: [0, -radius],
            autoPan: true,
            autoPanPadding: [20, 20],
            closeOnClick: true
        })
            .setLatLng(marker.getLatLng())
            .setContent(html)
            .openOn(map);
    });
}

map.on('popupopen', function (e) {
    const btn = e.popup.getElement().querySelector('.route-btn');
    if (!btn) return;

    btn.addEventListener('click', function () {
        drawDriveRoute(
            parseFloat(btn.dataset.startLat),
            parseFloat(btn.dataset.startLon),
            parseFloat(btn.dataset.parkLat),
            parseFloat(btn.dataset.parkLon)
        );
    });
});

function setStartMarker(lat, lon) {
    if (!isValidCoord(lat) || !isValidCoord(lon)) return;

    if (startMarker) {
        map.removeLayer(startMarker);
    }

    const radius = 9;

    startMarker = L.circleMarker([lat, lon], {
        radius: radius,
        color: '#bfdbfe',
        fillColor: '#1d4ed8',
        fillOpacity: 0.9,
        weight: 2
    }).addTo(map);

    attachPopup(startMarker, '<b>Dein Startpunkt</b>', radius);
}

function setDestinationMarker(lat, lon, name = 'Dein Zielpunkt') {
    if (!isValidCoord(lat) || !isValidCoord(lon)) return;

    if (destinationMarker) {
        map.removeLayer(destinationMarker);
    }

    const radius = 9;

    destinationMarker = L.circleMarker([lat, lon], {
        radius: radius,
        color: '#ff751f',
        fillColor: '#111827',
        fillOpacity: 0.9,
        weight: 2
    }).addTo(map);

    attachPopup(destinationMarker, `<b>Ziel:</b><br>${escapeHtml(name)}`, radius);
}

function displayParkingsOnMap(parkings, startLat, startLon) {
    map.invalidateSize();

    parkingMarkers.forEach(marker => map.removeLayer(marker));
    parkingMarkers = [];

    parkings.forEach((p, index) => {
        if (!isValidCoord(p.lat) || !isValidCoord(p.lon)) return;

        const isBestOption = index === 0;
        const radius = isBestOption ? 12 : 7;

        const marker = L.circleMarker([p.lat, p.lon], {
            radius: radius,
            color: '#a7f3d0',
            fillColor: isBestOption ? '#047857' : '#16331f',
            fillOpacity: isBestOption ? 1.0 : 0.8,
            weight: isBestOption ? 3 : 1
        }).addTo(map);

        const minutes = Math.round(p.driveDurationSeconds / 60);

        attachPopup(marker, `
            <b>${isBestOption ? '⭐ Bester P+R Platz: ' : ''}${escapeHtml(p.name)}</b><br>
            Fahrzeit Auto: ca. ${minutes} Min.<br>
            ${p.score ? `Score: ${p.score.toFixed(1)}<br>` : ''}<br>
            <button class="route-btn"
                    data-start-lat="${startLat}"
                    data-start-lon="${startLon}"
                    data-park-lat="${p.lat}"
                    data-park-lon="${p.lon}">
                Auto-Route anzeigen
            </button>
        `, radius);

        parkingMarkers.push(marker);
    });

    const allLayers = [...parkingMarkers];
    if (startMarker) allLayers.push(startMarker);
    if (destinationMarker) allLayers.push(destinationMarker);

    if (allLayers.length > 0) {
        const group = L.featureGroup(allLayers);
        map.fitBounds(group.getBounds().pad(0.15));
    }
}

async function drawFullIntermodalRoute(
    startLat, startLon, 
    parkLat, parkLon, 
    destLat, destLon, 
    polylineTransit = null, 
    targetStopLat = null, 
    targetStopLon = null
) {
    // 1. Vorherige Routen-Ebenen von der Karte entfernen
    if (currentDriveRouteLayer) map.removeLayer(currentDriveRouteLayer);
    if (currentTransitRouteLayer) map.removeLayer(currentTransitRouteLayer);
    if (currentWalkRouteLayer) map.removeLayer(currentWalkRouteLayer);

    currentDriveRouteLayer = null;
    currentTransitRouteLayer = null;
    currentWalkRouteLayer = null;

    if (!isValidCoord(parkLat) || !isValidCoord(parkLon)) {
        console.error("Ungültige Parkplatz-Koordinaten übergeben.");
        return;
    }

    // 2. AUTO-ROUTE: Startadresse -> P+R Parkplatz (HELLBLAU via OSRM)
    const driveUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${parkLon},${parkLat}?overview=full&geometries=geojson`;

    try {
        const driveRes = await fetch(driveUrl);
        const driveData = await driveRes.json();

        if (driveData.routes && driveData.routes.length > 0) {
            currentDriveRouteLayer = L.geoJSON(driveData.routes[0].geometry, {
                style: {
                    color: '#00bfff', // Hellblau
                    weight: 5,
                    opacity: 0.9
                }
            }).addTo(map);
        }
    } catch (err) {
        console.error("Fehler beim Laden der Auto-Route:", err);
    }

    // 3. ÖPNV-ROUTE: Parkplatz -> Ziel-Haltestelle (LILA aus Backend-Polyline)
    if (polylineTransit && typeof L.Polyline.fromEncoded === 'function') {
        try {
            currentTransitRouteLayer = L.Polyline.fromEncoded(polylineTransit, {
                color: '#8b5cf6', // Lila
                weight: 5,
                opacity: 0.85
            }).addTo(map);
        } catch (e) {
            console.error("Fehler beim Dekodieren der ÖPNV-Polyline:", e);
        }
    } else {
        // Luftlinie als Ersatz, falls Polyline leer ist (vom Parkplatz zur Ziel-Haltestelle)
        const endLat = isValidCoord(targetStopLat) ? targetStopLat : destLat;
        const endLon = isValidCoord(targetStopLon) ? targetStopLon : destLon;

        currentTransitRouteLayer = L.polyline([[parkLat, parkLon], [endLat, endLon]], {
            color: '#8b5cf6',
            weight: 4,
            dashArray: '6, 8'
        }).addTo(map);
    }

    // 4. FUSSWEG: Ziel-Haltestelle -> Endziel (ORANGE GESTRICHELT via OSRM)
    // Startet exakt an der Ausstiegshaltestelle
    const walkStartLat = isValidCoord(targetStopLat) ? targetStopLat : parkLat;
    const walkStartLon = isValidCoord(targetStopLon) ? targetStopLon : parkLon;

    const walkUrl = `https://router.project-osrm.org/route/v1/foot/${walkStartLon},${walkStartLat};${destLon},${destLat}?overview=full&geometries=geojson`;

    try {
        const walkRes = await fetch(walkUrl);
        const walkData = await walkRes.json();

        if (walkData.routes && walkData.routes.length > 0) {
            currentWalkRouteLayer = L.geoJSON(walkData.routes[0].geometry, {
                style: {
                    color: '#f97316', // Orange
                    weight: 4,
                    opacity: 0.9,
                    dashArray: '5, 8'
                }
            }).addTo(map);
        }
    } catch (err) {
        console.error("Fehler beim Laden des Fußwegs:", err);
    }

    // 5. Kartenausschnitt automatisch anpassen
    const activeLayers = [];
    if (currentDriveRouteLayer) activeLayers.push(currentDriveRouteLayer);
    if (currentTransitRouteLayer) activeLayers.push(currentTransitRouteLayer);
    if (currentWalkRouteLayer) activeLayers.push(currentWalkRouteLayer);

    if (activeLayers.length > 0) {
        const group = L.featureGroup(activeLayers);
        map.fitBounds(group.getBounds().pad(0.15));
    }
}