import { BACKEND_BASE, ROUTE_TIMEOUT_MS } from '../config.js';

// Berechnet die Gesamtrouten (P+R + ÖPNV). Wirft bei Fehlern oder Timeout.
export async function fetchIntermodalRoutes({ originLat, originLon, targetLat, targetLon, products }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

    try {
        const response = await fetch(`${BACKEND_BASE}/api/Route/calculate`, {
            signal: controller.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originLat,
                originLon,
                targetLat,
                targetLon,
                departureTime: new Date().toISOString(),
                products
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } finally {
        clearTimeout(timeoutId);
    }
}