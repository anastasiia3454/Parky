// ==========================================
// CODE VON PERSON 1 (UNVERÄNDERT BEIBEHALTEN)
// ==========================================

const closeWindow = document.getElementById("closeModal");
const welcomeModal = document.querySelector(".welcome-window");

if (sessionStorage.getItem("modalState") === "closed" && welcomeModal) {
    welcomeModal.style.display = "none";
}

if (closeWindow && welcomeModal) {
    closeWindow.addEventListener("click", () => {
        welcomeModal.classList.add("hidden");
        sessionStorage.setItem("modalState", "closed");
        setTimeout(() => {
            welcomeModal.style.display = "none";
        }, 300);
    });
}

async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'ParkAndRideApp/1.0'
        }
    });

    const data = await response.json();

    if (!data || data.length === 0) {
        throw new Error(`Adresse nicht gefunden: "${address}"`);
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
    };
}

const TOAST_ICONS = {
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    success: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.8"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4M12 17h.01"/></svg>',
    error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>'
};

function getToastRegion() {
    let region = document.getElementById('toastRegion');
    if (!region) {
        region = document.createElement('div');
        region.id = 'toastRegion';
        region.className = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    }
    return region;
}

/**
 * Zeigt eine Meldung oben rechts.
 * type:     'info' (blau) | 'success' (grün) | 'warning' (orange) | 'error' (rot)
 * duration: Anzeigedauer in ms (0 = bleibt, bis close() aufgerufen wird)
 * loading:  zeigt einen Spinner statt des Icons
 * Rückgabe: { el, update(message, options), close() }
 */
function showToast(message, options = {}) {
    const region = getToastRegion();
    const el = document.createElement('div');
    const icon = document.createElement('span');
    const text = document.createElement('span');

    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    text.className = 'toast__text';
    el.append(icon, text);

    let state = { type: 'info', loading: false, duration: 4000, ...options };
    if (state.loading && options.duration === undefined) state.duration = 0;

    let timer = null;
    let closed = false;

    function render(msg) {
        const visible = el.classList.contains('is-visible');
        el.className = `toast toast--${state.type}${visible ? ' is-visible' : ''}`;
        el.setAttribute('role', state.type === 'error' ? 'alert' : 'status');
        icon.innerHTML = state.loading
            ? '<span class="toast__spinner"></span>'
            : (TOAST_ICONS[state.type] || TOAST_ICONS.info);
        text.textContent = msg;
    }

    function schedule() {
        clearTimeout(timer);
        if (state.duration > 0) timer = setTimeout(close, state.duration);
    }

    function close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 400);
    }

    function update(newMessage, newOptions = {}) {
        if (closed) return;
        const durationGiven = newOptions.duration !== undefined;
        state = { ...state, ...newOptions };
        if (!state.loading && !durationGiven && newOptions.loading === false) state.duration = 4000;
        render(newMessage);
        schedule();
    }

    render(message);
    region.appendChild(el);

    // Maximal 4 Meldungen gleichzeitig
    while (region.children.length > 4) region.firstElementChild.remove();

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-visible')));
    el.addEventListener('click', close);
    schedule();

    return { el, update, close };
}

const AUTO_SELECT_BEST_ROUTE = true;

document.getElementById('routeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('btnSearch');
    const resultsDiv = document.getElementById('results');
    const startText = document.getElementById('start').value;
    const destText = document.getElementById('destination').value;

    resultsDiv.innerHTML = '';
    if (submitBtn) submitBtn.classList.add('loading');

    if (typeof clearRouteLayers === 'function') clearRouteLayers();

    const status = showToast('Adresse wird gesucht …', { type: 'info', loading: true });

    try {
        const startCoords = await geocodeAddress(startText);
        const destCoords = await geocodeAddress(destText);

        resultsDiv.innerHTML = `
            <p><b>Start:</b> ${escapeHtml(startCoords.displayName)}</p>
            <p><b>Ziel:</b> ${escapeHtml(destCoords.displayName)}</p>
        `;

        status.update('Suche optimale P+R-Parkplätze …');

        const sliderElement = document.querySelector('input[type="range"]') || document.getElementById('speedSlider');
        const sliderValue = sliderElement ? parseFloat(sliderElement.value) / 100 : 0.5;

        setStartMarker(startCoords.lat, startCoords.lon);
        setDestinationMarker(destCoords.lat, destCoords.lon, destCoords.displayName);

        const parkings = await fetchParkAndRide(
            startCoords.lat,
            startCoords.lon,
            destCoords.lat,
            destCoords.lon,
            sliderValue
        );

        if (parkings && parkings.length > 0) {
            const n = parkings.length;
            status.update(
                n === 1 ? '1 P+R-Parkplatz gefunden' : `${n} P+R-Parkplätze gefunden`,
                { type: 'success', loading: false, duration: 4000 }
            );
        } else {
            status.update('Keine P+R-Parkplätze im Umkreis von 20 km gefunden.', {
                type: 'warning', loading: false, duration: 6000
            });
        }

        const routeStatus = showToast('Berechne Gesamtrouten …', { type: 'info', loading: true });
        try {
            await fetchFullIntermodalRoute(startCoords.lat, startCoords.lon, destCoords.lat, destCoords.lon);
        } finally {
            routeStatus.close();
        }

    } catch (error) {
        console.error(error);
        const message = error && error.message && error.message.startsWith('Adresse nicht gefunden')
            ? error.message
            : 'Fehler bei der Suche oder API-Abfrage.';
        status.update(message, { type: 'error', loading: false, duration: 6000 });
    } finally {
        if (submitBtn) submitBtn.classList.remove('loading');
    }
});

async function fetchParkAndRide(lat, lon, destLat = null, destLon = null, weightSpeed = 0.5) {
    try {
        let url = `http://localhost:5000/api/parkandride?lat=${lat}&lon=${lon}&weightSpeed=${weightSpeed}`;
        if (destLat && destLon) {
            url += `&destLat=${destLat}&destLon=${destLon}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Fehler beim Laden: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Gefundene P+R Daten:", data);

        const parkings = data.parkings || [];
        const directCarRoute = data.directCarRoute;

        if (directCarRoute) {
            console.log(`Direkte Autofahrt: ca. ${Math.round(directCarRoute.durationSeconds / 60)} Min.`);
        }

        if (typeof displayParkingsOnMap === "function") {
            displayParkingsOnMap(parkings, lat, lon);
        }

        return parkings;
    } catch (error) {
        console.error("API-Fehler:", error);
        return [];
    }
}


function formatDuration(totalMinutes) {
    const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${m} Min.`;
    return rest === 0 ? `${h} Std.` : `${h} Std. ${rest} Min.`;
}

function buildRouteCard(route, index, isBest) {
    const num = (v) => Math.max(0, Math.round(Number(v) || 0));

    const segments = [
        { key: 'drive', label: 'Auto', minutes: num(route.driveMinutes) },
        { key: 'park', label: 'Parken', minutes: num(route.parkingBufferMinutes) },
        { key: 'transit', label: 'ÖPNV', minutes: num(route.transitMinutes) },
        { key: 'walk', label: 'Fußweg', minutes: num(route.walkingMinutes) }
    ];

    const bar = segments
        .filter(s => s.minutes > 0)
        .map(s => `<span class="route-card__seg route-card__seg--${s.key}" style="flex-grow:${s.minutes}"></span>`)
        .join('');

    const legend = segments
        .map(s => `
            <li>
                <i class="route-card__dot route-card__seg--${s.key}"></i>
                <span>${s.label}</span>
                <b>${s.minutes} Min.</b>
            </li>`)
        .join('');

    const badge = isBest ? `
        <span class="route-card__badge">
            <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2.8 14.9 8.7 21.4 9.6 16.7 14.2 17.8 20.7 12 17.6 6.2 20.7 7.3 14.2 2.6 9.6 9.1 8.7"/></svg>
            Schnellste Route
        </span>` : '';

    const card = document.createElement('article');
    card.className = 'route-card' + (isBest ? ' is-best' : '');
    card.innerHTML = `
        <header class="route-card__head">
            <div>
                <span class="route-card__option">Option ${index + 1}</span>
                <span class="route-card__place">${escapeHtml(route.parkingName)}</span>
            </div>
            <div class="route-card__total">
                ${formatDuration(route.totalMinutes)}
                <small>Gesamtzeit</small>
            </div>
        </header>
        ${badge}
        <div class="route-card__bar" aria-hidden="true">${bar}</div>
        <ul class="route-card__legend">${legend}</ul>
        <button type="button" class="route-card__btn">Auswählen</button>
    `;
    return card;
}

async function fetchFullIntermodalRoute(originLat, originLon, targetLat, targetLon) {
    try {
        const response = await fetch('http://localhost:5000/api/Route/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originLat: originLat,
                originLon: originLon,
                targetLat: targetLat,
                targetLon: targetLon,
                departureTime: new Date().toISOString()
            })
        });

        if (!response.ok) {
            console.error("Fehler bei der Anfrage an den RouteController");
            showToast('Die Gesamtrouten konnten nicht berechnet werden.', { type: 'error', duration: 6000 });
            return;
        }

        const routes = await response.json();
        const resultsDiv = document.getElementById('results');


        const existingContainer = document.getElementById('intermodal-results-container');
        if (existingContainer) existingContainer.remove();

        if (!routes || routes.length === 0) {
            showToast('Keine passenden ÖPNV-Routen für diese Parkplätze gefunden.', { type: 'warning', duration: 6000 });
            return;
        }

        const bestIndex = routes.reduce(
            (best, r, i) => (Number(r.totalMinutes) < Number(routes[best].totalMinutes) ? i : best),
            0
        );

        const container = document.createElement('section');
        container.id = 'intermodal-results-container';
        container.className = 'routes';
        container.innerHTML = `
            <div class="routes__head">
                <h3 class="routes__title">Gesamtrouten</h3>
                <span class="routes__sub">Auto, ÖPNV und Fußweg</span>
            </div>
        `;

        const cards = [];

        const selectRoute = (route, card) => {
            cards.forEach(c => {
                const isSelected = c === card;
                c.classList.toggle('is-selected', isSelected);
                c.querySelector('.route-card__btn').textContent = isSelected ? 'Ausgewählt' : 'Auswählen';
            });

            if (typeof drawFullIntermodalRoute === 'function') {
                drawFullIntermodalRoute(
                    originLat,
                    originLon,
                    route.parkingLat,
                    route.parkingLon,
                    targetLat,
                    targetLon,
                    route.polylineTransit,
                    route.targetStopLat,
                    route.targetStopLon
                );
            }

            document.dispatchEvent(new CustomEvent('parky:route-selected', { detail: { route } }));
        };

        routes.forEach((route, idx) => {
            const card = buildRouteCard(route, idx, idx === bestIndex);
            card.addEventListener('click', () => selectRoute(route, card));
            cards.push(card);
            container.appendChild(card);
        });

        resultsDiv.appendChild(container);

        if (AUTO_SELECT_BEST_ROUTE) {
            selectRoute(routes[bestIndex], cards[bestIndex]);
        }
    } catch (err) {
        console.error("Fehler bei der intermodalen Routenberechnung:", err);
        showToast('Die Gesamtrouten konnten nicht berechnet werden.', { type: 'error', duration: 6000 });
    }
}