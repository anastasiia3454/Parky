import { PRODUCT_COLORS, PRODUCT_LABELS } from '../config.js';
import { escapeHtml, formatClock, formatDuration, toMinutes } from '../logic/format.js';
import { hasDriveLeg } from '../logic/routeFilter.js';

export function productColor(product) {
    return PRODUCT_COLORS[product] || '#6b7280';
}

export function detailStep(modifier, rail, { title, meta = '', body = '', lineHtml = '', time = '' }) {
    const li = document.createElement('li');
    li.className = `route-detail__step route-detail__step--${modifier}`;
    if (rail) li.style.setProperty('--rail', rail);
    li.innerHTML = `
        <span class="route-detail__dot" aria-hidden="true"></span>
        <div class="route-detail__body">
            <div class="route-detail__name">${lineHtml}${escapeHtml(title)}</div>
            ${meta ? `<div class="route-detail__meta">${meta}</div>` : ''}
            ${body}
        </div>
        <div class="route-detail__time">${time}</div>
    `;
    return li;
}

export function stopRow(label, name, clock) {
    const when = clock ? ` · ${escapeHtml(clock)}` : '';
    return `<div class="route-detail__stop"><span class="route-detail__stop-label">${label}</span>${escapeHtml(name || 'Unbekannt')}${when}</div>`;
}

// Fußweg-Schritt (Hin- und Rückfahrt nutzen unterschiedliche Titel)
export function buildWalkStep(leg, title) {
    return detailStep('walk', null, {
        title,
        meta: `${escapeHtml(leg.fromName || '')}${leg.toName ? ' → ' + escapeHtml(leg.toName) : ''}`,
        time: `${toMinutes(leg.minutes)} Min.`
    });
}

// ÖPNV-Schritt, gleich für Hin- und Rückfahrt
export function buildTransitStep(leg) {
    const minutes = toMinutes(leg.minutes);
    const color = productColor(leg.product);
    const productLabel = PRODUCT_LABELS[leg.product] || 'ÖPNV';
    const lineName = leg.lineName || productLabel;
    const direction = leg.direction ? `Richtung ${leg.direction}` : productLabel;

    return detailStep('transit', color, {
        title: direction,
        lineHtml: `<span class="route-detail__line" style="--line-color:${color}">${escapeHtml(lineName)}</span>`,
        meta: `${escapeHtml(productLabel)} · ${minutes} Min.`,
        body: stopRow('Einsteigen', leg.fromName, formatClock(leg.departure))
            + stopRow('Aussteigen', leg.toName, formatClock(leg.arrival)),
        time: formatClock(leg.departure) || `${minutes} Min.`
    });
}

export function buildRouteDetail(route, index, isBest) {
    const wrap = document.createElement('section');
    wrap.className = 'route-detail';

    const legs = Array.isArray(route.legs) ? route.legs.filter(Boolean) : [];
    const transitLegs = legs.filter(l => !l.isWalk);
    const lastTransit = transitLegs[transitLegs.length - 1];

    const steps = document.createElement('ul');
    steps.className = 'route-detail__steps';

    if (hasDriveLeg(route)) {
        steps.appendChild(detailStep('drive', null, {
            title: 'Mit dem Auto zum P+R',
            meta: 'Start → Parkplatz',
            body: stopRow('Parkplatz', route.parkingName || 'P+R Parkplatz'),
            time: `${toMinutes(route.driveMinutes)} Min.`
        }));
        steps.appendChild(detailStep('park', null, {
            title: 'Auto abstellen',
            time: `${toMinutes(route.parkingBufferMinutes)} Min.`
        }));
    }

    if (legs.length > 0) {
        legs.forEach(leg => {
            steps.appendChild(leg.isWalk
                ? buildWalkStep(leg, 'Zu Fuß zur Haltestelle')
                : buildTransitStep(leg));
        });
    } else {
        steps.appendChild(detailStep('transit', null, {
            title: 'ÖPNV',
            body: '<p class="route-detail__empty">Keine Angaben zu Linie und Haltestellen verfügbar.</p>',
            time: `${toMinutes(route.transitMinutes)} Min.`
        }));
    }

    steps.appendChild(detailStep('walk', null, {
        title: 'Zu Fuß zum Ziel',
        meta: lastTransit && lastTransit.toName ? `ab ${escapeHtml(lastTransit.toName)}` : '',
        time: `${toMinutes(route.walkingMinutes)} Min.`
    }));

    const best = isBest ? '<span class="route-card__badge">Schnellste Route</span>' : '';
    const filterNote = route.matchesProductFilter === false
        ? '<span class="route-detail__sub">Keine Verbindung mit der gewählten Verkehrsart gefunden, gezeigt wird die schnellste.</span>'
        : '';

    wrap.innerHTML = `
        <header class="route-detail__head">
            <div>
                <h4 class="route-detail__title">Option ${index + 1}: Routendetails</h4>
                <span class="route-detail__sub">${escapeHtml(route.parkingName || 'P+R Parkplatz')}</span>
                ${best}
                ${filterNote}
            </div>
            <div class="route-detail__total">
                ${formatDuration(route.totalMinutes)}
                <small class="route-detail__sub">Gesamtzeit</small>
            </div>
        </header>
    `;
    wrap.appendChild(steps);
    return wrap;
}

export function showRouteDetail(route, card, userAction = true) {
    const container = card.parentElement;
    if (!container) return;

    container.querySelectorAll(':scope > .route-detail').forEach(el => el.remove());

    const allCards = Array.from(container.querySelectorAll('.route-card'));
    const hasDirectCar = container.querySelector('.route-card--direct-car') !== null;
    let index = allCards.indexOf(card);
    if (hasDirectCar) index -= 1;

    const isBest = card.classList.contains('is-best');
    const detail = buildRouteDetail(route, index, isBest);

    card.insertAdjacentElement('afterend', detail);

    if (userAction) {
        detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}