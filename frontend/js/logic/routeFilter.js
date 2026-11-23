import { PRODUCT_ALIASES } from '../config.js';

// Route mit Auto zum Parkplatz
export function hasDriveLeg(route) {
    return Number(route.driveMinutes) > 0;
}

// Prüft, ob eine Route genau den gewählten Verkehrsmitteln entspricht
export function routeMatchesSelection(route, selectedProducts) {
    if (route.matchesProductFilter === false) return false;
    if (route.matchesProductFilter === true) return true;

    const transit = (Array.isArray(route.legs) ? route.legs : []).filter(l => l && !l.isWalk);
    return transit.every(l =>
        selectedProducts.includes(l.product)
        || (PRODUCT_ALIASES[l.product] || []).some(p => selectedProducts.includes(p))
    );
}

// Gleicher Parkplatz + gleiche ÖPNV-Verbindung (Linien, Ein-/Ausstieg) = ähnliche Route
export function routeSignature(route) {
    const transit = (Array.isArray(route.legs) ? route.legs : [])
        .filter(l => l && !l.isWalk)
        .map(l => [l.product, l.lineName, l.fromName, l.toName].join('|'));
    return [route.parkingName, ...transit].join('#');
}

// Behält pro Signatur nur die schnellste Route, die Reihenfolge bleibt erhalten
export function removeSimilarRoutes(routes) {
    const fastest = new Map();
    routes.forEach(r => {
        const key = routeSignature(r);
        const cur = fastest.get(key);
        if (!cur || Number(r.totalMinutes) < Number(cur.totalMinutes)) fastest.set(key, r);
    });
    return routes.filter(r => fastest.get(routeSignature(r)) === r);
}