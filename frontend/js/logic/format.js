const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

export function formatDuration(totalMinutes) {
    const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${m} Min.`;
    return rest === 0 ? `${h} Std.` : `${h} Std. ${rest} Min.`;
}

export function formatClock(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function formatEuro(value) {
    return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// Wert für <input type="datetime-local">
export function toLocalInputValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Negative/ungültige Werte werden zu 0, sonst auf ganze Minuten gerundet
export function toMinutes(value) {
    return Math.max(0, Math.round(Number(value) || 0));
}