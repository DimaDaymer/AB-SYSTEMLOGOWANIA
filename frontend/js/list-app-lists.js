// frontend/js/list-app-lists.js

// Предполагаем, что list-app-core.js уже загружен и ListApp существует
(function(App) {

    // === КАТАЛОГИ (Все списки / Мои списки) ===
    App.catalog = {
        async init(containerId, isGlobal) {
            const container = document.getElementById(containerId);
            if (!container) return;

            try {
                const endpoint = isGlobal ? '/api/user-lists/global' : '/api/user-lists/my-lists';
                const data = await App.utils.fetchAPI(endpoint);
                // API для global может возвращать { lists: [...] }
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

                    // --- ЛОГИКА ОТОБРАЖЕНИЯ ОБЛОЖКИ ---
                    // Используем URL обложки из базы (который уже может быть обложкой первого альбома)
                    const coverUrl = list.cover_url || '/img/no_cover.jpg';
                    const coverHtml = `<div class="list-cover-placeholder"><img src="${coverUrl}" alt="${list.name} Cover"></div>`;
                    // ------------------------------------

                    card.innerHTML = `
                        ${coverHtml}
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
    };

    // frontend/js/list-app-lists.js (Часть App.details)

// ... (код App.catalog без изменений) ...

    // === СТРАНИЦА СПИСКА (list.html) ===
    App.details = {
        async init() {
            const container = document.querySelector('.album-list-container');
            if (!container) return;

            const params = new URLSearchParams(window.location.search);
            const slug = params.get('slug');

            if (!slug) {
                container.innerHTML = '<p class="error">Ошибка: Ссылка на список некорректна (нет slug).</p>';
                return;
            }

            App.state.currentListSlug = slug;
            const sortSelect = document.getElementById('sort-by');
            const saveBtn = document.getElementById('save-sort-btn');
            const editBtn = document.getElementById('edit-list-btn');

            // 1. Загружаем список. Не передаем sortBy, чтобы сервер использовал дефолтный или сохраненный.
            await this.load(slug);

            // 2. Устанавливаем обработчики событий
            if (sortSelect) {
                sortSelect.onchange = async (e) => {
                    // При явном выборе пользователем передаем параметр
                    App.state.currentSortMethod = e.target.value;
                    await this.load(slug, e.target.value);
                    this.toggleSaveButton();
                };
            }

            if (saveBtn) {
                saveBtn.onclick = () => this.saveSortSettings();
            }

            if (editBtn) {
                editBtn.onclick = () => this.openEditModal(slug);
            }
        },

        // Оптимизированная функция load
        async load(slug, sortBy = null) {
            try {
                // Строим URL. Если sortBy null, сервер сам решит, как сортировать (по saved_sort_by)
                let url = `/api/user-lists/${slug}`;
                if (sortBy) {
                    url += `?sortBy=${sortBy}`;
                }

                // ЕДИНСТВЕННЫЙ ЗАПРОС
                const data = await App.utils.fetchAPI(url);

                // Устанавливаем стейт на основе ответа сервера
                App.state.listId = data.id;
                App.state.currentUser = App.utils.getCurrentUser();

                // Проверяем владельца
                App.state.isOwner = App.state.currentUser && (App.state.currentUser.id === data.user_id);

                // Узнаем, какая сортировка применилась (сервер должен вернуть applied_sort_by или saved_sort_by)
                App.state.currentSortMethod = sortBy || data.applied_sort_by || data.saved_sort_by;

                // Рендерим заголовок и альбомы
                this.renderHeader(data, App.state.isOwner, App.state.currentSortMethod);

                // Кнопка редактирования
                const editBtn = document.getElementById('edit-list-btn');
                if (editBtn) {
                    editBtn.style.display = App.state.isOwner ? 'inline-block' : 'none';
                }

                this.renderAlbums(data.albums, App.state.isOwner, App.state.currentSortMethod, data.id);

                App.state.isOrderModified = false;
                this.toggleSaveButton();

            } catch (e) {
                console.error(e);
                // Если 404, пишем понятное сообщение
                const msg = e.message.includes('404') ? 'Список не найден или был удален.' : e.message;
                document.querySelector('.album-list-container').innerHTML = `<p class="error">${msg}</p>`;
                document.querySelector('.list-header h1').textContent = 'Ошибка';
            }
        },

// ... (остальные функции renderHeader, renderAlbums, toggleSaveButton и т.д. остаются без изменений)        },

        toggleSaveButton() {
            const saveBtn = document.getElementById('save-sort-btn');
            if (!saveBtn) return;

            const isManualSort = App.state.currentSortMethod === 'sort_order_asc';

            if (App.state.isOwner) {
                saveBtn.style.display = 'inline-block';

                saveBtn.disabled = isManualSort ? !App.state.isOrderModified : false;

                saveBtn.textContent = isManualSort ? 'Сохранить порядок' : 'Сохранить сортировку';

            } else {
                saveBtn.style.display = 'none';
            }
        },

        async saveSortSettings() {
            const sortMethod = App.state.currentSortMethod;
            const listId = App.state.listId;

            try {
                // Если ручная сортировка и порядок изменен, сначала сохраняем порядок
                if (sortMethod === 'sort_order_asc' && App.state.isOrderModified) {
                    const container = document.querySelector('.album-list');
                    await this.saveOrder(container, listId);
                }

                // Сохраняем сам метод сортировки
                await App.utils.fetchAPI(`/api/user-lists/${listId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ saved_sort_by: sortMethod })
                });

                App.utils.toast('Настройки сортировки сохранены!');


                App.state.isOrderModified = false;
                this.toggleSaveButton();

            } catch (e) {
                App.utils.toast(e.message, 'error');
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

            // Уничтожаем предыдущий Sortable, чтобы избежать дублирования
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

            albums.forEach((album) => {
                const item = document.createElement('div');
                item.className = 'album-card';
                item.dataset.albumId = album.id;

                const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : 'N/A';
                const rating = album.avg_rating ? parseFloat(album.avg_rating).toFixed(2) : "N/A";

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
                        App.state.isOrderModified = true;
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

            await App.utils.fetchAPI(`/api/user-lists/${listId}/reorder`, {
                method: 'POST',
                body: JSON.stringify({ newOrder })
            });
        },

        async remove(listId, albumId) {
            if(!confirm('Удалить из списка?')) return;
            try {
                await App.utils.fetchAPI(`/api/user-lists/${listId}/items/${albumId}`, { method: 'DELETE' });
                App.utils.toast('Удалено');
                // Перезагружаем список
                this.load(App.state.currentListSlug, App.state.currentSortMethod, false);
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        },

        /** НОВАЯ ФУНКЦИЯ: ОТКРЫТИЕ МОДАЛЬНОГО ОКНА РЕДАКТИРОВАНИЯ */
        async openEditModal(slug) {
            if (!App.state.isOwner) return App.utils.toast('Нет прав для редактирования', 'error');

            // Получаем полные данные списка
            const listData = await App.utils.fetchAPI(`/api/user-lists/${slug}`);

            if (window.showListEditModal) {
                window.showListEditModal(listData);
            } else {
                App.utils.toast('Ошибка: Не загружен модуль редактирования. Убедитесь, что list-app-modal.js обновлен', 'error');
            }
        },

        /** НОВАЯ ФУНКЦИЯ: ОБНОВЛЕНИЕ СПИСКА (вызывается из модального окна) */
        async updateList(listId, data) {
            try {
                // Обновляем список через PUT API
                await App.utils.fetchAPI(`/api/user-lists/${listId}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                App.utils.toast('Список обновлен!');
                // Перезагрузка страницы, чтобы увидеть изменения
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } catch (e) {
                App.utils.toast(e.message, 'error');
                throw e;
            }
        },

        /** НОВАЯ ФУНКЦИЯ: УДАЛЕНИЕ СПИСКА */
        async deleteList() {
            if (!App.state.isOwner || !App.state.listId) return;

            if (!confirm(`Вы уверены, что хотите удалить список "${document.querySelector('.list-header h1').textContent}"? Это действие необратимо.`)) {
                return;
            }

            try {
                await App.utils.fetchAPI(`/api/user-lists/${App.state.listId}`, { method: 'DELETE' });
                App.utils.toast('Список успешно удален. Перенаправление...');

                // Перенаправление на страницу "Мои Списки"
                setTimeout(() => {
                    window.location.href = '/lists_page.html';
                }, 1000);

            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        }
    };

    // Инициализация при загрузке страницы
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('globalListCardsContainer')) {
            App.catalog.init('globalListCardsContainer', true);
        }
        if (document.getElementById('listCardsContainer')) {
            App.catalog.init('listCardsContainer', false);
        }
        if (document.querySelector('.album-list-container')) {
            App.details.init();
        }
    });

})(window.ListApp);