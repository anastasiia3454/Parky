import { RECENT_SEARCHES_KEY, RECENT_SEARCHES_MAX, RECENT_SEARCHES_SHOWN } from '../config.js';
import { escapeHtml } from '../logic/format.js';

function readHistory() {
    try {
        return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)) || [];
    } catch {
        return [];
    }
}

function writeHistory(history) {
    try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('Letzte Suchen konnten nicht gespeichert werden:', e);
    }
}

export function saveRecentSearch(start, destination) {
    if (!start || !destination) return;

    let history = readHistory();
    history = history.filter(item => !(item.start === start && item.destination === destination));
    history.unshift({ start, destination });
    if (history.length > RECENT_SEARCHES_MAX) history.pop();

    writeHistory(history);
    renderRecentSearches();
}

export function renderRecentSearches() {
    const history = readHistory();
    let panel = document.getElementById('recentSearchesPanel');

    if (history.length === 0) {
        if (panel) panel.style.display = 'none';
        return;
    }

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'recentSearchesPanel';
        panel.className = 'recent-searches-container';
        const routeForm = document.getElementById('routeForm');
        if (routeForm) routeForm.insertAdjacentElement('afterend', panel);
    }

    panel.style.display = 'block';
    panel.innerHTML = `
        <h4>Neulich gesucht:</h4>
        <div class="recent-chips">
            ${history.slice(0, RECENT_SEARCHES_SHOWN).map((item, index) => `
                <button type="button" class="recent-chip" data-index="${index}">
                    ${escapeHtml(item.start)} ➔ ${escapeHtml(item.destination)}
                </button>
            `).join('')}
        </div>
    `;

    panel.querySelectorAll('.recent-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selected = history[e.currentTarget.dataset.index];

            const startInput = document.getElementById('start');
            const destInput = document.getElementById('destination');
            if (startInput) startInput.value = selected.start;
            if (destInput) destInput.value = selected.destination;

            const routeForm = document.getElementById('routeForm');
            if (routeForm) routeForm.requestSubmit();
        });
    });
}