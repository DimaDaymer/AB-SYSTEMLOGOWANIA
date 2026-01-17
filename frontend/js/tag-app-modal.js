// frontend/js/tag-app-modal.js

(function() {
    // Przestrzeń nazw dla modułu tagów
    window.TagApp = window.TagApp || {};

    // Pomocnicza funkcja do pobierania tokenu (taka sama jak w albums1.js)
    function getToken() {
        return localStorage.getItem('token');
    }

    // Pomocnicza funkcja do komunikatów (korzysta z globalnej lub alertu)
    function notify(msg, isError = false) {
        if (window.showMessage) {
            window.showMessage(msg, isError);
        } else {
            alert((isError ? 'Błąd: ' : '') + msg);
        }
    }

    window.TagApp.modal = {
        currentEntityId: null,

        async open(entityId) {
            const token = getToken();
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            this.currentEntityId = entityId;

            // 1. Sprawdź czy HTML modala już istnieje w DOM
            let overlay = document.getElementById('tag-overlay');

            if (!overlay) {
                try {
                    // Pobieranie szablonu HTML
                    const resp = await fetch('/tag_window.html');
                    if (!resp.ok) throw new Error('Nie udało się załadować widoku tagów');
                    const html = await resp.text();

                    // Parsowanie i wstrzykiwanie do DOM
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');

                    // Wstrzykiwanie stylów
                    const style = doc.querySelector('style');
                    if (style && !document.getElementById('tag-window-styles')) {
                        style.id = 'tag-window-styles';
                        document.head.appendChild(style);
                    }

                    // Wstrzykiwanie modala
                    const modalHtml = doc.querySelector('.overlay');
                    if (modalHtml) {
                        modalHtml.id = 'tag-overlay';
                        document.body.appendChild(modalHtml);
                        overlay = modalHtml;

                        // Inicjalizacja eventów po wstawieniu HTML
                        this.initEvents(overlay);
                    }
                } catch (e) {
                    console.error(e);
                    return notify('Błąd interfejsu tagów', true);
                }
            }

            // 2. Reset i ładowanie danych
            const input = document.getElementById('new-tag-input');
            if (input) input.value = '';

            this.loadTagSuggestions();
            this.loadAlbumTags();

            // 3. Pokaż modal
            overlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
        },

        close() {
            const overlay = document.getElementById('tag-overlay');
            if (overlay) overlay.style.display = 'none';
            document.body.classList.remove('no-scroll');
            this.currentEntityId = null;
        },

        initEvents(overlay) {
            // Przycisk zamknięcia
            const cancelBtn = overlay.querySelector('.cancel-button');
            if (cancelBtn) cancelBtn.onclick = () => this.close();

            // Kliknięcie w tło zamyka modal
            overlay.onclick = (e) => {
                if (e.target === overlay) this.close();
            };

            // Przycisk dodawania
            const addBtn = overlay.querySelector('.add-tag-btn');
            if (addBtn) addBtn.onclick = () => this.addNewTag();

            // Obsługa Enter w polu tekstowym
            const input = document.getElementById('new-tag-input');
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.addNewTag();
                });
            }
        },

        async loadTagSuggestions() {
            const datalist = document.getElementById('user-tags-suggestions');
            if (!datalist) return;

            try {
                const token = getToken();
                const res = await fetch('/api/tags/my-unique-tags', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) return;

                const tags = await res.json();
                datalist.innerHTML = '';
                tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag;
                    datalist.appendChild(option);
                });
            } catch (e) {
                console.error('Sugestie tagów:', e);
            }
        },

        async loadAlbumTags() {
            const container = document.getElementById('current-tags-list');
            if (!container) return;

            container.innerHTML = '<span style="color: rgba(255,255,255,0.5);">Ładowanie...</span>';

            try {
                const token = getToken();
                if (!this.currentEntityId) return;

                const res = await fetch(`/api/tags/album/${this.currentEntityId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const tags = await res.json();
                this.renderTags(tags);
            } catch (e) {
                console.error(e);
                container.innerHTML = '<span style="color: #ff6b6b;">Błąd pobierania tagów.</span>';
            }
        },

        renderTags(tags) {
            const container = document.getElementById('current-tags-list');
            container.innerHTML = '';

            if (!tags || tags.length === 0) {
                container.innerHTML = '<span style="color: rgba(255,255,255,0.4); font-style: italic;">Brak tagów dla tego albumu.</span>';
                return;
            }

            tags.forEach(tag => {
                const div = document.createElement('div');
                div.className = 'tag-pill';

                // Nazwa tagu
                const spanName = document.createElement('span');
                spanName.textContent = `#${tag.tag_name}`;

                // Przycisk usuwania (X)
                const spanRemove = document.createElement('span');
                spanRemove.className = 'tag-remove';
                spanRemove.innerHTML = '&times;';
                spanRemove.onclick = () => this.removeTag(tag.id);

                div.appendChild(spanName);
                div.appendChild(spanRemove);
                container.appendChild(div);
            });
        },

        async addNewTag() {
            const input = document.getElementById('new-tag-input');
            const tagName = input.value.trim();
            if (!tagName) return;
            if (!this.currentEntityId) return;

            try {
                const token = getToken();
                const res = await fetch('/api/tags', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ albumId: this.currentEntityId, tagName })
                });

                if (res.ok) {
                    input.value = '';
                    this.loadAlbumTags();
                    this.loadTagSuggestions();
                    notify('Tag dodany');
                    // Odświeżenie widoku tagów w albumie w tle, jeśli istnieje funkcja
                    if(window.renderAlbumTagsTab) window.renderAlbumTagsTab(this.currentEntityId);
                } else {
                    const err = await res.json();
                    notify(err.error || 'Błąd dodawania tagu', true);
                }
            } catch (e) {
                notify('Błąd komunikacji z serwerem', true);
            }
        },

        async removeTag(tagId) {
            if (!confirm('Czy na pewno chcesz usunąć ten tag?')) return;

            try {
                const token = getToken();
                const res = await fetch(`/api/tags/${tagId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    this.loadAlbumTags();
                    if(window.renderAlbumTagsTab) window.renderAlbumTagsTab(this.currentEntityId);
                } else {
                    notify('Nie udało się usunąć tagu', true);
                }
            } catch (e) {
                console.error(e);
                notify('Błąd usuwania', true);
            }
        }
    };

    // Globalne przypisanie, aby HTML mógł wywołać funkcję
    window.openTagWindow = (id) => window.TagApp.modal.open(id);
    window.closeTagWindow = () => window.TagApp.modal.close();

})();