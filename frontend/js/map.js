const map = L.map('map').setView([52.5200, 13.4050], 11);

const MAP_STYLE_STORAGE_KEY = 'parky.mapStyle';
const DEFAULT_MAP_STYLE = 'dark';

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';

const MAP_STYLES = {
    dark: {
        label: 'Dunkel',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION
    },
    hot: {
        label: 'Standard',
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
        attribution: OSM_ATTRIBUTION + ', Humanitarian-Stil'
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
        return DEFAULT_MAP_STYLE;
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
    const options = {
        maxZoom: style.maxZoom,
        attribution: style.attribution
    };
    if (style.subdomains) {
        options.subdomains = style.subdomains;
    }
    return L.tileLayer(style.url, options);
}

function setMapStyle(key, persist = true) {
    if (!MAP_STYLES[key]) key = DEFAULT_MAP_STYLE;

    if (currentBaseLayer) map.removeLayer(currentBaseLayer);
    currentBaseLayer = createBaseLayer(key).addTo(map);
    currentMapStyle = key;

    if (persist) saveMapStyle(key);

    const mapContainer = map.getContainer();
    if (key === 'dark') {
        mapContainer.classList.add('map-dark-mode');
    } else {
        mapContainer.classList.remove('map-dark-mode');
    }

    document.querySelectorAll('.map-style-switch__btn').forEach(btn => {
        const active = btn.dataset.style === key;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
}

function lonLatToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

function previewTileUrl(key, z, x, y) {
    const style = MAP_STYLES[key];
    const sub = style.subdomains ? style.subdomains.charAt(0) : 'a';
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
                let target = key;
                if (window.matchMedia('(max-width: 768px)').matches && key === currentMapStyle) {
                    const keys = Object.keys(MAP_STYLES);
                    target = keys[(keys.indexOf(key) + 1) % keys.length];
                }
                setMapStyle(target);
            });
        });

        return wrap;
    }
});

setMapStyle(loadSavedMapStyle(), false);
new MapStyleSwitch().addTo(map);
setMapStyle(currentMapStyle, false);

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

function startMarkerIcon() {
    return L.divIcon({
        className: 'parky-marker parky-marker--start',
        html: '<div class="parky-marker__sway"><span class="parky-marker__dot"></span></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

function destinationMarkerIcon() {
    const svg =
        '<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true">' +
        '<path d="M17 1C8 1 1 8 1 17C1 28 17 43 17 43C17 43 33 28 33 17C33 8 26 1 17 1Z" ' +
        'fill="#aef65c" stroke="#000000" stroke-width="2"/>' +
        '<circle cx="17" cy="17" r="6" fill="#000000"/>' +
        '</svg>';

    return L.divIcon({
        className: 'parky-marker parky-marker--end',
        html: '<div class="parky-marker__sway">' + svg + '</div>',
        iconSize: [34, 44],
        iconAnchor: [17, 44]
    });
}

function setStartMarker(lat, lon, name = 'Dein Startpunkt') {
    if (!isValidCoord(lat) || !isValidCoord(lon)) return;

    if (startMarker) {
        map.removeLayer(startMarker);
    }

    startMarker = L.marker([lat, lon], {
        icon: startMarkerIcon(),
        keyboard: false
    }).addTo(map);

    attachPopup(startMarker, `<b>Startpunkt:</b><br>${escapeHtml(name)}`, 11);
}

function setDestinationMarker(lat, lon, name = 'Dein Zielpunkt') {
    if (!isValidCoord(lat) || !isValidCoord(lon)) return;

    if (destinationMarker) {
        map.removeLayer(destinationMarker);
    }

    destinationMarker = L.marker([lat, lon], {
        icon: destinationMarkerIcon(),
        keyboard: false
    }).addTo(map);

    attachPopup(destinationMarker, `<b>Ziel:</b><br>${escapeHtml(name)}`, 40);
}

function clearMapResults() {
    if (typeof clearTrafficOverlay === 'function') clearTrafficOverlay();
    [startMarker, destinationMarker, ...parkingMarkers,
        currentDriveRouteLayer, currentTransitRouteLayer, currentWalkRouteLayer]
        .forEach(layer => { if (layer) map.removeLayer(layer); });

    startMarker = null;
    destinationMarker = null;
    parkingMarkers = [];
    lastParkings = [];
    currentDriveRouteLayer = null;
    currentTransitRouteLayer = null;
    currentWalkRouteLayer = null;
}

let lastParkings = [];

function renderParkingMarkers(parkings, onlyLat = null, onlyLon = null) {
    parkingMarkers.forEach(marker => map.removeLayer(marker));
    parkingMarkers = [];

    parkings.forEach((p, index) => {
        if (!isValidCoord(p.lat) || !isValidCoord(p.lon)) return;

        if (onlyLat !== null && (Math.abs(p.lat - onlyLat) > 1e-6 || Math.abs(p.lon - onlyLon) > 1e-6)) {
            return;
        }

        const isBestOption = index === 0;
        const radius = isBestOption ? 12 : 7;

        const marker = L.circleMarker([p.lat, p.lon], {
            radius: radius,
            color: '#a7f3d0',
            fillColor: isBestOption ? '#047857' : '#16331f',
            fillOpacity: isBestOption ? 1.0 : 0.8,
            weight: isBestOption ? 3 : 1,
            zIndex: 1000
        }).addTo(map);

        const minutes = Math.round(p.driveDurationSeconds / 60);

        attachPopup(marker, `
            <b>${isBestOption ? '⭐ Bester P+R Platz: ' : ''}${escapeHtml(p.name)}</b><br>
            Fahrzeit Auto: ca. ${minutes} Min.
            ${p.score ? `<br>Score: ${p.score.toFixed(1)}` : ''}
        `, radius);

        parkingMarkers.push(marker);
    });
}

function displayParkingsOnMap(parkings, startLat, startLon) {
    map.invalidateSize();

    lastParkings = parkings;
    renderParkingMarkers(parkings);

    const allLayers = [...parkingMarkers];
    if (startMarker) allLayers.push(startMarker);
    if (destinationMarker) allLayers.push(destinationMarker);

    fitToLayers(allLayers, 0.1);
}

function showOnlyParking(lat, lon) {
    if (!isValidCoord(lat) || !isValidCoord(lon)) return;
    renderParkingMarkers(lastParkings, lat, lon);
}

// Jeder ÖPNV-Abschnitt in der Linienfarbe der Routen-Info, Fußwege orange und gestrichelt
function buildLegLayers(legs) {
    if (!Array.isArray(legs) || typeof L.Polyline.fromEncoded !== 'function') return [];

    const layers = [];
    legs.forEach(leg => {
        if (!leg || !leg.polyline) return;

        try {
            if (leg.isWalk) {
                layers.push(L.Polyline.fromEncoded(leg.polyline, { color: '#f97316', weight: 4, opacity: 0.95 }));
                return;
            }

            const color = typeof productColor === 'function' ? productColor(leg.product) : '#6b7280';
            // Heller Rand unter der Linie, damit ÖPNV klar von der Auto-Route zu unterscheiden ist
            layers.push(L.Polyline.fromEncoded(leg.polyline, { color: '#ffffff', weight: 10, opacity: 1 }));
            layers.push(L.Polyline.fromEncoded(leg.polyline, { color, weight: 6, opacity: 1 }));
        } catch (e) {
            console.error("Fehler beim Dekodieren eines ÖPNV-Abschnitts:", e);
        }
    });
    return layers;
}

async function drawFullIntermodalRoute(
    startLat, startLon,
    parkLat, parkLon,
    destLat, destLon,
    polylineTransit = null,
    targetStopLat = null,
    targetStopLon = null,
    hasDrive = true,
    legs = null
) {
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

    // Ohne Auto ist der erste Abschnitt ein Fußweg zur Haltestelle
    const firstProfile = hasDrive ? 'driving' : 'foot';
    const driveUrl = `https://router.project-osrm.org/route/v1/${firstProfile}/${startLon},${startLat};${parkLon},${parkLat}?overview=full&geometries=geojson`;

    try {
        const driveRes = await fetch(driveUrl);
        const driveData = await driveRes.json();

        if (driveData.routes && driveData.routes.length > 0) {
            currentDriveRouteLayer = L.geoJSON(driveData.routes[0].geometry, {
                style: hasDrive
                    ? { color: '#38bdf8', weight: 4, opacity: 0.95 }
                    : { color: '#f97316', weight: 4, opacity: 0.9 }
            }).addTo(map);
        }
    } catch (err) {
        console.error(hasDrive ? "Fehler beim Laden der Auto-Route:" : "Fehler beim Laden des Fußwegs zur Haltestelle:", err);
    }

    const legLayers = buildLegLayers(legs);
    if (legLayers.length > 0) {
        currentTransitRouteLayer = L.featureGroup(legLayers).addTo(map);
    } else if (polylineTransit && typeof L.Polyline.fromEncoded === 'function') {
        try {
            currentTransitRouteLayer = L.Polyline.fromEncoded(polylineTransit, {
                color: '#e5e7eb',
                weight: 6,
                opacity: 0.85
            }).addTo(map);
        } catch (e) {
            console.error("Fehler beim Dekodieren der ÖPNV-Polyline:", e);
        }
    } else {
        const endLat = isValidCoord(targetStopLat) ? targetStopLat : destLat;
        const endLon = isValidCoord(targetStopLon) ? targetStopLon : destLon;

        currentTransitRouteLayer = L.polyline([[parkLat, parkLon], [endLat, endLon]], {
            color: '#aef65c',
            weight: 4
        }).addTo(map);
    }

    const walkStartLat = isValidCoord(targetStopLat) ? targetStopLat : parkLat;
    const walkStartLon = isValidCoord(targetStopLon) ? targetStopLon : parkLon;

    const walkUrl = `https://router.project-osrm.org/route/v1/foot/${walkStartLon},${walkStartLat};${destLon},${destLat}?overview=full&geometries=geojson`;

    try {
        const walkRes = await fetch(walkUrl);
        const walkData = await walkRes.json();

        if (walkData.routes && walkData.routes.length > 0) {
            currentWalkRouteLayer = L.geoJSON(walkData.routes[0].geometry, {
                style: {
                    color: '#f97316',
                    weight: 4,
                    opacity: 0.9
                }
            }).addTo(map);
        }
    } catch (err) {
        console.error("Fehler beim Laden des Fußwegs:", err);
    }

    const activeLayers = [];
    if (currentDriveRouteLayer) activeLayers.push(currentDriveRouteLayer);
    if (currentTransitRouteLayer) activeLayers.push(currentTransitRouteLayer);
    if (currentWalkRouteLayer) activeLayers.push(currentWalkRouteLayer);

    fitToLayers(activeLayers, 0.1);
}

async function drawDirectCarRoute(startLat, startLon, destLat, destLon) {
    if (currentDriveRouteLayer) map.removeLayer(currentDriveRouteLayer);
    if (currentTransitRouteLayer) map.removeLayer(currentTransitRouteLayer);
    if (currentWalkRouteLayer) map.removeLayer(currentWalkRouteLayer);

    currentDriveRouteLayer = null;
    currentTransitRouteLayer = null;
    currentWalkRouteLayer = null;

    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=geojson`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes.length > 0) {
            currentDriveRouteLayer = L.geoJSON(data.routes[0].geometry, {
                style: {
                    color: '#38bdf8',
                    weight: 4,
                    opacity: 0.9
                }
            }).addTo(map);

            const activeLayers = [currentDriveRouteLayer];
            if (startMarker) activeLayers.push(startMarker);
            if (destinationMarker) activeLayers.push(destinationMarker);

            fitToLayers(activeLayers, 0.1);
        }
    } catch (err) {
        console.error("Fehler beim Laden der direkten Auto-Route:", err);
    }
}