// frontend/js/lists.js

const ListApp = {
    state: {
        currentAlbumId: null,
        currentListSlug: null,
        currentUser: null,
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
            const data = await response.json();

            if (!response.ok) {
                // Если ошибка 401 - токен протух
                if (response.status === 401) localStorage.removeItem('token');
                throw new Error(data.error || data.message || `Ошибка ${response.status}`);
            }
            return data;
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
            console.log('Opening modal for album:', albumId);
            if (!ListApp.utils.getCurrentUser()) {
                return ListApp.utils.toast('Сначала войдите в аккаунт', 'error');
            }

            ListApp.state.currentAlbumId = albumId;
            let overlay = document.getElementById('list-overlay');

            // Загрузка HTML модалки если нет
            if (!overlay) {
                try {
                    const resp = await fetch('/list_window.html');
                    if (!resp.ok) throw new Error('Не удалось загрузить окно');
                    const html = await resp.text();

                    // Парсим и вставляем
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
        },

        initEvents(overlay) {
            // Кнопки закрытия
            overlay.querySelectorAll('.cancel-button').forEach(b => b.onclick = this.close);

            // Табы
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
            const newForm = document.getElementById('new-list-form');
            const existingTab = document.querySelector('[data-target="existing-lists"]');
            const newTab = document.querySelector('[data-target="new-list-form"]');

            container.innerHTML = 'Загрузка...';

            try {
                const lists = await ListApp.utils.fetchAPI('/api/user-lists/my-lists');
                container.innerHTML = '';

                if (lists.length === 0) {
                    // Переключаем на вкладку создания, если списков нет
                    if(newTab) newTab.click();
                    container.innerHTML = '<p>Нет списков.</p>';
                    return;
                }

                // Переключаем на существующие
                if(existingTab) existingTab.click();

                lists.forEach(list => {
                    const div = document.createElement('div');
                    div.className = 'list-item';
                    div.textContent = `${list.name} (${list.albums_count})`;
                    div.dataset.listId = list.id;
                    div.onclick = () => {
                        container.querySelectorAll('.list-item').forEach(el => el.classList.remove('selected'));
                        div.classList.add('selected');
                    };
                    container.appendChild(div);
                });
            } catch (e) {
                container.innerHTML = 'Ошибка загрузки';
            }
        },

        // Создать новый список
        async createNew() {
            const name = document.getElementById('list-name').value;
            const desc = document.getElementById('list-description').value;

            try {
                const res = await ListApp.utils.fetchAPI('/api/user-lists', {
                    method: 'POST',
                    body: JSON.stringify({ name, description: desc })
                });
                ListApp.utils.toast('Список создан');

                // Если открыто для добавления альбома - добавляем сразу
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

        // Добавить альбом в выбранный список
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
                const lists = isGlobal ? data.lists || data : data; // Обработка пагинации если есть

                container.innerHTML = '';
                if (!lists || lists.length === 0) {
                    container.innerHTML = '<p>Списков пока нет.</p>';
                    return;
                }

                lists.forEach(list => {
                    const card = document.createElement('a');
                    card.className = 'list-card';
                    card.href = `/list.html?slug=${list.slug}`;

                    card.innerHTML = `
                        <div class="list-content">
                            <h2 class="list-name">${list.name}</h2>
                            ${isGlobal ? `<p class="list-username">от ${list.username}</p>` : ''}
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

            // Загрузка
            await this.load(slug, sortSelect ? sortSelect.value : 'added_desc');

            if (sortSelect) {
                sortSelect.onchange = (e) => this.load(slug, e.target.value);
            }
        },

        async load(slug, sortBy) {
            try {
                const data = await ListApp.utils.fetchAPI(`/api/user-lists/${slug}?sortBy=${sortBy}`);
                const user = ListApp.utils.getCurrentUser();
                const isOwner = user && (user.id === data.user_id);

                this.renderHeader(data, isOwner);
                this.renderAlbums(data.albums, isOwner, sortBy, data.id);

            } catch (e) {
                document.querySelector('.album-list-container').innerHTML = `<p class="error">${e.message}</p>`;
            }
        },

        renderHeader(data, isOwner) {
            document.querySelector('.list-header h1').textContent = data.name;
            document.querySelector('.list-header p').innerHTML =
                `Автор: <a href="/profile.html?user=${data.creator}" class="author-link">${data.creator}</a> • ${new Date(data.created_at).toLocaleDateString()}`;

            const desc = document.querySelector('.list-description');
            if(desc) desc.textContent = data.description || '';

            // Управление сортировкой
            const sortSelect = document.getElementById('sort-by');
            const manualOpt = sortSelect.querySelector('option[value="sort_order_asc"]');

            if (!isOwner) {
                if(manualOpt) manualOpt.disabled = true;
                if(sortSelect.value === 'sort_order_asc') sortSelect.value = 'added_desc';
            } else {
                if(manualOpt) manualOpt.disabled = false;
            }
        },

        // РЕНДЕРИНГ АЛЬБОМОВ (СТАРЫЙ ДИЗАЙН)
        renderAlbums(albums, isOwner, currentSort, listId) {
            const container = document.querySelector('.album-list-container');

            // Если включена ручная сортировка И мы владелец -> добавляем класс sortable
            const isManual = isOwner && (currentSort === 'sort_order_asc');

            container.innerHTML = `<div class="album-list ${isManual ? 'sortable-list' : ''}"></div>`;
            const listDiv = container.querySelector('.album-list');

            if (!albums.length) {
                listDiv.innerHTML = '<p class="empty-msg">Список пуст.</p>';
                return;
            }

            albums.forEach((album, idx) => {
                const item = document.createElement('div');
                item.className = 'album-card'; // Используем CSS из старого файла
                item.dataset.albumId = album.id;

                const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : 'N/A';
                const rating = album.rating ? parseFloat(album.rating).toFixed(2) : "N/A";

                // === ВОССТАНОВЛЕННЫЙ СТАРЫЙ HTML ДИЗАЙН ===
                // Плюс добавлена ручка перетаскивания и кнопка удаления
                item.innerHTML = `
                    ${isManual ? '<div class="drag-handle" style="cursor:grab; font-size:1.5em; padding:10px; color:#555;">☰</div>' : ''}
                    
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

                // Обработчик удаления (чтобы не переходить по ссылке альбома)
                const delBtn = item.querySelector('.delete-btn');
                if(delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Не кликать на ссылку
                        e.preventDefault();
                    });
                }

                listDiv.appendChild(item);
            });

            // Запуск SortableJS
            if (isManual && window.Sortable) {
                new Sortable(listDiv, {
                    handle: '.drag-handle',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: () => this.saveOrder(listDiv, listId)
                });
            }
        },

        async remove(listId, albumId) {
            if(!confirm('Удалить из списка?')) return;
            try {
                await ListApp.utils.fetchAPI(`/api/user-lists/${listId}/items/${albumId}`, { method: 'DELETE' });
                ListApp.utils.toast('Удалено');
                this.init(); // Перезагрузка
            } catch (e) {
                ListApp.utils.toast(e.message, 'error');
            }
        },

        async saveOrder(container, listId) {
            const newOrder = Array.from(container.children).map((el, idx) => ({
                albumId: el.dataset.albumId,
                sortOrder: idx + 1
            }));

            try {
                await ListApp.utils.fetchAPI(`/api/user-lists/${listId}/reorder`, {
                    method: 'POST',
                    body: JSON.stringify({ newOrder })
                });
                // Тихое сохранение
            } catch (e) {
                ListApp.utils.toast('Ошибка сохранения порядка', 'error');
            }
        }
    }
};

// === ГЛОБАЛЬНЫЕ ПРИВЯЗКИ (Чтобы HTML onclick работал) ===
window.ListApp = ListApp;
window.openListWindow = (albumId) => ListApp.modal.open(albumId);
window.closeListWindow = () => ListApp.modal.close();
window.saveNewList = () => ListApp.modal.createNew();
window.addAlbumToList = (listId) => ListApp.modal.addAlbum(listId);

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // 1. Страница "Все списки"
    if (document.getElementById('globalListCardsContainer')) {
        ListApp.catalog.init('globalListCardsContainer', true);
    }
    // 2. Страница "Мои списки"
    if (document.getElementById('listCardsContainer')) {
        ListApp.catalog.init('listCardsContainer', false);
    }
    // 3. Страница деталей списка
    if (document.querySelector('.album-list-container')) {
        ListApp.details.init();
    }
});