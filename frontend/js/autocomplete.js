(function () {
    const API_BASE = 'https://parky-luln.onrender.com';
    const MIN_CHARS = 3;
    const DEBOUNCE_MS = 150;
    const cache = new Map();

    // Vorschläge kommen vom Backend (Photon wird dort abgefragt, siehe GeocodeController)
    async function fetchSuggestions(query, signal) {
        const key = query.toLowerCase();
        if (cache.has(key)) return cache.get(key);

        const response = await fetch(`${API_BASE}/api/Geocode/suggest?q=${encodeURIComponent(query)}`, { signal });
        if (!response.ok) throw new Error(`Adressvorschläge: HTTP ${response.status}`);

        const labels = await response.json();
        cache.set(key, labels);
        return labels;
    }

    function attach(input) {
        const wrapper = input.closest('.input-group');
        if (!wrapper) return;

        const list = document.createElement('ul');
        list.className = 'suggest-list';
        list.id = `${input.id}-suggestions`;
        list.setAttribute('role', 'listbox');
        list.hidden = true;
        wrapper.appendChild(list);

        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', list.id);
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('autocomplete', 'off');

        let items = [];
        let activeIndex = -1;
        let timer = null;
        let controller = null;

        function setOpen(open) {
            list.hidden = !open;
            input.setAttribute('aria-expanded', String(open));
            if (!open) {
                activeIndex = -1;
                input.removeAttribute('aria-activedescendant');
            }
        }

        function setActive(index) {
            activeIndex = index;
            items.forEach((li, i) => {
                const active = i === index;
                li.classList.toggle('is-active', active);
                li.setAttribute('aria-selected', String(active));
            });
            if (index >= 0) input.setAttribute('aria-activedescendant', items[index].id);
        }

        function choose(index) {
            input.value = items[index].textContent;
            setOpen(false);
        }

        // Hinweis statt stiller Fehler, damit sichtbar ist, warum keine Vorschläge kommen
        function showNote(text) {
            list.innerHTML = '';
            items = [];
            const li = document.createElement('li');
            li.className = 'suggest-item suggest-note';
            li.textContent = text;
            list.appendChild(li);
            setOpen(true);
        }

        function render(labels) {
            list.innerHTML = '';
            items = labels.map((label, i) => {
                const li = document.createElement('li');
                li.className = 'suggest-item';
                li.id = `${list.id}-${i}`;
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', 'false');
                li.textContent = label;
                li.addEventListener('mousedown', e => {
                    e.preventDefault();
                    choose(i);
                });
                list.appendChild(li);
                return li;
            });
            activeIndex = -1;
            setOpen(items.length > 0);
        }

        input.addEventListener('input', () => {
            clearTimeout(timer);
            if (controller) controller.abort();

            const query = input.value.trim();
            if (query.length < MIN_CHARS) {
                setOpen(false);
                return;
            }

            timer = setTimeout(async () => {
                controller = new AbortController();
                try {
                    const labels = await fetchSuggestions(query, controller.signal);
                    if (input.value.trim() !== query) return;
                    render(labels);
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('Adressvorschläge:', err);
                        showNote('Adressvorschläge gerade nicht verfügbar');
                    }
                }
            }, DEBOUNCE_MS);
        });

        input.addEventListener('keydown', e => {
            if (list.hidden || items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((activeIndex + 1) % items.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
            } else if (e.key === 'Enter' && activeIndex >= 0) {
                e.preventDefault();
                choose(activeIndex);
            } else if (e.key === 'Escape') {
                setOpen(false);
            }
        });

        input.addEventListener('blur', () => setOpen(false));
    }

    document.addEventListener('DOMContentLoaded', () => {
        ['start', 'destination'].forEach(id => {
            const input = document.getElementById(id);
            if (input) attach(input);
        });
    });
})();