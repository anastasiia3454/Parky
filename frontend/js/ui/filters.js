export function isCarFilterChecked() {
    const car = document.getElementById('filterOnlyCar');
    return !!(car && car.checked);
}

// Gewählte ÖPNV-Verkehrsmittel oder null, wenn keines gewählt ist
export function getSelectedProducts() {
    const boxes = document.querySelectorAll('.product-filter input[type="checkbox"]:checked:not(#filterOnlyCar)');
    const values = [];
    boxes.forEach(box => box.value.split(',').forEach(v => values.push(v.trim())));
    return values.length === 0 ? null : values;
}

// Nur "Auto" ausgewählt (kein ÖPNV-Verkehrsmittel) -> nur Direktfahrt anzeigen
export function isCarOnlyFilter() {
    return isCarFilterChecked() && getSelectedProducts() === null;
}

// Deutschlandticket: alle Verkehrsmittel außer Fernverkehr
export function initFilters() {
    const btn = document.getElementById('btnDeutschlandticket');
    if (!btn) return;

    btn.addEventListener('click', () => {
        document.querySelectorAll('.product-filter input[type="checkbox"]').forEach(box => {
            if (box.id === 'filterOnlyCar') { box.checked = false; return; }
            box.checked = !box.value.split(',').some(v => v.trim() === 'nationalExpress' || v.trim() === 'national');
        });
    });
}