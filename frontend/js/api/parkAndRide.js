import { BACKEND_BASE, OSRM_BASE } from '../config.js';
import { state } from '../state.js';
import { showToast } from '../ui/toast.js';

// Fallback: Liefert das Backend keine Direktfahrt, wird sie über OSRM im Browser abgefragt
async function fetchDirectCarFallback(lat, lon, destLat, destLon) {
    try {
        const res = await fetch(`${OSRM_BASE}/route/v1/driving/${lon},${lat};${destLon},${destLat}?overview=false`);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
            return {
                durationSeconds: data.routes[0].duration,
                distanceMeters: data.routes[0].distance
            };
        }
    } catch (e) {
        console.error('OSRM Fallback-Fehler:', e);
    }
    return null;
}

export async function fetchParkAndRide(lat, lon, destLat = null, destLon = null, weightSpeed = 0.5) {
    try {
        let url = `${BACKEND_BASE}/api/parkandride?lat=${lat}&lon=${lon}&weightSpeed=${weightSpeed}`;
        if (destLat && destLon) {
            url += `&destLat=${destLat}&destLon=${destLon}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.message || `Fehler beim Laden: ${response.statusText}`);
        }

        const data = await response.json();
        const parkings = data.parkings || [];
        state.directCarRoute = data.directCarRoute || null;

        if (!state.directCarRoute && destLat && destLon) {
            state.directCarRoute = await fetchDirectCarFallback(lat, lon, destLat, destLon);
        }

        // Kartenfunktion liegt in der separaten Karten-Datei (globaler Scope)
        if (typeof displayParkingsOnMap === 'function') {
            displayParkingsOnMap(parkings, lat, lon);
        }

        return parkings;
    } catch (error) {
        console.error('API-Fehler:', error);
        showToast(error.message, { type: 'error', duration: 6000 });
        return [];
    }
}