import { AUTO_SELECT_BEST_ROUTE } from '../config.js';
import { state } from '../state.js';
import { fetchIntermodalRoutes } from '../api/routes.js';
import { colorRouteByTraffic, updateTrafficInfo } from '../api/traffic.js';
import { hasDriveLeg, removeSimilarRoutes, routeMatchesSelection } from '../logic/routeFilter.js';
import { getSelectedProducts, isCarFilterChecked, isCarOnlyFilter } from './filters.js';
import { buildDirectCarCard, buildRouteCard } from './routeCards.js';
import { showRouteDetail } from './routeDetail.js';
import { updateRoundTrip } from './roundTrip.js';
import { showTabBar } from './tabs.js';
import { showToast } from './toast.js';

// Karten-Funktionen (showOnlyParking, drawFullIntermodalRoute, drawDirectCarRoute),
// `map` und `parkingMarkers` kommen aus der Karten-Datei (globaler Scope).

async function loadRoutes(coords) {
    try {
        const routes = await fetchIntermodalRoutes({ ...coords, products: getSelectedProducts() });
        return { routes, failed: false };
    } catch (err) {
        console.error('Fehler bei der intermodalen Routenberechnung:', err);
        showToast('Die Gesamtrouten konnten nicht berechnet werden.', { type: 'error', duration: 6000 });
        return { routes: [], failed: true };
    }
}

// Auto-Filter, Verkehrsmittel-Auswahl und Duplikate berücksichtigen
function filterRoutes(routes) {
    let result = routes;

    // Routen mit Auto zum Parkplatz nur anzeigen, wenn der Filter "Auto" aktiv ist
    if (!isCarFilterChecked()) result = result.filter(r => !hasDriveLeg(r));

    // Nur Routen anzeigen, die der Verkehrsmittel-Auswahl entsprechen.
    // Gibt es keine passende Route, wird benachrichtigt und die übrigen Optionen gezeigt.
    const selectedProducts = getSelectedProducts();
    if (selectedProducts && result.length > 0) {
        const matching = result.filter(r => routeMatchesSelection(r, selectedProducts));
        if (matching.length > 0) {
            result = matching;
        } else {
            showToast('Keine Route mit der gewählten Verkehrsart gefunden. Andere Optionen werden angezeigt.', { type: 'warning', duration: 6000 });
        }
    }

    if (result.length > 1) result = removeSimilarRoutes(result);
    return result;
}

function directCarMinutes(directCarRoute) {
    return Math.round(Number(directCarRoute.durationSeconds || directCarRoute.duration || 0) / 60);
}

function emptyResultMessage(showPR) {
    if (!showPR) return 'Keine Direktfahrt mit dem Auto verfügbar.';
    return isCarFilterChecked()
        ? 'Keine passenden ÖPNV-Routen für diese Parkplätze gefunden.'
        : 'Keine ÖPNV-Route gefunden. Für Routen mit Auto bitte den Filter „Auto“ aktivieren.';
}

// Berechnet die Gesamtrouten und zeigt Direktfahrt- und P+R-Karten an
export async function showIntermodalResults(originLat, originLon, targetLat, targetLon) {
    const session = state.searchSession;
    // Direktfahrt nur, wenn "Auto" im Filter aktiv ist
    const showCar = isCarFilterChecked() && !!state.directCarRoute;
    // P+R-Routen ausblenden, wenn nur "Auto" gewählt ist
    const showPR = !isCarOnlyFilter();

    try {
        const resultsDiv = document.getElementById('results');

        const existingContainer = document.getElementById('intermodal-results-container');
        if (existingContainer) existingContainer.remove();

        const container = document.createElement('section');
        container.id = 'intermodal-results-container';
        container.className = 'routes';

        // Setzt alle Auswahl-Klassen und Buttons im Container zuverlässig zurück
        const clearAllSelections = () => {
            container.querySelectorAll('.route-card').forEach(c => {
                c.classList.remove('is-selected', 'is-selected--car');
                const btn = c.querySelector('.route-card__btn');
                if (btn) btn.textContent = 'Auswählen';
            });
        };

        const selectRoute = (route, card, userAction = true) => {
            clearAllSelections();
            card.classList.add('is-selected');
            card.querySelector('.route-card__btn').textContent = 'Ausgewählt';

            showRouteDetail(route, card, userAction);
            showOnlyParking(route.parkingLat, route.parkingLon);

            if (typeof drawFullIntermodalRoute === 'function') {
                drawFullIntermodalRoute(
                    originLat, originLon,
                    route.parkingLat, route.parkingLon,
                    targetLat, targetLon,
                    route.polylineTransit,
                    route.targetStopLat, route.targetStopLon,
                    hasDriveLeg(route),
                    route.legs
                );
            }

            document.dispatchEvent(new CustomEvent('parky:route-selected', { detail: { route } }));
            updateRoundTrip(route, originLat, originLon, targetLat, targetLon, card);
            updateTrafficInfo(route, card, originLat, originLon);
        };

        // P+R-Routen laden (nur wenn sie angezeigt werden sollen)
        let routes = [];
        let fetchFailed = false;
        if (showPR) {
            ({ routes, failed: fetchFailed } = await loadRoutes({ originLat, originLon, targetLat, targetLon }));
            routes = filterRoutes(routes);
        }
        const hasRoutes = routes.length > 0;

        // Direktfahrt-Karte (nur bei aktivem Auto-Filter)
        let directCard = null;
        if (showCar) {
            directCard = buildDirectCarCard(state.directCarRoute);
            directCard.addEventListener('click', () => {
                clearAllSelections();
                container.querySelectorAll(':scope > .route-detail').forEach(el => el.remove());

                directCard.classList.add('is-selected', 'is-selected--car');
                directCard.querySelector('.route-card__btn').textContent = 'Ausgewählt';

                if (typeof parkingMarkers !== 'undefined') {
                    parkingMarkers.forEach(m => map.removeLayer(m));
                }
                if (typeof drawDirectCarRoute === 'function') {
                    drawDirectCarRoute(originLat, originLon, targetLat, targetLon);
                }
                colorRouteByTraffic(originLat, originLon, targetLat, targetLon);
            });
            container.appendChild(directCard);
        }

        // Jede P+R-Route wird angezeigt
        const cards = [];
        let bestIndex = -1;
        if (hasRoutes) {
            bestIndex = routes.reduce(
                (best, r, i) => (Number(r.totalMinutes) < Number(routes[best].totalMinutes) ? i : best),
                0
            );
            routes.forEach((route, idx) => {
                const card = buildRouteCard(route, idx, idx === bestIndex);
                card.addEventListener('click', () => selectRoute(route, card));
                cards.push(card);
                container.appendChild(card);
            });
        }

        if (!directCard && !hasRoutes) {
            if (!fetchFailed) {
                showToast(emptyResultMessage(showPR), { type: 'warning', duration: 6000 });
            }
            return;
        }

        if (session !== state.searchSession) return;
        resultsDiv.appendChild(container);
        showTabBar();

        if (AUTO_SELECT_BEST_ROUTE) {
            const directMinutes = directCard ? directCarMinutes(state.directCarRoute) : Infinity;
            const bestPAndRMinutes = hasRoutes ? Number(routes[bestIndex].totalMinutes) : Infinity;
            // Mit Rückfahrt zeigt nur eine P+R-Route Parkdauer und Gebühr, daher bevorzugen
            const roundTripOn = document.getElementById('roundTrip')?.checked === true;
            const preferDirect = directCard
                && !(roundTripOn && hasRoutes)
                && (!hasRoutes || directMinutes <= bestPAndRMinutes || bestPAndRMinutes > directMinutes * 1.2);

            if (preferDirect) {
                directCard.click();
            } else {
                selectRoute(routes[bestIndex], cards[bestIndex], false);
            }
        }
    } catch (err) {
        console.error('Fehler bei der intermodalen Routenberechnung:', err);
        showToast('Die Gesamtrouten konnten nicht berechnet werden.', { type: 'error', duration: 6000 });
    }
}