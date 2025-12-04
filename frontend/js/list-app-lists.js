// frontend/js/list-app-lists.js

(function(App) {

    // === CATALOGS (All Lists / My Lists) ===
    App.catalog = {
        async init(containerId, isGlobal) {
            const container = document.getElementById(containerId);
            if (!container) return;

            try {
                const endpoint = isGlobal ? '/api/user-lists/global' : '/api/user-lists/my-lists';
                const data = await App.utils.fetchAPI(endpoint);
                const lists = isGlobal ? data.lists || data : data;

                container.innerHTML = '';
                if (!lists || lists.length === 0) {
                    container.innerHTML = '<p class="empty-msg">No lists yet.</p>';
                    return;
                }

                lists.forEach(list => {
                    const card = document.createElement('a');
                    card.className = 'list-card';
                    card.href = `/list.html?slug=${list.slug}`;

                    const usernameHtml = isGlobal ? `<p class="list-username">by ${list.username}</p>` : '';
                    const coverUrl = list.cover_url || '/img/no_cover.jpg';
                    const coverHtml = `<div class="list-cover-placeholder"><img src="${coverUrl}" alt="${list.name} Cover"></div>`;

                    card.innerHTML = `
                        ${coverHtml}
                        <div class="list-content">
                            <h2 class="list-name">${list.name}</h2>
                            ${usernameHtml}
                            <p class="list-meta">${list.albums_count} albums • ${new Date(list.created_at).toLocaleDateString()}</p>
                        </div>
                    `;

                    container.appendChild(card);
                });

            } catch (e) {
                container.innerHTML = `<p class="error">${e.message}</p>`;
            }
        }
    };

    // === LIST PAGE (list.html) ===
    App.details = {
        async init() {
            const container = document.querySelector('.album-list-container');
            if (!container) return;

            const params = new URLSearchParams(window.location.search);
            const slug = params.get('slug');

            if (!slug) {
                container.innerHTML = '<p class="error">Error: Invalid list link (no slug).</p>';
                return;
            }

            App.state.currentListSlug = slug;
            const sortSelect = document.getElementById('sort-by');
            const saveBtn = document.getElementById('save-sort-btn');
            const editBtn = document.getElementById('edit-list-btn');

            await this.load(slug);

            if (sortSelect) {
                sortSelect.onchange = async (e) => {
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

        async load(slug, sortBy = null) {
            try {
                let url = `/api/user-lists/${slug}`;
                if (sortBy) {
                    url += `?sortBy=${sortBy}`;
                }

                const data = await App.utils.fetchAPI(url);

                App.state.listId = data.id;
                App.state.currentUser = App.utils.getCurrentUser();
                App.state.isOwner = App.state.currentUser && (App.state.currentUser.id === data.user_id);
                App.state.currentSortMethod = sortBy || data.applied_sort_by || data.saved_sort_by;

                this.renderHeader(data, App.state.isOwner, App.state.currentSortMethod);

                const editBtn = document.getElementById('edit-list-btn');
                if (editBtn) {
                    editBtn.style.display = App.state.isOwner ? 'inline-block' : 'none';
                }

                this.renderAlbums(data.albums, App.state.isOwner, App.state.currentSortMethod, data.id);

                App.state.isOrderModified = false;
                this.toggleSaveButton();

            } catch (e) {
                console.error(e);
                const msg = e.message.includes('404') ? 'List not found or was deleted.' : e.message;
                document.querySelector('.album-list-container').innerHTML = `<p class="error">${msg}</p>`;
                document.querySelector('.list-header h1').textContent = 'Error';
            }
        },

        toggleSaveButton() {
            const saveBtn = document.getElementById('save-sort-btn');
            if (!saveBtn) return;
            const isManualSort = App.state.currentSortMethod === 'sort_order_asc';
            if (App.state.isOwner) {
                saveBtn.style.display = 'inline-block';
                saveBtn.disabled = isManualSort ? !App.state.isOrderModified : false;
                saveBtn.textContent = isManualSort ? 'Save order' : 'Save sort settings';
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
                }
                await App.utils.fetchAPI(`/api/user-lists/${listId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ saved_sort_by: sortMethod })
                });
                App.utils.toast('Sort settings saved!');
                App.state.isOrderModified = false;
                this.toggleSaveButton();
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        },

        renderHeader(data, isOwner, currentSortMethod) {
            document.querySelector('.list-header h1').textContent = data.name;
            document.querySelector('.list-header p').innerHTML =
                `Author: <a href="/profile.html?user=${data.creator}" class="author-link">${data.creator}</a> • ${new Date(data.created_at).toLocaleDateString()}`;

            const desc = document.querySelector('.list-description');
            if(desc) desc.textContent = data.description || '';

            const sortSelect = document.getElementById('sort-by');
            sortSelect.innerHTML = `
                <option value="added_desc">Newest first</option>
                <option value="added_asc">Oldest first</option>
                <option value="rating_desc">By rating</option>
                <option value="title_asc">Alphabetical (A-Z)</option>
                <option value="sort_order_asc">Manual (Drag & Drop)</option>
            `;
            let manualOpt = sortSelect.querySelector('option[value="sort_order_asc"]');
            if (!isOwner) manualOpt.disabled = true;
            else manualOpt.disabled = false;

            if (sortSelect) sortSelect.value = currentSortMethod;
        },

        // --- MAIN RENDER FUNCTION (EXACTLY AS IN NEW RELEASES) ---
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
                listDiv.innerHTML = '<p class="empty-msg">List is empty.</p>';
                return;
            }

            albums.forEach((album) => {
                const item = document.createElement('div');
                item.className = 'album-card';
                if (album.slug) item.id = album.slug;
                item.dataset.albumId = album.id;

                // === DATA LOGIC AS IN NEW RELEASES ===
                const albumUrl = `/release/album/${album.slug}`;
                const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : (album.release_year || 'N/A');

                const ratingValue = parseFloat(album.avg_score);
                const rating = (ratingValue && !isNaN(ratingValue) && ratingValue > 0) ? `${ratingValue.toFixed(2)} / 5.0` : "N/A";

                let descriptors = album.description;
                if (descriptors && typeof descriptors === 'string' && descriptors.toLowerCase() === 'null') descriptors = 'N/A';
                if (descriptors === null) descriptors = 'N/A';
                if (Array.isArray(descriptors)) descriptors = descriptors.join(', ');

                const listensCount = parseInt(album.listens_count || 0).toLocaleString();
                const likesCount = parseInt(album.likes_count || 0).toLocaleString();
                const wishlistCount = parseInt(album.wishlist_count || 0).toLocaleString();
                const inListsCount = parseInt(album.in_lists_count || 0).toLocaleString();
                const reviewsCount = parseInt(album.reviews_count || 0).toLocaleString();

                const activeListen = album.is_listened ? 'active' : '';
                const activeLike = album.is_liked ? 'active' : '';
                const activeWish = album.is_wishlisted ? 'active' : '';

                // === ADDITIONAL ELEMENTS FOR LISTS (Drag & Delete) ===
                const dragHandleHtml = isManual
                    ? '<div class="drag-handle" style="cursor:grab; font-size:1.5em; padding:15px 10px; color:#555; display:flex; align-items:center;">☰</div>'
                    : '';

                const deleteBtnHtml = isOwner
                    ? `<button class="delete-btn" onclick="ListApp.details.remove(${listId}, ${album.id})" style="background:none; border:none; color:#777; font-size:1.5em; cursor:pointer; padding:0 15px; align-self:center;">✕</button>`
                    : '';

                // === HTML ASSEMBLY (Identical to New Releases + List Specifics) ===
                item.innerHTML = `
                    ${dragHandleHtml}

                    <a href="${albumUrl}" class="album-cover-link">
                         ${album.cover_url ?
                    `<img src="${album.cover_url}" alt="${album.title} cover">` :
                    '<img src="https://via.placeholder.com/120" alt="Placeholder cover">'}
                    </a>

                    <div class="album-details-wrapper">
                        <a href="${albumUrl}" class="album-text-link">
                            <h2>${album.title}</h2>
                            <p><strong>Artist:</strong> ${album.artist_name || 'N/A'}</p>
                            <p><strong>Year:</strong> ${releaseYear}</p>
                            <p><strong>Genres:</strong> ${album.genres || 'N/A'}</p>
                            <p><strong>Descriptors:</strong> ${descriptors}</p>
                        </a>

                        <div class="rating-info">
                            <span class="score">${rating}</span>
                            <span title="Listens">🎧 ${listensCount} Listens</span>
                            <span title="Likes">❤️ ${likesCount} Likes</span>
                            <span title="Wishlist">⭐ ${wishlistCount} Wishlist</span>
                            <span title="Lists">📜 ${inListsCount} Lists</span>
                            <span title="Reviews">💬 ${reviewsCount} Reviews</span>
                        </div>

                        <div class="album-actions">
                            <button class="action-button ${activeListen}" data-album-id="${album.id}" data-action="listen">
                                🎧 Listen
                            </button>
                            <button class="action-button ${activeLike}" data-album-id="${album.id}" data-action="like">
                                ❤️ Like
                            </button>
                            <button class="action-button ${activeWish}" data-album-id="${album.id}" data-action="wishlist">
                                ⭐ Wishlist
                            </button>
                        </div>
                    </div>

                    ${deleteBtnHtml}
                `;

                // Навешиваем обработчики через ListApp context
                item.querySelectorAll('.action-button').forEach(btn => {
                    btn.addEventListener('click', (e) => this.handleAction(e));
                });

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

        // --- BUTTON LOGIC (Identical to New Releases) ---
        async handleAction(e) {
            e.stopPropagation();
            const button = e.target.closest('.action-button');
            if (!button) return;

            const albumId = button.dataset.albumId;
            const actionType = button.dataset.action;
            button.disabled = true;

            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    App.utils.toast('Please log in first', 'error');
                    button.disabled = false;
                    return;
                }

                const res = await fetch('/api/actions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ albumId, actionType })
                });

                if (!res.ok) throw new Error('Action failed');
                const data = await res.json();

                // 1. BUTTON SYNCHRONIZATION (Active State)
                if (data.active !== undefined) {
                    if (data.active) button.classList.add('active');
                    else button.classList.remove('active');
                } else {
                    button.classList.toggle('active');
                }

                // 2. COUNTER UPDATE IN INTERFACE (Exactly as in new releases)
                const card = button.closest('.album-card');
                if (card) {
                    let titleAttr = '';
                    let iconChar = '';
                    if(actionType === 'like') { titleAttr = 'Likes'; iconChar = '❤️'; }
                    else if(actionType === 'wishlist') { titleAttr = 'Wishlist'; iconChar = '⭐'; }
                    else if(actionType === 'listen') { titleAttr = 'Listens'; iconChar = '🎧'; }

                    if (titleAttr) {
                        const countSpan = card.querySelector(`.rating-info span[title="${titleAttr}"]`);
                        if(countSpan) {
                            const currentText = countSpan.textContent;
                            const match = currentText.match(/(\d+)/);
                            let count = match ? parseInt(match[0].replace(/,/g, '')) : 0;

                            if (data.active) {
                                count++;
                            } else {
                                count = Math.max(0, count - 1);
                            }

                            countSpan.textContent = `${iconChar} ${count.toLocaleString()} ${titleAttr}`;
                        }
                    }
                }
            } catch (error) {
                console.error(error);
                App.utils.toast(error.message, 'error');
            } finally {
                button.disabled = false;
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
            if(!confirm('Remove from list?')) return;
            try {
                await App.utils.fetchAPI(`/api/user-lists/${listId}/items/${albumId}`, { method: 'DELETE' });
                App.utils.toast('Removed');
                this.load(App.state.currentListSlug, App.state.currentSortMethod, false);
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        },

        async openEditModal(slug) {
            if (!App.state.isOwner) return App.utils.toast('No rights to edit', 'error');
            const listData = await App.utils.fetchAPI(`/api/user-lists/${slug}`);
            if (window.showListEditModal) {
                window.showListEditModal(listData);
            } else {
                App.utils.toast('Error: Edit module not loaded.', 'error');
            }
        },

        async updateList(listId, data) {
            try {
                await App.utils.fetchAPI(`/api/user-lists/${listId}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                App.utils.toast('List updated!');
                setTimeout(() => { window.location.reload(); }, 500);
            } catch (e) {
                App.utils.toast(e.message, 'error');
                throw e;
            }
        },

        async deleteList() {
            if (!App.state.isOwner || !App.state.listId) return;
            if (!confirm(`Are you sure you want to delete the list?`)) return;

            try {
                await App.utils.fetchAPI(`/api/user-lists/${App.state.listId}`, { method: 'DELETE' });
                App.utils.toast('List successfully deleted. Redirecting...');
                setTimeout(() => { window.location.href = '/lists_page.html'; }, 1000);
            } catch (e) {
                App.utils.toast(e.message, 'error');
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('globalListCardsContainer')) App.catalog.init('globalListCardsContainer', true);
        if (document.getElementById('listCardsContainer')) App.catalog.init('listCardsContainer', false);
        if (document.querySelector('.album-list-container')) App.details.init();
    });

})(window.ListApp);