/* Parky – desktop.js: Seitenleiste auf dem Desktop öffnen und schließen */
(function () {
    const desktopQuery = window.matchMedia('(min-width: 1025px)');
    const sidebar = document.getElementById('sidebar');
    const body = document.getElementById('sheetBody');
    const start = document.getElementById('start');
    const dest = document.getElementById('destination');
    const results = document.getElementById('results');
    const costPanel = document.getElementById('costPanel');
    const hint = document.getElementById('deskScrollHint');
    const closeBtn = document.getElementById('deskClose');
    if (!sidebar || !body || !start || !dest) return;

    const MOBILE_PLACEHOLDER = dest.placeholder;
    const DESKTOP_PLACEHOLDER = 'Wo soll es hin?...';

    const isDesktop = () => desktopQuery.matches;

    // Scroll-Pfeil nur zeigen, solange unten noch Inhalt ist
    function updateHint() {
        if (!hint) return;
        const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
        hint.classList.toggle('is-hidden', atBottom);
    }

    function setOpen(open) {
        sidebar.classList.toggle('desk-open', open && isDesktop());
        // Nach der Höhenanimation (0,45 s) den Pfeil neu prüfen
        updateHint();
        setTimeout(updateHint, 480);
    }

    function hasOutput() {
        const hasResults = results &&
            Array.from(results.children).some(el => !el.classList.contains('empty-state'));
        const hasCost = costPanel && !costPanel.hidden && costPanel.children.length > 0;
        return Boolean(hasResults || hasCost);
    }

    function syncMode() {
        dest.placeholder = isDesktop() ? DESKTOP_PLACEHOLDER : MOBILE_PLACEHOLDER;
        if (!isDesktop()) {
            sidebar.classList.remove('desk-open');
        } else if (start.value.trim() || hasOutput()) {
            setOpen(true);
        }
    }
    desktopQuery.addEventListener('change', syncMode);
    syncMode();

    // Öffnen: Fokus in der Leiste oder Enter im Zielfeld
    sidebar.addEventListener('focusin', () => setOpen(true));
    dest.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') setOpen(true);
    });

    // Schließen nur durch den Nutzer: Griff unten oder Escape.
    // Klicks auf die Karte schließen die Leiste bewusst nicht.
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (document.activeElement && sidebar.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            setOpen(false);
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !isDesktop() || !sidebar.classList.contains('desk-open')) return;
        if (document.activeElement) document.activeElement.blur();
        setOpen(false);
    });

    // Scroll-Pfeil: ein Stück nach unten scrollen
    if (hint) {
        hint.addEventListener('click', () => {
            body.scrollBy({ top: body.clientHeight * 0.8, behavior: 'smooth' });
        });
    }
    body.addEventListener('scroll', updateHint, { passive: true });
    window.addEventListener('resize', updateHint);

    // Sobald Ergebnisse da sind, bleibt die Leiste offen
    const observer = new MutationObserver(() => {
        if (isDesktop() && hasOutput()) setOpen(true);
        updateHint();
    });
    if (results) observer.observe(results, { childList: true, subtree: true });
    if (costPanel) observer.observe(costPanel, { childList: true, attributes: true, attributeFilter: ['hidden'] });
})();