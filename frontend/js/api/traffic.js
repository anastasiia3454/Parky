import { BACKEND_BASE, OSRM_BASE } from '../config.js';
import { hasDriveLeg } from '../logic/routeFilter.js';

// `map` und `L` (Leaflet) kommen aus der Karten-Datei bzw. dem Leaflet-Script (globaler Scope).

let trafficOverlayLayers = [];
let trafficRequestId = 0;

export function clearTrafficOverlay() {
    trafficRequestId++;
    trafficOverlayLayers.forEach(layer => map.removeLayer(layer));
    trafficOverlayLayers = [];
}

// map.js (normales Script) ruft clearTrafficOverlay() in clearMapResults() über den
// globalen Scope auf. Ohne diese Zeile bliebe die Verkehrs-Einfärbung der alten Route stehen.
window.clearTrafficOverlay = clearTrafficOverlay;

function trafficColor(ratio) {
    if (ratio === null || ratio === undefined) return null;
    if (ratio >= 0.85) return '#22c55e';   // flüssig
    if (ratio >= 0.6) return '#f59e0b';    // mittel
    return '#ef4444';                      // stockend
}

// Straßengeometrie von OSRM holen, an mehreren Punkten die Verkehrslage abfragen
// und jeden Abschnitt in der passenden Farbe darüberlegen
export async function colorRouteByTraffic(fromLat, fromLon, toLat, toLon) {
    clearTrafficOverlay();
    const requestId = trafficRequestId;
    try {
        const osrmUrl = `${OSRM_BASE}/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
        const osrm = await fetch(osrmUrl).then(r => (r.ok ? r.json() : null));
        if (requestId !== trafficRequestId) return;
        const coords = osrm && osrm.routes && osrm.routes[0] ? osrm.routes[0].geometry.coordinates : null; // [lon, lat]
        if (!coords || coords.length < 2) return;

        const count = Math.min(10, coords.length);
        const idx = Array.from({ length: count }, (_, i) => Math.round(i * (coords.length - 1) / (count - 1)));
        const points = idx.map(i => [coords[i][1], coords[i][0]]);

        const response = await fetch(`${BACKEND_BASE}/api/Traffic/flow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const ratios = await response.json();
        if (requestId !== trafficRequestId) return;

        for (let s = 0; s < count - 1; s++) {
            const values = [ratios[s] && ratios[s].ratio, ratios[s + 1] && ratios[s + 1].ratio]
                .filter(v => v !== null && v !== undefined);
            if (values.length === 0) continue;

            const ratio = values.reduce((a, b) => a + b, 0) / values.length;
            const segment = coords.slice(idx[s], idx[s + 1] + 1).map(c => [c[1], c[0]]);
            if (segment.length < 2) continue;

            const layer = L.polyline(segment, {
                color: trafficColor(ratio),
                weight: 4,
                opacity: 0.95,
                lineCap: 'round'
            }).addTo(map);
            trafficOverlayLayers.push(layer);
        }
    } catch (err) {
        console.error('Verkehrsfarben:', err);
    }
}

// Verkehrslage zur Anfahrt Start → P+R, direkt in der Detailansicht der Option
export async function updateTrafficInfo(route, card, originLat, originLon) {
    clearTrafficOverlay();
    document.querySelectorAll('.traffic-chip').forEach(el => el.remove());

    const detail = card && card.nextElementSibling && card.nextElementSibling.classList.contains('route-detail')
        ? card.nextElementSibling
        : null;
    if (!detail || !hasDriveLeg(route)) return;

    colorRouteByTraffic(originLat, originLon, route.parkingLat, route.parkingLon);
}