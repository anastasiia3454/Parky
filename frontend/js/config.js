// Zentrale Konstanten. Hier ändern, nicht im Code verstreut.

export const BACKEND_BASE = 'https://parky-luln.onrender.com';
export const OSRM_BASE = 'https://router.project-osrm.org';
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export const AUTO_SELECT_BEST_ROUTE = true;
export const ROUTE_TIMEOUT_MS = 90000;

export const RECENT_SEARCHES_KEY = 'parky_recent_searches';
export const RECENT_SEARCHES_MAX = 5;
export const RECENT_SEARCHES_SHOWN = 2;

// Verkehrsmittel, die sich bei der API-Auswahl überschneiden (z.B. Fernzug / Regional)
export const PRODUCT_ALIASES = {
    express: ['nationalExpress', 'national'],
    regional: ['regional', 'regionalExpress']
};

export const PRODUCT_COLORS = {
    subway: '#3b82f6',
    suburban: '#22c55e',
    tram: '#f43f5e',
    bus: '#c084fc',
    ferry: '#2dd4bf',
    regional: '#1f2937',
    express: '#fde047'
};

export const PRODUCT_LABELS = {
    subway: 'U-Bahn',
    suburban: 'S-Bahn',
    tram: 'Tram',
    bus: 'Bus',
    ferry: 'Fähre',
    regional: 'Regionalzug',
    express: 'Fernzug'
};