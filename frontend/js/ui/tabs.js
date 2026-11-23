// Parkgebühren-Tab nur zeigen, wenn eine Rückfahrt mit Parkdaten vorliegt
export function setCostsTabVisible(visible) {
    const tab = document.querySelector('.sheet-tab[data-tab="costs"]');
    if (!tab) return;
    tab.hidden = !visible;
    // Ohne Parkgebühren-Tab füllt „Routen“ die ganze Breite aus
    const tabs = document.querySelector('.sheet-tabs');
    if (tabs) tabs.style.gridTemplateColumns = visible ? '' : '1fr';
    if (!visible && tab.classList.contains('is-active')) {
        const routesTab = document.querySelector('.sheet-tab[data-tab="routes"]');
        if (routesTab) routesTab.click();
    }
}

// Aktiviert einen Tab ("routes" oder "costs") und zeigt das passende Panel
export function activateTab(name) {
    document.querySelectorAll('.sheet-tab').forEach(t => {
        const active = t.dataset.tab === name;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
    });
    const results = document.getElementById('results');
    const costPanel = document.getElementById('costPanel');
    if (results) results.hidden = name !== 'routes';
    if (costPanel) costPanel.hidden = name !== 'costs';
}

// Tab-Leiste ausblenden und auf den Routen-Tab zurückstellen,
// sonst bleibt nach dem Ausblenden nichts sichtbar
export function resetResultsView() {
    const sheetTabs = document.querySelector('.sheet-tabs');
    if (sheetTabs) sheetTabs.hidden = true;
    setCostsTabVisible(false);
    activateTab('routes');
}

export function showTabBar() {
    const sheetTabs = document.querySelector('.sheet-tabs');
    if (sheetTabs) sheetTabs.hidden = false;
}

export function initTabs() {
    document.querySelectorAll('.sheet-tab').forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });
}