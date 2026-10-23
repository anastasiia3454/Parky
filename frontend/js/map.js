const map = L.map('map').setView([52.5200, 13.4050], 11);

// ==========================================
// KARTENSTILE (alle kostenlos, ohne API-Schlüssel)
// ==========================================

const MAP_STYLE_STORAGE_KEY = 'parky.mapStyle';
const DEFAULT_MAP_STYLE = 'hot';

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';

const MAP_STYLES = {
    hot: {
        label: 'Standard',
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION + ', Humanitarian-Stil'
    },
    osm: {
        label: 'OSM Klassik',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION
    }
};

const PREVIEW_ZOOM = 11;
const PREVIEW_CENTER = { lat: 52.5200, lon: 13.4050 };

let currentBaseLayer = null;
let currentMapStyle = DEFAULT_MAP_STYLE;

function loadSavedMapStyle() {
    try {
        const saved = localStorage.getItem(MAP_STYLE_STORAGE_KEY);
        return saved && MAP_STYLES[saved] ? saved : DEFAULT_MAP_STYLE;
    } catch (e) {
        return DEFAULT_MAP_STYLE; // localStorage kann gesperrt sein (z. B. Privatmodus)
    }
}

function saveMapStyle(key) {
    try {
        localStorage.setItem(MAP_STYLE_STORAGE_KEY, key);
    } catch (e) {
        console.warn('Kartenstil konnte nicht gespeichert werden:', e);
    }
}

function createBaseLayer(key) {
    const style = MAP_STYLES[key];
    return L.tileLayer(style.url, {
        subdomains: style.subdomains,
        maxZoom: style.maxZoom,
        attribution: style.attribution
    });
}

function setMapStyle(key, persist = true) {
    if (!MAP_STYLES[key]) key = DEFAULT_MAP_STYLE;

    if (currentBaseLayer) map.removeLayer(currentBaseLayer);
    currentBaseLayer = createBaseLayer(key).addTo(map);
    currentMapStyle = key;

    if (persist) saveMapStyle(key);

    document.querySelectorAll('.map-style-switch__btn').forEach(btn => {
        const active = btn.dataset.style === key;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

// Rechnet Koordinaten in Kachel-Koordinaten (Web-Mercator) um
function lonLatToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

function previewTileUrl(key, z, x, y) {
    const style = MAP_STYLES[key];
    const sub = style.subdomains.charAt(0);
    return style.url
        .replace('{s}', sub)
        .replace('{z}', z)
        .replace('{x}', x)
        .replace('{y}', y)
        .replace('{r}', '');
}

const MapStyleSwitch = L.Control.extend({
    options: { position: 'bottomleft' },

    onAdd() {
        const wrap = L.DomUtil.create('div', 'map-style-switch leaflet-bar');
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);

        const center = lonLatToTile(PREVIEW_CENTER.lat, PREVIEW_CENTER.lon, PREVIEW_ZOOM);

        Object.entries(MAP_STYLES).forEach(([key, style]) => {
            const btn = L.DomUtil.create('button', 'map-style-switch__btn', wrap);
            btn.type = 'button';
            btn.dataset.style = key;
            btn.title = style.label;
            btn.setAttribute('aria-label', `Kartenstil: ${style.label}`);

            // Vorschau: 2×2 echte Kacheln des jeweiligen Stils
            const thumb = L.DomUtil.create('span', 'map-style-switch__thumb', btn);
            for (let dy = 0; dy < 2; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const img = L.DomUtil.create('img', '', thumb);
                    img.src = previewTileUrl(key, PREVIEW_ZOOM, center.x + dx, center.y + dy);
                    img.alt = '';
                    img.draggable = false;
                    img.loading = 'lazy';
                }
            }

            const label = L.DomUtil.create('span', 'map-style-switch__label', btn);
            label.textContent = style.label;

            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stop(e);
                setMapStyle(key);
            });
        });

        return wrap;
    }
});

setMapStyle(loadSavedMapStyle(), false);
new MapStyleSwitch().addTo(map);
setMapStyle(currentMapStyle, false); // Zustand der Buttons aktualisieren

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

const sheetQuery = window.matchMedia('(max-width: 1024px)');

/**
 * Abstände für Kartenausschnitt und Popup-Autopan:
 * Auf Smartphone/Tablet verdeckt das eingeklappte Sheet unten einen Teil der Karte,
 * oben rechts liegen die Meldungen (Toasts).
 */
function viewPadding() {
    return sheetQuery.matches
        ? { top: 70, bottom: 150, side: 24 }
        : { top: 24, bottom: 24, side: 24 };
}

function fitToLayers(layers, extra = 0.1) {
    if (!layers || layers.length === 0) return;

    const pad = viewPadding();
    const bounds = L.featureGroup(layers).getBounds().pad(extra);

    map.fitBounds(bounds, {
        paddingTopLeft: [pad.side, pad.top],
        paddingBottomRight: [pad.side, pad.bottom]
    });
}

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

        const pad = viewPadding();

        L.popup({
            offset: [0, -radius],
            autoPan: true,
            autoPanPaddingTopLeft: [pad.side, pad.top],
            autoPanPaddingBottomRight: [pad.side, pad.bottom],
            closeOnClick: true
        })
            .setLatLng(marker.getLatLng())
            .setContent(html)
            .openOn(map);
    });
}

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

        // Nur Informationen – die Route wird über die Gesamtrouten gewählt
        attachPopup(marker, `
            <b>${isBestOption ? '⭐ Bester P+R Platz: ' : ''}${escapeHtml(p.name)}</b><br>
            Fahrzeit Auto: ca. ${minutes} Min.
            ${p.score ? `<br>Score: ${p.score.toFixed(1)}` : ''}
        `, radius);

        parkingMarkers.push(marker);
    });

    const allLayers = [...parkingMarkers];
    if (startMarker) allLayers.push(startMarker);
    if (destinationMarker) allLayers.push(destinationMarker);

    fitToLayers(allLayers, 0.1);
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

    fitToLayers(activeLayers, 0.1);
}