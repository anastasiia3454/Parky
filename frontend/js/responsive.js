(() => {
    const sheet = document.getElementById('sidebar');
    const grabber = document.getElementById('sheetGrabber');
    const body = document.getElementById('sheetBody');
    const summary = document.getElementById('sheetSummary');
    const summaryText = summary ? summary.querySelector('span') : null;
    const probe = document.getElementById('sheetProbe');
    const results = document.getElementById('results');
    const form = document.getElementById('routeForm');

    if (!sheet || !grabber || !body) return;

    const DEFAULT_SUMMARY = 'Wohin soll’s gehen? Nach oben wischen und Route planen.';
    const mq = window.matchMedia('(max-width: 1024px)');

    let expanded = false;
    let dragging = false;
    let moved = false;
    let startY = 0;
    let startOffset = 0;
    let currentOffset = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    const isSheetMode = () => mq.matches;
    const peekHeight = () => (probe ? probe.offsetHeight : 104);
    const maxOffset = () => Math.max(0, sheet.offsetHeight - peekHeight());

    function setExpanded(value) {
        expanded = value;
        sheet.classList.toggle('is-expanded', value);
        grabber.setAttribute('aria-expanded', String(value));

        if (isSheetMode()) {
            body.inert = !value;
        }
    }

    function clearInlineStyles() {
        sheet.style.transform = '';
        if (summary) summary.style.removeProperty('--p');
    }

    grabber.addEventListener('pointerdown', (e) => {
        if (!isSheetMode()) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        dragging = true;
        moved = false;
        startY = lastY = e.clientY;
        lastTime = e.timeStamp;
        velocity = 0;
        startOffset = currentOffset = expanded ? 0 : maxOffset();

        sheet.classList.add('is-dragging');
        grabber.setPointerCapture(e.pointerId);
    });

    grabber.addEventListener('pointermove', (e) => {
        if (!dragging) return;

        const dy = e.clientY - startY;
        if (Math.abs(dy) > 4) moved = true;

        const max = maxOffset();
        let offset = startOffset + dy;

        if (offset < 0) offset *= 0.25;
        else if (offset > max) offset = max + (offset - max) * 0.25;

        currentOffset = offset;
        sheet.style.transform = `translate3d(0, ${offset}px, 0)`;

        if (summary && max > 0) {
            const progress = Math.min(1, Math.max(0, 1 - offset / max));
            summary.style.setProperty('--p', progress.toFixed(3));
        }

        const dt = e.timeStamp - lastTime;
        if (dt > 0) {
            velocity = 0.8 * ((e.clientY - lastY) / dt) + 0.2 * velocity;
            lastY = e.clientY;
            lastTime = e.timeStamp;
        }
    });

    function endDrag(e) {
        if (!dragging) return;
        dragging = false;

        if (grabber.hasPointerCapture(e.pointerId)) {
            grabber.releasePointerCapture(e.pointerId);
        }

        let target;
        if (!moved) {
            target = !expanded;                
        } else if (Math.abs(velocity) > 0.35) {
            target = velocity < 0;   
        } else {
            target = currentOffset < maxOffset() / 2;
        }

        sheet.classList.remove('is-dragging');
        clearInlineStyles();
        setExpanded(target);
    }

    grabber.addEventListener('pointerup', endDrag);
    grabber.addEventListener('pointercancel', endDrag);

    grabber.addEventListener('keydown', (e) => {
        if (!isSheetMode()) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setExpanded(true);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setExpanded(false);
        }
    });

    if (form) {
        form.addEventListener('submit', () => {
            if (!isSheetMode()) return;
            if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
            }
            setTimeout(() => setExpanded(false), 150);
        });
    }

    function updateSummary() {
        if (!results || !summaryText) return;

        const isEmpty = results.querySelector('.empty-state');
        const text = results.innerText.replace(/\s+/g, ' ').trim();

        summaryText.textContent = !isEmpty && text ? text : DEFAULT_SUMMARY;
    }

    if (results && 'MutationObserver' in window) {
        new MutationObserver(updateSummary).observe(results, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
    updateSummary();

    function applyMode() {
        clearInlineStyles();
        sheet.classList.remove('is-dragging');

        if (isSheetMode()) {
            setExpanded(false);
        } else {
            sheet.classList.remove('is-expanded');
            body.inert = false;
            grabber.removeAttribute('aria-expanded');
        }
    }

    if (mq.addEventListener) mq.addEventListener('change', applyMode);
    else mq.addListener(applyMode);

    applyMode();
})();