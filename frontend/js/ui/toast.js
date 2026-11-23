const TOAST_ICONS = {
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    success: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.8"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4M12 17h.01"/></svg>',
    error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>'
};

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 4;

// Laufende Lade-Meldungen, damit der Abbruch sie sofort beenden kann
const loadingToasts = new Set();

// Wandelt alle laufenden Lade-Meldungen in "Suche abgebrochen" um
export function abortLoadingToasts() {
    [...loadingToasts].forEach(toast => toast.abort());
}

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

export function showToast(message, options = {}) {
    const region = getToastRegion();
    const el = document.createElement('div');
    const icon = document.createElement('span');
    const text = document.createElement('span');

    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    text.className = 'toast__text';
    el.append(icon, text);

    let state = { type: 'info', loading: false, duration: DEFAULT_DURATION, ...options };
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
        loadingToasts.delete(handle);
        clearTimeout(timer);
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 400);
    }

    function update(newMessage, newOptions = {}) {
        if (closed) return;
        const durationGiven = newOptions.duration !== undefined;
        state = { ...state, ...newOptions };
        if (!state.loading && !durationGiven && newOptions.loading === false) state.duration = DEFAULT_DURATION;
        if (!state.loading) loadingToasts.delete(handle);
        render(newMessage);
        schedule();
    }

    // Sofortiger Abbruch: Lade-Meldung wird zur Hinweis-Meldung und bleibt sichtbar
    function abort() {
        if (closed || !state.loading) return;
        update('Suche abgebrochen', { type: 'info', loading: false, duration: 5000 });
    }

    render(message);
    region.appendChild(el);

    while (region.children.length > MAX_TOASTS) region.firstElementChild.remove();

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-visible')));
    el.addEventListener('click', close);
    schedule();

    const handle = { el, update, close, abort };
    if (state.loading) loadingToasts.add(handle);
    return handle;
}