import { fetchReturnRoute } from '../api/returnRoute.js';
import { calcParkingFee } from '../logic/parkingFee.js';
import {
    escapeHtml, formatClock, formatDuration, formatEuro, toLocalInputValue, toMinutes
} from '../logic/format.js';
import { hasDriveLeg } from '../logic/routeFilter.js';
import { getSelectedProducts } from './filters.js';
import { buildTransitStep, buildWalkStep, detailStep } from './routeDetail.js';
import { setCostsTabVisible } from './tabs.js';

const DEFAULT_RETURN_OFFSET_MS = 8 * 60 * 60 * 1000;

// Rückfahrtzeit nur anzeigen, wenn Hin- und Rückfahrt gewählt ist
export function initRoundTripInput() {
    const toggle = document.getElementById('roundTrip');
    const wrap = document.getElementById('returnTimeWrap');
    const input = document.getElementById('returnTime');
    if (!toggle || !wrap || !input) return;

    toggle.addEventListener('change', () => {
        wrap.hidden = !toggle.checked;
        if (toggle.checked && !input.value) {
            const now = new Date();
            input.min = toLocalInputValue(now);
            input.value = toLocalInputValue(new Date(now.getTime() + DEFAULT_RETURN_OFFSET_MS));
        }
    });
}

export async function updateRoundTrip(route, originLat, originLon, targetLat, targetLon, card) {
    const old = document.getElementById('round-trip-panel');
    if (old) old.remove();
    document.querySelectorAll('#roundtrip-cost').forEach(el => el.remove());
    setCostsTabVisible(false);

    const toggle = document.getElementById('roundTrip');
    if (!toggle || !toggle.checked) return;
    const withCar = hasDriveLeg(route);

    // Rückfahrt wird direkt in der Detailansicht der gewählten Option angezeigt
    const detail = card && card.nextElementSibling && card.nextElementSibling.classList.contains('route-detail')
        ? card.nextElementSibling
        : null;
    if (!detail) return;

    const panel = document.createElement('section');
    panel.id = 'round-trip-panel';
    panel.className = 'roundtrip-section';
    panel.innerHTML = `
        <div class="routes__head">
            <h3 class="routes__title">Rückfahrt</h3>
            <span class="routes__sub">${withCar ? 'Ziel → Parkplatz → Startpunkt' : 'Ziel → Startpunkt'}</span>
        </div>
        <p class="empty-state">Rückfahrt wird berechnet …</p>
    `;
    detail.appendChild(panel);

    const setNote = text => {
        const note = panel.querySelector('.empty-state');
        if (note) note.textContent = text;
    };

    const returnInput = document.getElementById('returnTime');
    if (!returnInput || !returnInput.value) {
        setNote('Bitte eine Rückfahrtzeit eingeben.');
        return;
    }

    const returnAt = new Date(returnInput.value);
    const outboundArrival = Date.now() + Number(route.totalMinutes) * 60000;
    if (returnAt.getTime() < outboundArrival) {
        setNote('Die Rückfahrt muss nach der Ankunft am Ziel liegen.');
        return;
    }

    try {
        const ret = await fetchReturnRoute({
            originLat,
            originLon,
            parkingLat: withCar ? route.parkingLat : originLat,
            parkingLon: withCar ? route.parkingLon : originLon,
            targetLat,
            targetLon,
            departureTime: returnAt.toISOString(),
            driveMinutes: withCar ? Number(route.driveMinutes) : 0,
            products: getSelectedProducts()
        });
        renderRoundTripPanel(panel, route, ret);
    } catch (err) {
        console.error('Rückfahrt:', err);
        setNote(`Rückfahrt nicht möglich: ${err.message}`);
    }
}

function renderRoundTripPanel(panel, route, ret) {
    const withCar = hasDriveLeg(route);
    const legs = (ret.legs || []).filter(Boolean);
    const totalMinutes = (Date.parse(ret.arrivalHome) - Date.parse(ret.departureFromTarget)) / 60000;

    // Wartezeit: vom gewünschten Abfahrtszeitpunkt am Ziel bis zur ersten ÖPNV-Abfahrt
    const firstWalkMinutes = legs[0] && legs[0].isWalk ? toMinutes(legs[0].minutes) : 0;
    const firstTransit = legs.find(l => !l.isWalk && l.departure);
    let waitMinutes = 0;
    if (firstTransit) {
        waitMinutes = Math.round(
            (Date.parse(firstTransit.departure) - Date.parse(ret.departureFromTarget)) / 60000 - firstWalkMinutes
        );
    }

    // Gleicher Aufbau wie die Routendetails der Hinfahrt
    panel.className = 'route-detail roundtrip-section';
    panel.innerHTML = `
        <header class="route-detail__head">
            <div>
                <h4 class="route-detail__title">Rückfahrt: Routendetails</h4>
                <span class="route-detail__sub">${withCar ? 'Ziel → Parkplatz → Startpunkt' : 'Ziel → Startpunkt'}</span>
            </div>
            <div class="route-detail__total">
                ${formatDuration(totalMinutes)}
                <small class="route-detail__sub">Gesamtzeit</small>
            </div>
        </header>
    `;

    const steps = document.createElement('ul');
    steps.className = 'route-detail__steps';

    legs.forEach((leg, i) => {
        if (leg.isWalk) {
            const isLast = i === legs.length - 1;
            const title = isLast
                ? (withCar ? 'Zu Fuß zum Auto' : 'Zu Fuß zum Startpunkt')
                : 'Zu Fuß zur Haltestelle';
            steps.appendChild(buildWalkStep(leg, title));
            return;
        }

        // Wartezeit als eigener Abschnitt vor der ersten ÖPNV-Fahrt
        if (leg === firstTransit && waitMinutes > 0) {
            steps.appendChild(detailStep('park', null, {
                title: 'Wartezeit',
                meta: `bis Abfahrt um ${formatClock(leg.departure)}`,
                time: formatDuration(waitMinutes)
            }));
        }

        steps.appendChild(buildTransitStep(leg));
    });

    if (withCar) {
        steps.appendChild(detailStep('drive', null, {
            title: 'Mit dem Auto zum Startpunkt',
            meta: 'Parkplatz → Startpunkt',
            time: `${toMinutes(ret.driveHomeMinutes)} Min.`
        }));
    }

    steps.appendChild(detailStep('park', null, {
        title: 'Ankunft am Startpunkt',
        time: formatClock(ret.arrivalHome)
    }));

    panel.appendChild(steps);

    // Parkdauer und Gebühr auf die Seite der Parkgebühren
    if (withCar) {
        const parkedFrom = Date.now() + (Number(route.driveMinutes) + Number(route.parkingBufferMinutes)) * 60000;
        const parkedUntil = Date.parse(ret.arrivalAtParking);
        const parkedMinutes = Math.max(0, Math.round((parkedUntil - parkedFrom) / 60000));

        renderRoundTripCost(route, parkedFrom, ret.arrivalAtParking, parkedMinutes, buildFeeText(route, parkedMinutes));
    }
}

function buildFeeText(route, parkedMinutes) {
    if (route.feeStatus === 'free') return 'kostenlos';

    const fee = calcParkingFee(route, parkedMinutes);
    if (fee !== null) return formatEuro(fee);

    const hint = route.feeDescription ? ` (OSM: ${escapeHtml(route.feeDescription)})` : '';
    return `Tarif unbekannt${hint}`;
}

function renderRoundTripCost(route, parkedFrom, parkedUntilIso, parkedMinutes, feeText) {
    document.querySelectorAll('#roundtrip-cost').forEach(el => el.remove());

    const costPanel = document.getElementById('costPanel');
    if (!costPanel) return;

    const block = document.createElement('div');
    block.id = 'roundtrip-cost';
    block.className = 'roundtrip-cost';
    block.innerHTML = `
        <div class="cost-summary"><span>Abgestellt am Parkplatz</span><b>${formatClock(new Date(parkedFrom).toISOString())}</b></div>
        <div class="cost-summary"><span>Zurück am Parkplatz</span><b>${formatClock(parkedUntilIso)}</b></div>
        <div class="cost-summary"><span>Parkdauer</span><b>${formatDuration(parkedMinutes)}</b></div>
        <div class="cost-summary"><span>Parkgebühr · ${escapeHtml(route.parkingName)}</span><b>${feeText}</b></div>
        <p class="cost-note">Parkdauer = Zeit zwischen Abstellen und Rückkehr am Parkplatz. Die Gebühr wird genau nach Minuten aus dem OSM-Tarif berechnet. Die tatsächliche Abrechnung kann nach angefangenen Stunden erfolgen.</p>
    `;
    costPanel.appendChild(block);
    setCostsTabVisible(true);
}