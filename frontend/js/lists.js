// frontend/js/lists.js

const ListApp = {
    state: {
        currentAlbumId: null,
        currentListSlug: null,
        currentUser: null,
        listId: null, // ID списка
        isOwner: false, // Флаг владельца
        isOrderModified: false, // Флаг для ручной сортировки
        currentSortMethod: 'added_desc', // Текущий метод сортировки
    },

    // === УТИЛИТЫ ===
    utils: {
        getCurrentUser() {
            const token = localStorage.getItem('token');
            if (!token) return null;
            try {
                return JSON.parse(atob(token.split('.')[1]));
            } catch (e) {
                return null;
            }
        },

        async fetchAPI(url, options = {}) {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json', ...options.headers };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(url, { ...options, headers });

            // *** ИСПРАВЛЕНИЕ: Обработка HTML-ответа (не JSON) и 404/ошибок ***
            if (!response.ok) {
                const isJson = response.headers.get('content-type')?.includes('application/json');
                let data;

                try {
                    data = await (isJson ? response.json() : response.text());
                } catch(e) {
                    data = `Ошибка чтения ответа от сервера. Статус: ${response.status}`;
                }

                if (response.status === 401) localStorage.removeItem('token');

                const errorMessage = isJson ? (data.error || data.message || `Ошибка ${response.status}`) : `Ошибка API: ${response.status} ${response.statusText}`;

                throw new Error(errorMessage);
            }

            return response.json();
        },

        toast(msg, type = 'success') {
            const existing = document.querySelectorAll('.global-message');
            existing.forEach(el => el.remove());

            const div = document.createElement('div');
            div.textContent = msg;
            div.className = `global-message ${type === 'error' ? 'error' : 'success'}`;
            div.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                padding: 12px 24px; border-radius: 8px; color: ${type === 'error' ? '#ff4d4d' : '#2ecc71'};
                background: ${type === 'error' ? '#330000' : '#002200'};
                border: 1px solid currentColor; font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 9999;
            `;
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 4000);
        }
    },

    // === МОДАЛЬНОЕ ОКНО (Добавление в список) ===
    modal: {
        async open(albumId) {
            if (!ListApp.utils.getCurrentUser()) {
                return ListApp.utils.toast('Сначала войдите в аккаунт', 'error');
            }

            ListApp.state.currentAlbumId = albumId;
            let overlay = document.getElementById('list-overlay');

            if (!overlay) {
                try {
                    const resp = await fetch('/components/lists/list_window.html');
                    if (!resp.ok) throw new Error('Не удалось загрузить окно');
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
                    return ListApp.utils.toast('Ошибка интерфейса', 'error');
                }
            }

            this.loadUserLists();
            overlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
        },

        close() {
            const overlay = document.getElementById('list-overlay');
            if (overlay) overlay.style.display = 'none';
            document.body.classList.remove('no-scroll');
            ListApp.state.currentAlbumId = null;
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
                const lists = await ListApp.utils.fetchAPI('/api/user-lists/my-lists');
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
                const res = await ListApp.utils.fetchAPI('/api/user-lists', {
                    method: 'POST',
                    body: JSON.stringify({ name, description: desc })
                });
                ListApp.utils.toast('Список создан');

                if (ListApp.state.currentAlbumId) {
                    await this.addAlbum(res.listId);
                } else {
                    this.close();
                    if(document.getElementById('listCardsContainer')) ListApp.catalog.init('listCardsContainer', false);
                }
            } catch (e) {
                ListApp.utils.toast(e.message, 'error');
            }
        },

        async addAlbum(specificListId = null) {
            let listId = specificListId;
            if (!listId) {
                const selected = document.querySelector('.list-item.selected');
                if (!selected) return ListApp.utils.toast('Выберите список', 'error');
                listId = selected.dataset.listId;
            }

            if (!ListApp.state.currentAlbumId) return ListApp.utils.toast('Ошибка: нет ID альбома', 'error');

            try {
                await ListApp.utils.fetchAPI(`/api/user-lists/${listId}/add`, {
                    method: 'POST',
                    body: JSON.stringify({ albumId: ListApp.state.currentAlbumId })
                });
                ListApp.utils.toast('Альбом добавлен!');
                this.close();
            } catch (e) {
                ListApp.utils.toast(e.message, 'error');
            }
        }
    },

    // === КАТАЛОГИ (Все списки / Мои списки) ===
    catalog: {
        async init(containerId, isGlobal) {
            const container = document.getElementById(containerId);
            if (!container) return;

            try {
                const endpoint = isGlobal ? '/api/user-lists/global' : '/api/user-lists/my-lists';
                const data = await ListApp.utils.fetchAPI(endpoint);
                const lists = isGlobal ? data.lists || data : data;

                container.innerHTML = '';
                if (!lists || lists.length === 0) {
                    container.innerHTML = '<p class="empty-msg">Списков пока нет.</p>';
                    return;
                }

                lists.forEach(list => {
                    const card = document.createElement('a');
                    card.className = 'list-card';
                    card.href = `/list.html?slug=${list.slug}`;

                    const usernameHtml = isGlobal ? `<p class="list-username">от ${list.username}</p>` : '';

                    card.innerHTML = `
                        <div class="list-content">
                            <h2 class="list-name">${list.name}</h2>
                            ${usernameHtml}
                            <p class="list-meta">${list.albums_count} альбомов • ${new Date(list.created_at).toLocaleDateString()}</p>
                        </div>
                    `;

                    container.appendChild(card);
                });

            } catch (e) {
                container.innerHTML = `<p class="error">${e.message}</p>`;
            }
        }
    },

    // === СТРАНИЦА СПИСКА (list.html) ===
    details: {
        async init() {
            const container = document.querySelector('.album-list-container');
            if (!container) return;

            const params = new URLSearchParams(window.location.search);
            const slug = params.get('slug');

            if (!slug) {
                container.innerHTML = '<p class="error">Ошибка: Ссылка на список некорректна (нет slug).</p>';
                return;
            }

            ListApp.state.currentListSlug = slug;
            const sortSelect = document.getElementById('sort-by');
            const saveBtn = document.getElementById('save-sort-btn');

            // 1. Загружаем список, чтобы узнать сохраненную сортировку и установить состояние
            await this.load(slug, null, true);

            // 2. Устанавливаем обработчики событий
            if (sortSelect) {
                sortSelect.onchange = async (e) => {
                    ListApp.state.currentSortMethod = e.target.value;
                    await this.load(slug, e.target.value, false);
                    this.toggleSaveButton();
                };
            }

            if (saveBtn) {
                saveBtn.onclick = () => this.saveSortSettings();
            }
        },

        async load(slug, sortBy = null, shouldFetchSavedSort = true) {
            try {
                let effectiveSortBy;

                // 1. Получаем метаданные, чтобы узнать сохраненную сортировку и владельца.
                if (shouldFetchSavedSort) {
                    const listMetadata = await ListApp.utils.fetchAPI(`/api/user-lists/${slug}`);

                    if (listMetadata) {
                        ListApp.state.currentSortMethod = listMetadata.saved_sort_by || 'added_desc';
                        ListApp.state.listId = listMetadata.id;
                        ListApp.state.currentUser = ListApp.utils.getCurrentUser();
                        ListApp.state.isOwner = ListApp.state.currentUser && (ListApp.state.currentUser.id === listMetadata.user_id);
                    } else {
                        ListApp.state.currentSortMethod = 'added_desc';
                        ListApp.state.isOwner = false;
                    }
                }

                effectiveSortBy = sortBy || ListApp.state.currentSortMethod;

                // 3. Загружаем альбомы с нужной сортировкой
                const data = await ListApp.utils.fetchAPI(`/api/user-lists/${slug}?sortBy=${effectiveSortBy}`);

                // 4. Обновляем заголовок и опции сортировки
                this.renderHeader(data, ListApp.state.isOwner, effectiveSortBy);

                // 5. Рендерим альбомы
                this.renderAlbums(data.albums, ListApp.state.isOwner, effectiveSortBy, ListApp.state.listId);

                ListApp.state.isOrderModified = false;
                this.toggleSaveButton();


            } catch (e) {
                document.querySelector('.album-list-container').innerHTML = `<p class="error">${e.message}</p>`;
            }
        },

        toggleSaveButton() {
            const saveBtn = document.getElementById('save-sort-btn');
            if (!saveBtn) return;

            const isManualSort = ListApp.state.currentSortMethod === 'sort_order_asc';

            if (ListApp.state.isOwner) {
                saveBtn.style.display = 'inline-block';

                saveBtn.disabled = isManualSort ? !ListApp.state.isOrderModified : false;

                saveBtn.textContent = isManualSort ? 'Сохранить порядок' : 'Сохранить сортировку';

            } else {
                saveBtn.style.display = 'none';
            }
        },

        async saveSortSettings() {
            const sortMethod = ListApp.state.currentSortMethod;
            const listId = ListApp.state.listId;

            try {
                if (sortMethod === 'sort_order_asc' && ListApp.state.isOrderModified) {
                    // 1. Ручная сортировка: сохраняем порядок
                    const container = document.querySelector('.album-list');
                    await this.saveOrder(container, listId);

                    // 2. Сохраняем сам метод сортировки
                    await ListApp.utils.fetchAPI(`/api/user-lists/${listId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ saved_sort_by: sortMethod })
                    });

                    ListApp.utils.toast('Порядок списка сохранен!');
                } else {
                    // Стандартная сортировка: сохраняем выбранный метод
                    await ListApp.utils.fetchAPI(`/api/user-lists/${listId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ saved_sort_by: sortMethod })
                    });
                    ListApp.utils.toast(`Сортировка по "${sortMethod}" сохранена по умолчанию.`);
                }

                ListApp.state.isOrderModified = false;
                this.toggleSaveButton();

            } catch (e) {
                ListApp.utils.toast(e.message, 'error');
            }
        },

        renderHeader(data, isOwner, currentSortMethod) {
            document.querySelector('.list-header h1').textContent = data.name;
            document.querySelector('.list-header p').innerHTML =
                `Автор: <a href="/profile.html?user=${data.creator}" class="author-link">${data.creator}</a> • ${new Date(data.created_at).toLocaleDateString()}`;

            const desc = document.querySelector('.list-description');
            if(desc) desc.textContent = data.description || '';

            const sortSelect = document.getElementById('sort-by');

            sortSelect.innerHTML = `
                <option value="added_desc">Сначала новые</option>
                <option value="added_asc">Сначала старые</option>
                <option value="rating_desc">По рейтингу</option>
                <option value="title_asc">По алфавиту (А-Я)</option>
                <option value="sort_order_asc">Вручную (Drag & Drop)</option>
            `;

            let manualOpt = sortSelect.querySelector('option[value="sort_order_asc"]');

            if (!isOwner) {
                manualOpt.disabled = true;
            } else {
                manualOpt.disabled = false;
            }

            if (sortSelect) {
                sortSelect.value = currentSortMethod;
            }
        },

        renderAlbums(albums, isOwner, currentSort, listId) {
            const container = document.querySelector('.album-list-container');
            const isManual = isOwner && (currentSort === 'sort_order_asc');

            const existingList = container.querySelector('.album-list');
            if (existingList && existingList.sortable) {
                existingList.sortable.destroy();
            }


            container.innerHTML = `<div class="album-list ${isManual ? 'sortable-list' : ''}"></div>`;
            const listDiv = container.querySelector('.album-list');

            if (!albums.length) {
                listDiv.innerHTML = '<p class="empty-msg">Список пуст.</p>';
                return;
            }

            albums.forEach((album, idx) => {
                const item = document.createElement('div');
                item.className = 'album-card';
                item.dataset.albumId = album.id;

                const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : 'N/A';
                const rating = album.rating ? parseFloat(album.rating).toFixed(2) : "N/A";

                item.innerHTML = `
                    ${isManual ? '<div class="drag-handle" style="cursor:grab; font-size:1.5em; padding:0 15px; color:#555;">☰</div>' : ''}
                    
                    <a href="/release/album/${album.slug}" style="display:flex; flex-grow:1; text-decoration:none; color:inherit;">
                        <img src="${album.cover_url || '/img/no_cover.jpg'}" alt="${album.title}" style="width:100px; height:100px; object-fit:cover; border-radius:4px;">
                        
                        <div class="album-details" style="margin-left:15px; width:100%;">
                            <h2 style="margin:0; font-size:1.2em; color:#fff;">${album.title}</h2>
                            <p style="margin:2px 0; color:#ccc;"><strong>Artist:</strong> ${album.artist_name || 'Unknown'}</p>
                            <p style="margin:2px 0; color:#777;"><strong>Year:</strong> ${releaseYear}</p>
                            
                            <div class="rating-info" style="margin-top:5px; font-size:0.9em; display:flex; gap:10px;">
                                <span class="score" style="color:#f1c40f; font-weight:bold;">★ ${rating}</span>
                                <span>❤️ ${album.likes || 0}</span>
                            </div>

                            <div class="album-actions" style="margin-top:10px;">
                                <button class="action-button" style="background:#333; border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:0.8em;">🎧 Listen</button>
                                <button class="action-button" style="background:#333; border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:0.8em;">❤️ Like</button>
                            </div>
                        </div>
                    </a>

                    ${isOwner ? `<button class="delete-btn" onclick="ListApp.details.remove(${listId}, ${album.id})" style="background:none; border:none; color:#777; font-size:1.5em; cursor:pointer; padding:0 15px;">✕</button>` : ''}
                `;

                const delBtn = item.querySelector('.delete-btn');
                if(delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    });
                }

                listDiv.appendChild(item);
            });

            if (isManual && window.Sortable) {
                const sortableInstance = new Sortable(listDiv, {
                    handle: '.drag-handle',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: () => {
                        ListApp.state.isOrderModified = true;
                        this.toggleSaveButton();
                    }
                });
                listDiv.sortable = sortableInstance;
            }
        },

        async saveOrder(container, listId) {
            const newOrder = Array.from(container.children).map((el, idx) => ({
                albumId: el.dataset.albumId,
                sortOrder: idx + 1
            }));

            await ListApp.utils.fetchAPI(`/api/user-lists/${listId}/reorder`, {
                method: 'POST',
                body: JSON.stringify({ newOrder })
            });
        },

        async remove(listId, albumId) {
            if(!confirm('Удалить из списка?')) return;
            try {
                await ListApp.utils.fetchAPI(`/api/user-lists/${listId}/items/${albumId}`, { method: 'DELETE' });
                ListApp.utils.toast('Удалено');
                this.load(ListApp.state.currentListSlug, ListApp.state.currentSortMethod, false);
            } catch (e) {
                ListApp.utils.toast(e.message, 'error');
            }
        }
    }
};

// === ГЛОБАЛЬНЫЕ ПРИВЯЗКИ ===
window.ListApp = ListApp;
window.openListWindow = (albumId) => ListApp.modal.open(albumId);
window.closeListWindow = () => ListApp.modal.close();
window.saveNewList = () => ListApp.modal.createNew();

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('globalListCardsContainer')) {
        ListApp.catalog.init('globalListCardsContainer', true);
    }
    if (document.getElementById('listCardsContainer')) {
        ListApp.catalog.init('listCardsContainer', false);
    }
    if (document.querySelector('.album-list-container')) {
        ListApp.details.init();
    }
});