/* frontend/js/similar-loader.js */

const SimilarLoader = {
    currentPage: 1,
    limit: 6,

    init: function(type, idOrSlug, containerId, layout = 'compact') {
        this.type = type;
        this.idOrSlug = idOrSlug;
        this.containerId = containerId;
        this.layout = layout;
        this.load(1);
    },

    load: function(page = 1) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        this.currentPage = page;
        let endpoint = `/api/similar/${this.type}s/${this.idOrSlug}?limit=${this.limit}&page=${this.currentPage}`;

        fetch(endpoint)
            .then(res => res.json())
            .then(data => {
                const items = data.items || [];
                const meta = data.meta || {};

                container.innerHTML = '';

                if (items.length > 0) {
                    const contentWrapper = document.createElement('div');
                    contentWrapper.className = 'similar-content-wrapper';
                    container.appendChild(contentWrapper);

                    // Если тип "list", используем сетку 3x2. Для альбомов/артистов возвращаем компактный вид.
                    if (this.type === 'list') {
                        this.renderGrid(this.type, items, contentWrapper);
                    } else {
                        this.renderCompact(this.type, items, contentWrapper);
                    }

                    if (meta.total_pages > 1) {
                        const controlsDiv = document.createElement('div');
                        controlsDiv.className = 'similar-pagination-controls';
                        controlsDiv.style.cssText = 'display: flex; justify-content: center; margin-top: 15px;';
                        container.appendChild(controlsDiv);

                        if (window.PaginationUtils) {
                            window.PaginationUtils.render(
                                controlsDiv,
                                meta,
                                (newPage) => this.load(newPage),
                                { scrollToTop: false }
                            );
                        } else {
                            import('/js/pagination.js').then(mod => {
                                mod.renderPagination(
                                    controlsDiv,
                                    meta,
                                    (newPage) => this.load(newPage),
                                    { scrollToTop: false }
                                );
                            }).catch(e => console.error("Pagination load error", e));
                        }
                    }
                } else {
                    container.innerHTML = '<p class="text-muted" style="padding:20px; text-align:center; color:#777;">Nie znaleziono podobnych obiektów</p>';
                }
            })
            .catch(err => console.error('SimilarLoader Error:', err));
    },

    // Старый добрый стиль для альбомов и артистов (горизонтальный)
    renderCompact: function(type, items, container) {
        const list = document.createElement('div');
        list.className = 'similar-compact-list';

        items.forEach(item => {
            const { imgUrl, title, sub, link, extra } = this.getItemData(type, item);
            const badgeText = type === 'album' ? 'Album' : (type === 'artist' ? 'Artysta' : 'Utwór');
            const card = document.createElement('a');
            card.className = 'compact-item';
            card.href = link;
            card.innerHTML = `
                <div class="compact-img-wrapper">
                    <img src="${imgUrl}" alt="${title}">
                </div>
                <div class="compact-info">
                    <div class="compact-title" title="${title}">${title}</div>
                    <div class="compact-subtitle">${sub}</div>
                    ${extra ? `<div class="compact-extra">${extra}</div>` : ''}
                    <div class="compact-meta"><span class="compact-type-badge">${badgeText}</span></div>
                </div>
            `;
            list.appendChild(card);
        });
        container.appendChild(list);
    },

    // Новый стиль сеткой 3x2 специально для списков
    renderGrid: function(type, items, container) {
        const grid = document.createElement('div');
        grid.className = 'similar-grid-layout';

        items.forEach(item => {
            const { imgUrl, title, sub, link, extra } = this.getItemData(type, item);
            const card = document.createElement('a');
            card.className = 'grid-item-card';
            card.href = link;
            card.innerHTML = `
                <div class="grid-img-box">
                    <img src="${imgUrl}" alt="${title}">
                    <span class="grid-type-tag">Lista</span>
                </div>
                <div class="grid-content-box">
                    <div class="grid-item-title" title="${title}">${title}</div>
                    <div class="grid-item-subtitle">${sub}</div>
                    ${extra ? `<div class="grid-item-extra">${extra}</div>` : ''}
                </div>
            `;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    },

    getItemData: function(type, item) {
        let imgUrl, title, sub, link, extra = null;

        if (type === 'album') {
            imgUrl = item.cover_url || '/img/default-artist.png';
            title = item.title;
            sub = item.artist_name || 'Nieznany';
            link = `/release/album/${item.slug}`;
        } else if (type === 'artist') {
            imgUrl = item.picture_url || '/img/default_avatar.png';
            title = item.name;
            sub = 'Wykonawca';
            link = `/artist/${item.slug}`;
            if (item.common_genres_count) {
                extra = `Wspólne: ${item.common_genres_count}`;
            }
        } else if (type === 'list') {
            imgUrl = item.cover_url || '/img/default-artist.png';
            title = item.name;
            sub = `przez ${item.username}`;
            link = `/list.html?slug=${item.slug}`;
            if (item.common_items_count) {
                extra = `Wspólne: ${item.common_items_count}`;
            }
        } else if (type === 'track') {
            imgUrl = item.cover_url || '/img/default-artist.png';
            title = item.title;
            sub = item.artist_name || 'Nieznany';
            link = `/track/${item.slug}`;
        }
        return { imgUrl, title, sub, link, extra };
    }
};

window.SimilarLoader = SimilarLoader;