// frontend/js/list-app-modal.js

// Предполагаем, что list-app-core.js уже загружен и ListApp существует
(function(App) {

    // === МОДУЛЬ ДОБАВЛЕНИЯ (Существующий) ===
    App.modal = {
        async open(albumId) {
            if (!App.utils.getCurrentUser()) {
                return App.utils.toast('Сначала войдите в аккаунт', 'error');
            }

            App.state.currentAlbumId = albumId;
            let overlay = document.getElementById('list-overlay');

            // Загрузка HTML модального окна, если его еще нет
            if (!overlay) {
                try {
                    const resp = await fetch('/components/lists/list_window.html');
                    if (!resp.ok) throw new Error('Не удалось загрузить окно');
                    const html = await resp.text();

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const style = doc.querySelector('style');
                    const modalHtml = doc.querySelector('.overlay');

                    // Добавление стилей и самого HTML в DOM
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
                    return App.utils.toast('Ошибка интерфейса', 'error');
                }
            }

            // Загрузка списков пользователя и показ окна
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

            container.innerHTML = 'Загрузка...';
            if (addButton) addButton.setAttribute('disabled', 'disabled');

            try {
                const lists = await App.utils.fetchAPI('/api/user-lists/my-lists');
                container.innerHTML = '';

                if (lists.length === 0) {
                    if(newTab) newTab.click();
                    container.innerHTML = '<p>Нет списков. Создайте первый!</p>';
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
                container.innerHTML = 'Ошибка загрузки';
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
                App.utils.toast('Список создан');

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
                if (!selected) return App.utils.toast('Выберите список', 'error');
                listId = selected.dataset.listId;
            }

            if (!App.state.currentAlbumId) return App.utils.toast('Ошибка: нет ID альбома', 'error');

            try {
                await App.utils.fetchAPI(`/api/user-lists/${listId}/add`, {
                    method: 'POST',
                    body: JSON.stringify({ albumId: App.state.currentAlbumId })
                });
                App.utils.toast('Альбом добавлен!');
                this.close();
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        }
    };

    // === НОВЫЙ МОДУЛЬ ДЛЯ РЕДАКТИРОВАНИЯ ===
    App.editModal = {
        currentListId: null,

        async open(listData) {
            this.currentListId = listData.id;
            let overlay = document.getElementById('list-edit-overlay');

            // Загрузка HTML модального окна редактирования, если его еще нет
            if (!overlay) {
                try {
                    const resp = await fetch('/components/lists/edit_list_window.html');
                    if (!resp.ok) throw new Error('Не удалось загрузить окно редактирования');
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
                    return App.utils.toast('Ошибка интерфейса редактирования', 'error');
                }
            }

            // Заполнение полей данными
            document.getElementById('edit-list-name').value = listData.name || '';
            document.getElementById('edit-list-description').value = listData.description || '';
            document.getElementById('edit-list-cover-url').value = listData.cover_url || '';

            // Привязываем функцию удаления к кнопке (так как она в HTML модалки)
            const deleteBtn = document.getElementById('delete-list-btn');
            if (deleteBtn) {
                // Убедимся, что ID списка установлен в App.state
                App.state.listId = this.currentListId;
                deleteBtn.onclick = () => App.details.deleteList();
            }


            // Показ окна
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
                return App.utils.toast('Название не может быть пустым', 'error');
            }

            // Если поле обложки очищено, отправляем null для обнуления в базе, чтобы сработала логика первого альбома
            if (cover_url.trim() === '') {
                cover_url = null;
            }


            const updateData = {
                name: name,
                description: description,
                cover_url: cover_url
            };

            try {
                // Используем функцию обновления из модуля деталей списка
                await App.details.updateList(this.currentListId, updateData);
                this.close();

            } catch (e) {
                // Ошибка уже обработана в App.details.updateList
            }
        }
    };


    // === ГЛОБАЛЬНЫЕ ПРИВЯЗКИ ===
    window.openListWindow = (albumId) => App.modal.open(albumId);
    window.closeListWindow = () => App.modal.close();
    window.saveNewList = () => App.modal.createNew();
    /** НОВАЯ ГЛОБАЛЬНАЯ ФУНКЦИЯ ДЛЯ РЕДАКТИРОВАНИЯ */
    window.showListEditModal = (listData) => App.editModal.open(listData);

})(window.ListApp);