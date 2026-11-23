import { state } from '../state.js';
import { geocodeAddress } from '../api/geocode.js';
import { fetchParkAndRide } from '../api/parkAndRide.js';
import { saveRecentSearch } from './recentSearches.js';
import { showIntermodalResults } from './results.js';
import { resetResultsView } from './tabs.js';
import { showToast } from './toast.js';

// Karten-Funktionen (clearMapResults, setStartMarker, setDestinationMarker)
// kommen aus der Karten-Datei (globaler Scope).

// Gewichtung Geschwindigkeit/Kosten aus dem Regler (0 bis 1)
function getSpeedWeight() {
    const slider = document.querySelector('input[type="range"]') || document.getElementById('speedSlider');
    return slider ? parseFloat(slider.value) / 100 : 0.5;
}

function showParkingCount(toast, parkings) {
    const n = parkings ? parkings.length : 0;
    if (n > 0) {
        toast.update(
            n === 1 ? '1 P+R-Parkplatz gefunden' : `${n} P+R-Parkplätze gefunden`,
            { type: 'success', loading: false, duration: 4000 }
        );
    } else {
        toast.update('Keine P+R-Parkplätze im Umkreis von 20 km gefunden.', {
            type: 'warning', loading: false, duration: 6000
        });
    }
}

async function runSearch() {
    const submitBtn = document.getElementById('btnSearch');
    const resultsDiv = document.getElementById('results');

    const startText = document.getElementById('start').value;
    const destText = document.getElementById('destination').value;

    saveRecentSearch(startText, destText);

    resultsDiv.innerHTML = '';
    const costPanel = document.getElementById('costPanel');
    if (costPanel) costPanel.innerHTML = '';
    clearMapResults();

    const session = ++state.searchSession;
    if (submitBtn) submitBtn.classList.add('loading');

    const status = showToast('Adresse wird gesucht …', { type: 'info', loading: true });

    try {
        const start = await geocodeAddress(startText);
        const dest = await geocodeAddress(destText);
        if (session !== state.searchSession) return;

        status.update('Suche optimale P+R-Parkplätze …');

        setStartMarker(start.lat, start.lon);
        setDestinationMarker(dest.lat, dest.lon, dest.displayName);

        resetResultsView();
        const parkings = await fetchParkAndRide(start.lat, start.lon, dest.lat, dest.lon, getSpeedWeight());
        if (session !== state.searchSession) { clearMapResults(); return; }

        showParkingCount(status, parkings);

        const routeStatus = showToast('Berechne Gesamtrouten …', { type: 'info', loading: true });
        try {
            await showIntermodalResults(start.lat, start.lon, dest.lat, dest.lon);
        } finally {
            if (session === state.searchSession) routeStatus.close();
        }
    } catch (error) {
        console.error(error);
        if (session !== state.searchSession) return;
        const message = error && error.message && error.message.startsWith('Adresse nicht gefunden')
            ? error.message
            : 'Fehler bei der Suche oder API-Abfrage.';
        status.update(message, { type: 'error', loading: false, duration: 6000 });
    } finally {
        if (submitBtn) submitBtn.classList.remove('loading');
    }
}

export function initSearchForm() {
    document.getElementById('routeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        runSearch();
    });
}