import { state } from '../state.js';
import { resetResultsView } from './tabs.js';
import { abortLoadingToasts } from './toast.js';

// `clearMapResults` kommt aus der Karten-Datei (globaler Scope).

export function initReset() {
    document.getElementById('btnReset').addEventListener('click', () => {
        state.searchSession++;
        abortLoadingToasts();

        const submitBtn = document.getElementById('btnSearch');
        if (submitBtn) submitBtn.classList.remove('loading');

        const form = document.getElementById('routeForm');
        // Verkehrsmittel-Auswahl merken und nach dem Reset wiederherstellen
        const productStates = new Map();
        document.querySelectorAll('.product-filter input[type="checkbox"]')
            .forEach(box => productStates.set(box, box.checked));
        form.reset();
        productStates.forEach((checked, box) => { box.checked = checked; });

        const weightInput = document.getElementById('weightSpeed');
        if (weightInput) weightInput.dispatchEvent(new Event('input'));

        clearMapResults();

        const results = document.getElementById('results');
        results.innerHTML = `
            <div class="empty-state">
                <p>Gib Start und Ziel ein, um die optimalen P+R-Parkplätze zu berechnen.</p>
            </div>`;

        const costPanel = document.getElementById('costPanel');
        costPanel.innerHTML = '';

        resetResultsView();

        // Nur am Desktop: auf dem Handy würde dadurch die Tastatur aufgehen
        if (window.matchMedia('(min-width: 1025px)').matches) document.getElementById('start').focus();
    });
}