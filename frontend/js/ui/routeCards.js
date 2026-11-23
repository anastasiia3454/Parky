import { escapeHtml, formatDuration, toMinutes } from '../logic/format.js';
import { hasDriveLeg } from '../logic/routeFilter.js';

export function buildRouteCard(route, index, isBest) {
    const segments = [
        { key: 'drive', label: 'Auto', minutes: toMinutes(route.driveMinutes) },
        { key: 'park', label: 'Parken', minutes: toMinutes(route.parkingBufferMinutes) },
        { key: 'transit', label: 'ÖPNV', minutes: toMinutes(route.transitMinutes) },
        { key: 'walk', label: 'Fußweg', minutes: toMinutes(route.walkingMinutes) + toMinutes(route.startWalkingMinutes) }
    ];

    const bar = segments
        .filter(s => s.minutes > 0)
        .map(s => `<span class="route-card__seg route-card__seg--${s.key}" style="flex-grow:${s.minutes}"></span>`)
        .join('');

    const legend = segments
        .filter(s => hasDriveLeg(route) || (s.key !== 'drive' && s.key !== 'park'))
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

export function buildDirectCarCard(directCarRoute) {
    const sec = directCarRoute.durationSeconds || directCarRoute.duration || 0;
    const dist = directCarRoute.distanceMeters || directCarRoute.distance || 0;

    const minutes = Math.round(sec / 60);
    const km = (dist / 1000).toFixed(1);

    const card = document.createElement('article');
    card.className = 'route-card route-card--direct-car';
    card.innerHTML = `
        <header class="route-card__head">
            <div>
                <span class="route-card__badge route-card__badge--car">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="8" width="18" height="10" rx="2"/>
                        <circle cx="7" cy="18" r="2"/>
                        <circle cx="17" cy="18" r="2"/>
                        <path d="M5 8l2-4h10l2 4"/>
                    </svg>
                    Direktfahrt Auto
                </span>
                <span class="route-card__place" style="margin-top: 8px;">Ohne Umstieg & ÖPNV</span>
            </div>
            <div class="route-card__total" style="color: #00bfff;">
                ${formatDuration(minutes)}
                <small>${km} km · Gesamtzeit</small>
            </div>
        </header>

        <div class="route-detail route-detail--car" style="margin-top: 6px;">
            <div class="route-detail__steps">
                <div class="route-detail__step route-detail__step--drive">
                    <div class="route-detail__dot"></div>
                    <div class="route-detail__body">
                        <div class="route-detail__name">Direkte Autofahrt zum Ziel</div>
                        <div class="route-detail__meta">Kein Parken erforderlich • Direkt zum Zielpunkt</div>
                    </div>
                    <div class="route-detail__time" style="color: #00bfff;">${minutes} Min.</div>
                </div>
            </div>
        </div>

        <button type="button" class="route-card__btn">Auswählen</button>
    `;
    return card;
}