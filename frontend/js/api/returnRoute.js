import { BACKEND_BASE } from '../config.js';

// Berechnet die Rückfahrt. Wirft einen Error mit der Servermeldung bei Fehlern.
export async function fetchReturnRoute(payload) {
    const response = await fetch(`${BACKEND_BASE}/api/ReturnRoute/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
    }

    return response.json();
}