// frontend/js/list-app-modal.js

(function(App) {

    // === MODUŁ DODAWANIA ===
    App.modal = {
        async open(entityId, entityType = 'album') {
            if (!App.utils.getCurrentUser()) {
                return App.utils.toast('Zaloguj się najpierw', 'error');
            }

            App.state.currentEntityId = entityId;
            App.state.currentEntityType = entityType;

            let overlay = document.getElementById('list-overlay');

            if (!overlay) {
                try {
                    const resp = await fetch('/components/lists/list_window.html');
                    if (!resp.ok) throw new Error('Nie udało się załadować okna');
                    const html = await resp.text();

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const style = doc.querySelector('style');
                    const modalHtml = doc.querySelector('.overlay');

                    if (style && !document.getElementById('list-window-styles')) {
                        style.id = 'list-window-styles';
                        document.head.appendChild(style);
                    }
                    if (modalHtml) {
                        modalHtml.id = 'list-overlay';
                        document.body.appendChild(modalHtml);
                        overlay = modalHtml;
                        this.initEvents(overlay);
                    }
                } catch (e) {
                    console.error(e);
                    return App.utils.toast('Błąd interfejsu', 'error');
                }
            }

            // Konfiguracja interfejsu tworzenia nowej listy
            const typeSelect = document.getElementById('new-list-type');
            if (!typeSelect) {
                const form = document.querySelector('#new-list-form');
                if(form) {
                    const select = document.createElement('select');
                    select.id = 'new-list-type';
                    select.className = 'form-input';
                    select.innerHTML = `
                        <option value="album">Lista albumów</option>
                        <option value="track">Lista utworów</option>
                        <option value="artist">Lista artystów</option>
                        <option value="user">Lista użytkowników</option>
                     `;
                    const btn = form.querySelector('.create-button');
                    if(btn) form.insertBefore(select, btn);
                }
            }

            if (document.getElementById('new-list-type')) {
                document.getElementById('new-list-type').value = App.state.currentEntityType;
                document.getElementById('new-list-type').disabled = true;
            }

            this.loadUserLists();
            overlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
        },

        close() {
            const overlay = document.getElementById('list-overlay');
            if (overlay) overlay.style.display = 'none';
            document.body.classList.remove('no-scroll');
            App.state.currentEntityId = null;
            const addButton = document.querySelector('#existing-lists .add-button');
            if (addButton) addButton.setAttribute('disabled', 'disabled');
        },

        initEvents(overlay) {
            overlay.querySelectorAll('.cancel-button').forEach(b => b.onclick = () => this.close());

            const tabs = overlay.querySelectorAll('.list-tab-button');
            tabs.forEach(tab => {
                tab.onclick = () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    overlay.querySelectorAll('.list-tab-content').forEach(c => c.style.display = 'none');
                    tab.classList.add('active');
                    const target = overlay.querySelector(`#${tab.dataset.target}`);
                    if(target) target.style.display = 'block';
                };
            });

            const createBtn = overlay.querySelector('.create-button');
            if(createBtn) createBtn.onclick = () => this.createNew();

            const addBtn = overlay.querySelector('#existing-lists .add-button');
            if(addBtn) addBtn.onclick = () => this.addItem();
        },

        async loadUserLists() {
            const container = document.getElementById('lists-container');
            const addButton = document.querySelector('#existing-lists .add-button');
            const existingTab = document.querySelector('[data-target="existing-lists"]');
            const newTab = document.querySelector('[data-target="new-list-form"]');

            container.innerHTML = 'Ładowanie...';
            if (addButton) addButton.setAttribute('disabled', 'disabled');

            try {
                const lists = await App.utils.fetchAPI('/api/user-lists/my-lists');
                container.innerHTML = '';

                const compatibleLists = lists.filter(l => l.type === App.state.currentEntityType);

                if (compatibleLists.length === 0) {
                    if(newTab) newTab.click();
                    const translatedType = App.catalog.translateType(App.state.currentEntityType).toLowerCase();
                    container.innerHTML = `<p>Nie znaleziono list typu "${translatedType}". Stwórz nową!</p>`;
                    return;
                }

                if(existingTab) existingTab.click();

                compatibleLists.forEach(list => {
                    const div = document.createElement('div');
                    div.className = 'list-item';
                    div.textContent = `${list.name} (${list.items_count || 0})`;
                    div.dataset.listId = list.id;

                    div.onclick = () => {
                        container.querySelectorAll('.list-item').forEach(el => el.classList.remove('selected'));
                        div.classList.add('selected');

                        if (addButton) {
                            addButton.removeAttribute('disabled');
                        }
                    };
                    container.appendChild(div);
                });
            } catch (e) {
                console.error(e);
                container.innerHTML = 'Błąd ładowania';
            }
        },

        async createNew() {
            const name = document.getElementById('list-name').value;
            const desc = document.getElementById('list-description').value;
            let type = App.state.currentEntityType || 'album';
            const typeSelect = document.getElementById('new-list-type');
            if(typeSelect) type = typeSelect.value;

            try {
                const res = await App.utils.fetchAPI('/api/user-lists', {
                    method: 'POST',
                    body: JSON.stringify({ name, description: desc, type })
                });
                App.utils.toast('Lista utworzona');

                if (App.state.currentEntityId) {
                    await this.addItem(res.listId);
                } else {
                    this.close();
                    if(document.getElementById('listCardsContainer') && App.catalog) App.catalog.init('listCardsContainer', false);
                }
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        },

        async addItem(specificListId = null) {
            let listId = specificListId;
            if (!listId) {
                const selected = document.querySelector('.list-item.selected');
                if (!selected) return App.utils.toast('Wybierz listę', 'error');
                listId = selected.dataset.listId;
            }

            if (!App.state.currentEntityId) return App.utils.toast('Błąd: brak ID encji', 'error');

            try {
                await App.utils.fetchAPI(`/api/user-lists/${listId}/add`, {
                    method: 'POST',
                    body: JSON.stringify({ entityId: App.state.currentEntityId })
                });
                App.utils.toast('Dodano!');
                this.close();
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        }
    };

    // === MODAL EDYCJI ===
    App.editModal = {
        currentListId: null,
        async open(listData) {
            this.currentListId = listData.id;
            let overlay = document.getElementById('list-edit-overlay');
            if (!overlay) {
                try {
                    const resp = await fetch('/components/lists/edit_list_window.html');
                    if (!resp.ok) throw new Error('Nie udało się załadować okna edycji');
                    const html = await resp.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const style = doc.querySelector('style');
                    const modalHtml = doc.querySelector('.overlay');
                    if (style && !document.getElementById('list-edit-styles')) {
                        style.id = 'list-edit-styles';
                        document.head.appendChild(style);
                    }
                    if (modalHtml) {
                        modalHtml.id = 'list-edit-overlay';
                        document.body.appendChild(modalHtml);
                        overlay = modalHtml;
                    }
                } catch (e) {
                    return App.utils.toast('Błąd interfejsu edycji', 'error');
                }
            }

            document.getElementById('edit-list-name').value = listData.name || '';
            document.getElementById('edit-list-description').value = listData.description || '';
            document.getElementById('edit-list-cover-url').value = listData.cover_url || '';

            const deleteBtn = document.getElementById('delete-list-btn');
            if (deleteBtn) {
                App.state.listId = this.currentListId;
                deleteBtn.onclick = () => App.details.deleteList();
            }

            const saveBtn = overlay.querySelector('.save-button');
            if(saveBtn) saveBtn.onclick = () => this.saveChanges();

            overlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
        },
        close() {
            const overlay = document.getElementById('list-edit-overlay');
            if (overlay) overlay.style.display = 'none';
            document.body.classList.remove('no-scroll');
            this.currentListId = null;
        },
        async saveChanges() {
            const name = document.getElementById('edit-list-name').value;
            const description = document.getElementById('edit-list-description').value;
            let cover_url = document.getElementById('edit-list-cover-url').value;

            if (!name) return App.utils.toast('Tytuł nie może być pusty', 'error');

            if (!cover_url || cover_url.trim() === '') {
                cover_url = null;
            }

            const updateData = { name, description, cover_url };
            try {
                await App.details.updateList(this.currentListId, updateData);
                this.close();
            } catch (e) {
                // Błąd jest obsługiwany wewnątrz App.details.updateList
            }
        }
    };

    // === GLOBALNE POWIĄZANIA ===
    window.openListWindow = (entityId, type = 'album') => App.modal.open(entityId, type);
    window.closeListWindow = () => App.modal.close();
    window.saveNewList = () => App.modal.createNew();
    window.showListEditModal = (listData) => App.editModal.open(listData);
})(window.ListApp);