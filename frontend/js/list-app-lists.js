// frontend/js/list-app-lists.js

import { renderPagination, initPaginationControls, getLimit, getCurrentPage } from './pagination.js';
// Importujemy funkcje renderujące
import { renderAlbums } from './charts/renderAlbums.js';
import { renderTracks } from './charts/renderTracks.js';
import { renderArtists } from './charts/renderArtists.js';

const App = window.ListApp;

App.catalog = {
    async init(containerId, isGlobal) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (isGlobal) {
            const typeFilter = document.getElementById('listTypeFilter');
            const sortFilter = document.getElementById('listSortOrder');

            // Słuchacze dla filtrów
            [typeFilter, sortFilter].forEach(el => {
                if (el) el.addEventListener('change', () => this.load(containerId, isGlobal, 1));
            });
        }

        initPaginationControls('itemsPerPage', (newPage) => this.load(containerId, isGlobal, newPage));
        await this.load(containerId, isGlobal, 1);
    },

    async load(containerId, isGlobal, page = 1) {
        const container = document.getElementById(containerId);
        const limit = getLimit();

        const type = document.getElementById('listTypeFilter')?.value || 'all';
        const sort = document.getElementById('listSortOrder')?.value || 'created_at_desc';

        try {
            const endpoint = isGlobal ? '/api/user-lists/global' : '/api/user-lists/my-lists';
            let url = `${endpoint}?page=${page}&limit=${limit}`;

            if (isGlobal) {
                url += `&type=${type}&sortBy=${sort}`;
            }

            const data = await App.utils.fetchAPI(url);
            const lists = isGlobal ? data.lists : data;
            const meta = isGlobal ? data.meta : null;

            container.innerHTML = '';
            if (!lists || lists.length === 0) {
                container.innerHTML = '<p class="empty-msg">Nie znaleziono żadnych list.</p>';
                if (isGlobal) {
                    const footer = document.getElementById('pagination-footer');
                    if(footer) footer.innerHTML = '';
                }
                return;
            }

            lists.forEach(list => {
                const card = document.createElement('a');
                card.className = 'list-card';
                card.href = `/list.html?slug=${list.slug}`;
                const usernameHtml = isGlobal ? `<p class="list-username">autor: ${list.username}</p>` : '';

                const coverHtml = list.cover_url
                    ? `<div class="list-cover-placeholder"><img src="${list.cover_url}" alt="Okładka ${list.name}"></div>`
                    : '';

                const typeBadge = `<span class="list-type-badge">${this.translateType(list.type)}</span>`;

                const itemsText = `${list.items_count || 0} elementów`;
                const reviewsText = isGlobal ? ` • ${list.reviews_count || 0} recenzji` : '';
                const dateText = ` • ${new Date(list.created_at).toLocaleDateString('pl-PL')}`;

                const rawDescription = list.description || '';
                const shortDescription = rawDescription.length > 150 ? rawDescription.substring(0, 147) + '...' : rawDescription;
                const descriptionHtml = shortDescription ? `<p class="list-card-description">${shortDescription}</p>` : '';

                card.innerHTML = `
                    ${coverHtml}
                    <div class="list-content">
                        <h2 class="list-name">${list.name}</h2>
                        ${usernameHtml}
                        ${descriptionHtml}
                        <p class="list-meta">${typeBadge} ${itemsText}${reviewsText}${dateText}</p>
                    </div>
                `;
                container.appendChild(card);
            });

            if (isGlobal && meta) {
                renderPagination(
                    'pagination-footer',
                    meta,
                    (pageNum) => this.load(containerId, isGlobal, pageNum),
                    { scrollTarget: 'globalListCardsContainer' }
                );
            }
        } catch (e) {
            console.error(e);
            container.innerHTML = `<p class="error">Błąd podczas ładowania list: ${e.message}</p>`;
        }
    },

    translateType(type) {
        const types = {
            'album': 'Albumy',
            'track': 'Utwory',
            'artist': 'Artyści',
            'user': 'Użytkownicy'
        };
        return types[type] || type;
    }
};

App.details = {
    async init() {
        const container = document.querySelector('.album-list-container');
        if (!container) return;

        const params = new URLSearchParams(window.location.search);
        const slug = params.get('slug');
        if (!slug) {
            container.innerHTML = '<p class="error">Błąd: Nieprawidłowy link do listy (brak slug).</p>';
            return;
        }

        App.state.currentListSlug = slug;
        const sortSelect = document.getElementById('sort-by');
        const saveBtn = document.getElementById('save-sort-btn');
        const editBtn = document.getElementById('edit-list-btn');

        initPaginationControls('itemsPerPage', (newPage) => {
            this.load(slug, newPage, App.state.currentSortMethod, false);
        });

        await this.load(slug, 1);

        if (sortSelect) {
            sortSelect.onchange = async (e) => {
                App.state.currentSortMethod = e.target.value;
                await this.load(slug, 1, e.target.value, false);
                this.toggleSaveButton();
            };
        }
        if (saveBtn) saveBtn.onclick = () => this.saveSortSettings();
        if (editBtn) editBtn.onclick = () => this.openEditModal();
    },

    async load(slug, page = 1, sortBy = null, shouldInitComments = true) {
        try {
            const limit = getLimit();
            let url = `/api/user-lists/${slug}?page=${page}&limit=${limit}`;
            if (sortBy) url += `&sortBy=${sortBy}`;

            const data = await App.utils.fetchAPI(url);

            App.state.currentListData = data;
            App.state.listId = data.id;
            App.state.listType = data.type;
            App.state.currentUser = App.utils.getCurrentUser();
            App.state.isOwner = App.state.currentUser && (App.state.currentUser.id === data.user_id);
            App.state.currentSortMethod = sortBy || data.applied_sort_by;

            this.renderHeader(data, App.state.isOwner, App.state.currentSortMethod);

            const editBtn = document.getElementById('edit-list-btn');
            if (editBtn) editBtn.style.display = App.state.isOwner ? 'inline-block' : 'none';

            this.renderItems(data.items, data.type, App.state.isOwner, App.state.currentSortMethod, data.id, data.meta);

            if (data.meta) {
                renderPagination(
                    document.getElementById('pagination-footer'),
                    data.meta,
                    (newPage) => this.load(slug, newPage, App.state.currentSortMethod, false),
                    { scrollTarget: '.album-list-container' }
                );
            }

            App.state.isOrderModified = false;
            this.toggleSaveButton();

            if (window.SimilarLoader && slug) window.SimilarLoader.init('list', slug, 'similar-lists-container');

            // Inicjalizacja komentarzy - szukamy 'comments-system-root' z comment-box.html
            if (shouldInitComments && window.CommentsCore) {
                await new Promise(resolve => {
                    let attempts = 0;
                    const checkExist = setInterval(() => {
                        attempts++;
                        if (document.getElementById('comments-system-root')) {
                            clearInterval(checkExist);
                            resolve();
                        } else if (attempts > 50) {
                            clearInterval(checkExist);
                            resolve();
                        }
                    }, 100);
                });
                if(document.getElementById('comments-system-root')) {
                    new window.CommentsCore({
                        mode: 'LIST',
                        entityId: App.state.listId,
                        containerId: 'comments-system-root'
                    }).init();
                }
            }
        } catch (e) {
            console.error(e);
            const container = document.querySelector('.album-list-container');
            if (container) container.innerHTML = `<p class="error">${e.message}</p>`;
        }
    },

    renderHeader(data, isOwner, currentSortMethod) {
        const titleEl = document.getElementById('list-main-title');
        const metaEl = document.getElementById('list-meta-info');
        const descEl = document.querySelector('.list-description');
        const coverEl = document.getElementById('list-main-cover');
        const dynamicBg = document.getElementById('dynamic-background');

        if (titleEl) titleEl.textContent = data.name;
        if (metaEl) {
            const typeDisplay = App.catalog.translateType(data.type).toUpperCase();
            metaEl.innerHTML = `Typ listy: <strong>${typeDisplay}</strong> • Autor: <a href="/user/${data.creator}" class="author-link" style="color:#00ffcc; text-decoration:none; font-weight:bold;">${data.creator}</a>`;
        }
        if (descEl) descEl.textContent = data.description || 'Brak opisu.';

        const coverUrl = data.cover_url;
        if (coverEl) {
            coverEl.innerHTML = coverUrl
                ? `<img src="${coverUrl}" alt="Okładka ${data.name}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; border:1px solid #333;">`
                : '';
        }
        if (dynamicBg && coverUrl) {
            dynamicBg.style.backgroundImage = `url('${coverUrl}')`;
        } else if (dynamicBg) {
            dynamicBg.style.backgroundImage = 'none';
        }

        const sortSelect = document.getElementById('sort-by');
        if (sortSelect) {
            const manualText = isOwner ? "Ręcznie (Przeciągnij i upuść)" : "Kolejność ręczna";
            let options = `
                <option value="sort_order_asc">${manualText}</option>
                <option value="added_desc">Ostatnio dodane</option>
                <option value="added_asc">Najpierw najstarsze</option>
                <option value="title_asc">Nazwa (A-Z)</option>
            `;
            if (['album', 'track', 'artist'].includes(data.type)) {
                options += `<option value="rating_desc">Według oceny</option>`;
            }
            sortSelect.innerHTML = options;
            sortSelect.value = currentSortMethod;
        }
    },

    openEditModal() {
        if (!App.state.currentListData) return App.utils.toast('Dane listy nie zostały jeszcze załadowane', 'error');
        if (App.editModal) App.editModal.open(App.state.currentListData);
    },

    async updateList(listId, data) {
        try {
            await App.utils.fetchAPI(`/api/user-lists/${listId}`, { method: 'PUT', body: JSON.stringify(data) });
            App.utils.toast('Lista została zaktualizowana');
            window.location.reload();
        } catch (e) { App.utils.toast(e.message, 'error'); }
    },

    async deleteList() {
        if (!confirm('Czy na pewno chcesz usunąć tę listę?')) return;
        try {
            await App.utils.fetchAPI(`/api/user-lists/${App.state.listId}`, { method: 'DELETE' });
            window.location.href = '/profile.html';
        } catch (e) { App.utils.toast(e.message, 'error'); }
    },

    toggleSaveButton() {
        const saveBtn = document.getElementById('save-sort-btn');
        if (!saveBtn) return;
        const isManualSort = App.state.currentSortMethod === 'sort_order_asc';
        if (App.state.isOwner && isManualSort) {
            saveBtn.style.display = 'inline-block';
            saveBtn.disabled = !App.state.isOrderModified;
        } else {
            saveBtn.style.display = 'none';
        }
    },

    async saveSortSettings() {
        const sortMethod = App.state.currentSortMethod;
        const listId = App.state.listId;
        try {
            if (sortMethod === 'sort_order_asc' && App.state.isOrderModified) {
                const container = document.querySelector('.album-list');
                await this.saveOrder(container, listId);
                App.utils.toast('Kolejność zapisana!');
            }
            App.state.isOrderModified = false;
            this.toggleSaveButton();
        } catch (e) { App.utils.toast(e.message, 'error'); }
    },

    renderItems(items, type, isOwner, currentSort, listId, meta) {
        const container = document.querySelector('.album-list-container');
        const isManualView = (currentSort === 'sort_order_asc');
        const canEditOrder = isOwner && isManualView;

        let listDiv = container.querySelector('.album-list');
        if (!listDiv) {
            container.innerHTML = `<div class="album-list ${canEditOrder ? 'sortable-list' : ''}"></div>`;
            listDiv = container.querySelector('.album-list');
        } else {
            listDiv.className = `album-list ${canEditOrder ? 'sortable-list' : ''}`;
            if (listDiv.sortable) {
                listDiv.sortable.destroy();
                delete listDiv.sortable;
            }
            listDiv.innerHTML = '';
        }

        if (!items || !items.length) {
            listDiv.innerHTML = '<p class="empty-msg">Lista jest pusta.</p>';
            return;
        }

        const offset = meta ? (meta.page - 1) * meta.limit : 0;

        items.forEach((itemData, index) => {
            itemData.global_rank = offset + index + 1;
            const tempDiv = document.createElement('div');

            if (type === 'album') renderAlbums([itemData], tempDiv);
            else if (type === 'track') renderTracks([itemData], tempDiv);
            else if (type === 'artist') renderArtists([itemData], tempDiv);
            else if (type === 'user') tempDiv.innerHTML = this.getUserHtml(itemData, itemData.global_rank);

            const itemEl = tempDiv.firstElementChild;
            if (!itemEl) return;

            itemEl.dataset.entityId = itemData.id;

            if (canEditOrder) {
                const dragHandle = document.createElement('div');
                dragHandle.className = 'drag-handle';
                dragHandle.title = 'Przeciągnij, aby zmienić kolejność';
                dragHandle.innerHTML = '☰';
                itemEl.prepend(dragHandle);
            }

            if (isOwner) {
                const delBtn = document.createElement('button');
                delBtn.className = 'delete-list-item-btn';
                delBtn.title = 'Usuń z listy';
                delBtn.innerHTML = '✕';
                delBtn.onclick = (e) => { e.stopPropagation(); this.remove(listId, itemData.id); };
                itemEl.prepend(delBtn);
            }

            listDiv.appendChild(itemEl);
        });

        if (canEditOrder && window.Sortable) {
            listDiv.sortable = new Sortable(listDiv, {
                handle: '.drag-handle', animation: 150, ghostClass: 'sortable-ghost',
                onEnd: () => { App.state.isOrderModified = true; this.toggleSaveButton(); }
            });
        }
        this.injectListControlStyles();
    },

    injectListControlStyles() {
        if (document.getElementById('list-control-styles')) return;
        const style = document.createElement('style');
        style.id = 'list-control-styles';
        style.textContent = `
                .album-card { position: relative; }
                .drag-handle { position: absolute; left: 5px; top: 5px; cursor: grab; font-size: 1.2em; color: #555; z-index: 10; padding: 5px; background: rgba(0,0,0,0.5); border-radius: 4px; }
                .delete-list-item-btn { position: absolute; right: 5px; top: 5px; background: rgba(50,0,0,0.8); color: #fff; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; font-size: 12px; display: flex; align-items: center; justify-content: center; }
                .delete-list-item-btn:hover { background: red; }
            `;
        document.head.appendChild(style);
    },

    getUserHtml(user, rank) {
        const profileUrl = `/user/${user.username}`;
        const userPic = user.profile_pic ? `<img src="${user.profile_pic}" style="border-radius:50%" alt="${user.username}">` : '<div style="width:100%; height:100%; border-radius:50%; background:#222;"></div>';
        return `
                <div class="album-card">
                    <div class="chart-rank">#${rank}</div>
                    <a href="${profileUrl}" class="album-cover-link">
                         ${userPic}
                    </a>
                    <div class="album-details-wrapper">
                        <a href="${profileUrl}" class="album-text-link">
                            <h2>${user.username}</h2>
                            <p>${user.first_name || ''} ${user.last_name || ''}</p>
                        </a>
                    </div>
                </div>
            `;
    },

    async saveOrder(container, listId) {
        const currentPage = getCurrentPage();
        const itemsPerPage = getLimit();
        const offset = (currentPage - 1) * itemsPerPage;
        const newOrder = Array.from(container.children).map((el, idx) => ({
            entityId: el.dataset.entityId,
            sortOrder: offset + idx + 1
        }));
        await App.utils.fetchAPI(`/api/user-lists/${listId}/reorder`, { method: 'POST', body: JSON.stringify({ newOrder }) });
    },

    async remove(listId, entityId) {
        if (!confirm('Usunąć z listy?')) return;
        try {
            await App.utils.fetchAPI(`/api/user-lists/${listId}/items/${entityId}`, { method: 'DELETE' });
            this.load(App.state.currentListSlug, getCurrentPage(), App.state.currentSortMethod, false);
        } catch (e) { App.utils.toast(e.message, 'error'); }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('globalListCardsContainer')) App.catalog.init('globalListCardsContainer', true);
    if (document.getElementById('listCardsContainer')) App.catalog.init('listCardsContainer', false);
    if (document.querySelector('.album-list-container')) App.details.init();
});