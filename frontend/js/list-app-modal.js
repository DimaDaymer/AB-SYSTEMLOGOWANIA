// frontend/js/list-app-modal.js

// Assuming list-app-core.js is already loaded and ListApp exists
(function(App) {

    // === ADDITION MODULE (Existing) ===
    App.modal = {
        async open(albumId) {
            if (!App.utils.getCurrentUser()) {
                return App.utils.toast('Please log in first', 'error');
            }

            App.state.currentAlbumId = albumId;
            let overlay = document.getElementById('list-overlay');

            // Loading the modal window HTML if it's not already there
            if (!overlay) {
                try {
                    const resp = await fetch('/components/lists/list_window.html');
                    if (!resp.ok) throw new Error('Failed to load window');
                    const html = await resp.text();

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const style = doc.querySelector('style');
                    const modalHtml = doc.querySelector('.overlay');

                    // Adding styles and the HTML itself to the DOM
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
                    return App.utils.toast('Interface error', 'error');
                }
            }

            // Loading user lists and showing the window
            this.loadUserLists();
            overlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
        },

        close() {
            const overlay = document.getElementById('list-overlay');
            if (overlay) overlay.style.display = 'none';
            document.body.classList.remove('no-scroll');
            App.state.currentAlbumId = null;
            const addButton = document.querySelector('#existing-lists .add-button');
            if (addButton) addButton.setAttribute('disabled', 'disabled');
        },

        initEvents(overlay) {
            overlay.querySelectorAll('.cancel-button').forEach(b => b.onclick = this.close);

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
        },

        async loadUserLists() {
            const container = document.getElementById('lists-container');
            const addButton = document.querySelector('#existing-lists .add-button');
            const existingTab = document.querySelector('[data-target="existing-lists"]');
            const newTab = document.querySelector('[data-target="new-list-form"]');

            container.innerHTML = 'Loading...';
            if (addButton) addButton.setAttribute('disabled', 'disabled');

            try {
                const lists = await App.utils.fetchAPI('/api/user-lists/my-lists');
                container.innerHTML = '';

                if (lists.length === 0) {
                    if(newTab) newTab.click();
                    container.innerHTML = '<p>No lists. Create the first one!</p>';
                    return;
                }

                if(existingTab) existingTab.click();

                lists.forEach(list => {
                    const div = document.createElement('div');
                    div.className = 'list-item';
                    div.textContent = `${list.name} (${list.albums_count})`;
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
                container.innerHTML = 'Loading error';
            }
        },

        async createNew() {
            const name = document.getElementById('list-name').value;
            const desc = document.getElementById('list-description').value;

            try {
                const res = await App.utils.fetchAPI('/api/user-lists', {
                    method: 'POST',
                    body: JSON.stringify({ name, description: desc })
                });
                App.utils.toast('List created');

                if (App.state.currentAlbumId) {
                    await this.addAlbum(res.listId);
                } else {
                    this.close();
                    // Перезагружаем каталог "Мои списки", если он отображен
                    if(document.getElementById('listCardsContainer') && App.catalog) App.catalog.init('listCardsContainer', false);
                }
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        },

        async addAlbum(specificListId = null) {
            let listId = specificListId;
            if (!listId) {
                const selected = document.querySelector('.list-item.selected');
                if (!selected) return App.utils.toast('Select a list', 'error');
                listId = selected.dataset.listId;
            }

            if (!App.state.currentAlbumId) return App.utils.toast('Error: no album ID', 'error');

            try {
                await App.utils.fetchAPI(`/api/user-lists/${listId}/add`, {
                    method: 'POST',
                    body: JSON.stringify({ albumId: App.state.currentAlbumId })
                });
                App.utils.toast('Album added!');
                this.close();
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        }
    };

    // === NEW EDITING MODULE ===
    App.editModal = {
        currentListId: null,

        async open(listData) {
            this.currentListId = listData.id;
            let overlay = document.getElementById('list-edit-overlay');

            // Loading the edit modal window HTML if it's not already there
            if (!overlay) {
                try {
                    const resp = await fetch('/components/lists/edit_list_window.html');
                    if (!resp.ok) throw new Error('Failed to load edit window');
                    const html = await resp.text();

                    // Поскольку HTML содержит стили, используем DOMParser
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const style = doc.querySelector('style');
                    const modalHtml = doc.querySelector('.overlay');

                    // Добавление стилей и самого HTML в DOM
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
                    console.error(e);
                    return App.utils.toast('Editing interface error', 'error');
                }
            }

            // Filling fields with data
            document.getElementById('edit-list-name').value = listData.name || '';
            document.getElementById('edit-list-description').value = listData.description || '';
            document.getElementById('edit-list-cover-url').value = listData.cover_url || '';

            // Binding the delete function to the button (since it's in the modal HTML)
            const deleteBtn = document.getElementById('delete-list-btn');
            if (deleteBtn) {
                // Убедимся, что ID списка установлен в App.state
                App.state.listId = this.currentListId;
                deleteBtn.onclick = () => App.details.deleteList();
            }


            // Showing the window
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

            if (!name) {
                return App.utils.toast('Title cannot be empty', 'error');
            }

            // If the cover field is cleared, send null to reset it in the database, allowing the first album logic to work
            if (cover_url.trim() === '') {
                cover_url = null;
            }


            const updateData = {
                name: name,
                description: description,
                cover_url: cover_url
            };

            try {
                // Using the update function from the list details module
                await App.details.updateList(this.currentListId, updateData);
                this.close();

            } catch (e) {
                // Error is already handled in App.details.updateList
            }
        }
    };


    // === GLOBAL BINDINGS ===
    window.openListWindow = (albumId) => App.modal.open(albumId);
    window.closeListWindow = () => App.modal.close();
    window.saveNewList = () => App.modal.createNew();
    window.showListEditModal = (listData) => App.editModal.open(listData);

})(window.ListApp);