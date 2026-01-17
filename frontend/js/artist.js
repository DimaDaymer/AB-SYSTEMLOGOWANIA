// === 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ===
window.components = window.components || {};
window.currentArtistId = null;
window.artistDataCache = null;
let similarTabLoaded = false;

// === 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (HELPERS) ===

async function loadComponent(containerId, componentPath) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return false;

        const response = await fetch(componentPath);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${componentPath}`);

        const html = await response.text();
        container.innerHTML = html;

        // Важная часть: принудительный запуск скриптов из HTML
        const scripts = container.querySelectorAll('script');
        scripts.forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.textContent;
            }
            document.head.appendChild(newScript);
            script.remove();
        });
        return true;
    } catch (error) {
        console.warn(`[Component] Failed to load ${componentPath}:`, error);
        return false;
    }
}

function getSlugFromURL() {
    let slug = window.location.pathname.split('/').pop();
    if (slug === 'artist.html' || !slug || slug.includes('.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        slug = urlParams.get('slug');
    }
    return slug;
}

function getToken() {
    return localStorage.getItem('token');
}

// === 3. ЗАГРУЗКА МОДУЛЕЙ И КОМПОНЕНТОВ ===

async function loadArtistModules(artistId, artistType) {
    // Используем loadComponent вместо простого innerHTML, чтобы скрипты внутри выполнились
    const loaded = await loadComponent('members-module-container', '/components/artist/artist-members.html');

    // Если компонент загрузился и скрипт внутри него создал функцию initMembersModule
    if (loaded && window.initMembersModule) {
        window.initMembersModule(artistId, artistType || 'solo');
    }

    // Загрузка комментариев
    const commentRes = await fetch('/components/comment-box.html');
    if (commentRes.ok) {
        document.getElementById('comments-module-container').innerHTML = await commentRes.text();
        if (window.CommentsCore) {
            new window.CommentsCore({
                mode: 'ARTIST',
                entityId: artistId,
                containerId: 'comments-system-root'
            });
        }
    }
}

async function loadListsModule() {
    const container = document.getElementById('artist-lists-container');
    if (!container || container.childElementCount > 1) return;
    await loadComponent('artist-lists-container', '/components/lists/entity-lists.html');
}

// === 4. РАБОТА С ДАННЫМИ (API) ===

async function fetchArtist(slug) {
    const token = getToken();
    const response = await fetch(`/api/artist/${slug}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
    });
    if (!response.ok) throw new Error('Artist fetch failed');
    return await response.json();
}

async function checkAdminRights(slug) {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` }});
        const user = await res.json();
        const btn = document.getElementById('edit-bio-btn');
        if (btn && user.role === 'admin') {
            btn.style.display = 'block';
            btn.onclick = () => window.location.href = `/edit_artist.html?slug=${slug}`;
        }
    } catch(e) {}
}

// === 5. ОБНОВЛЕНИЕ UI И РЕНДЕРИНГ ===

function renderArtistUI(data) {
    const { artist, discography } = data;
    document.title = `${artist.name} | Melody Rater`;

    const nameEl = document.getElementById('artist-name');
    if (nameEl) nameEl.textContent = artist.name;

    const picEl = document.getElementById('artist-picture');
    const artistImg = artist.picture_url || '/img/default-artist.png';
    if (picEl) picEl.src = artistImg;

    const bg = document.getElementById('dynamic-background');
    if (bg) bg.style.backgroundImage = `url('${artistImg}')`;

    renderRanks(artist);
    renderMetadata(artist);

    const currentSort = document.getElementById('sort-select')?.value || 'release_date_desc';
    renderDiscography(discography, currentSort);
}

function renderRanks(artist) {
    const rankContainer = document.getElementById('artist-rank-container');
    const rankList = document.getElementById('artist-rank-list');
    if (!rankContainer || !artist.ranks) return;

    let ranksHTML = [];
    if (artist.ranks.global) {
        ranksHTML.push(`<div><a href="/chart-page.html?type=artists&sort=rating#${artist.slug}" style="color: #adff2f; font-weight: bold;">#${artist.ranks.global} in General Chart</a></div>`);
    }
    if (artist.ranks.locations) {
        artist.ranks.locations.forEach(loc => {
            ranksHTML.push(`<div><a href="/chart-page.html?type=artists&location=${encodeURIComponent(loc.name)}&sort=rating#${artist.slug}" style="color: #00ffcc;">#${loc.rank} for ${loc.name}</a></div>`);
        });
    }
    rankList.innerHTML = ranksHTML.join('');
    rankContainer.style.display = ranksHTML.length > 0 ? 'block' : 'none';
}

function renderMetadata(artist) {
    const countryEl = document.getElementById('artist-country');
    if (countryEl && artist.locations) {
        countryEl.innerHTML = artist.locations.map(loc =>
            `<a href="/chart-page.html?type=artists&location=${encodeURIComponent(loc)}" class="location-link">${loc}</a>`
        ).join(', ') || 'Unknown';
    }

    const genresEl = document.getElementById('artist-genres');
    if (genresEl && artist.genres) {
        genresEl.innerHTML = artist.genres.map(g =>
            `<a href="/chart-page.html?type=artists&genres=${encodeURIComponent(g)}" class="genre-tag">${g}</a>`
        ).join('');
    }

    if (document.getElementById('artist-formed-year')) document.getElementById('artist-formed-year').textContent = artist.formed_year || 'N/A';
    if (document.getElementById('artist-followers-count')) document.getElementById('artist-followers-count').textContent = artist.followers_count || 0;
    if (document.getElementById('artist-global-score')) document.getElementById('artist-global-score').textContent = artist.globalScore || 'N/A';
    if (document.getElementById('artist-description')) document.getElementById('artist-description').innerHTML = (artist.bio || 'No bio.').replace(/\n/g, '<br>');
}

function renderDiscography(discography, sortBy) {
    const discoContainer = document.getElementById('discography-list');
    if (!discoContainer) return;
    discoContainer.innerHTML = '';

    const priorities = ['Album', 'EP', 'Mixtape', 'Single', 'Compilation', 'Live', 'Demo'];
    const types = Object.keys(discography).sort((a, b) => {
        const getIdx = (s) => { const i = priorities.findIndex(p => s.includes(p)); return i === -1 ? 99 : i; };
        return getIdx(a) - getIdx(b);
    });

    types.forEach(type => {
        const albums = sortAlbums(discography[type], sortBy);
        if (!albums.length) return;

        const section = document.createElement('div');
        section.className = 'disco-section';
        section.innerHTML = `<h3 class="section-title">${type}s</h3>`;

        const grid = document.createElement('div');
        grid.className = 'albums-grid';

        albums.forEach(album => {
            const rating = parseFloat(album.average_rating) > 0 ? Number(album.average_rating).toFixed(1) : '-';
            grid.innerHTML += `
                <div class="album-card">
                    <a href="/release/album/${album.slug}" class="album-link">
                        <div class="cover-wrapper">
                            <img src="${album.cover_url || '/img/default-artist.png'}" loading="lazy">
                            <div class="rating-badge">${rating}</div>
                        </div>
                        <div class="album-title">${album.title}</div>
                        <div class="album-year">${album.release_year}</div>
                    </a>
                    <div class="album-actions">
                        <button class="action-button ${album.is_listened ? 'active' : ''}" data-album-id="${album.id}" data-action="listen">
                            <i class="fas fa-headphones"></i>
                        </button>
                        <button class="action-button ${album.is_wishlisted ? 'active' : ''}" data-album-id="${album.id}" data-action="wishlist">
                            <img src="https://api.iconify.design/material-symbols:bookmark.svg" alt="wishlist" />
                        </button>
                        <button class="action-button ${album.is_liked ? 'active' : ''}" data-album-id="${album.id}" data-action="like">
                            <i class="fas fa-heart"></i>
                        </button>
                    </div>
                </div>`;
        });
        section.appendChild(grid);
        discoContainer.appendChild(section);
    });
    setupAlbumActionButtons();
}

// === 6. ОБРАБОТЧИКИ (HANDLERS) ===

function sortAlbums(albums, sortBy) {
    return [...albums].sort((a, b) => {
        const rA = parseFloat(a.average_rating) || 0, rB = parseFloat(b.average_rating) || 0;
        const dA = new Date(a.release_date).getTime() || 0, dB = new Date(b.release_date).getTime() || 0;
        switch (sortBy) {
            case 'average_rating_desc': return rB - rA || (b.ratings_count - a.ratings_count);
            case 'release_date_asc': return dA - dB;
            case 'release_date_desc': return dB - dA;
            case 'title_asc': return a.title.localeCompare(b.title);
            default: return dB - dA;
        }
    });
}

async function handleAlbumAction(e) {
    const btn = e.currentTarget;
    const albumId = btn.dataset.albumId;
    const actionType = btn.dataset.action;
    const token = getToken();

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const isActive = btn.classList.contains('active');
        const method = isActive ? 'DELETE' : 'POST';
        const url = isActive
            ? `/api/actions?albumId=${albumId}&actionType=${actionType}`
            : '/api/actions';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: method === 'POST' ? JSON.stringify({ albumId, actionType }) : null
        });

        if (res.ok) {
            btn.classList.toggle('active');
        }
    } catch (err) {
        console.error('Action failed:', err);
    }
}

function setupAlbumActionButtons() {
    document.querySelectorAll('.album-actions .action-button').forEach(btn => {
        btn.onclick = (e) => handleAlbumAction(e);
    });
}

window.setupFollowButton = (artistId, isFollowing) => {
    const btn = document.getElementById('follow-button');
    if (!btn) return;

    const updateUI = (active) => {
        btn.innerHTML = active ? '<i class="fas fa-check"></i> Obserwujesz' : '<i class="fas fa-plus"></i> Obserwuj';
        if (active) {
            btn.classList.add('following');
        } else {
            btn.classList.remove('following');
        }
    };

    updateUI(isFollowing);

    btn.onclick = async () => {
        const token = getToken();
        if (!token) return window.location.href = '/login.html';

        btn.disabled = true;
        try {
            const res = await fetch(`/api/artist/${artistId}/follow`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (res.ok) updateUI(data.status === 'followed');
        } catch (e) {
            console.error('Follow error:', e);
        } finally {
            btn.disabled = false;
        }
    };
};

// === 7. ИНИЦИАЛИЗАЦИЯ ===

document.addEventListener('DOMContentLoaded', async () => {
    const slug = getSlugFromURL();
    if (!slug) return;

    try {
        const data = await fetchArtist(slug);
        window.currentArtistId = data.artist.id;
        window.artistDataCache = data;

        renderArtistUI(data);
        setupFollowButton(data.artist.id, data.artist.isFollowing);

        const listBtn = document.getElementById('add-to-list-btn');
        if (listBtn) listBtn.onclick = () => window.openListWindow?.(data.artist.id, 'artist');

        checkAdminRights(slug);
        setupTabs();

        await loadArtistModules(data.artist.id, data.artist.artist_type);

        document.getElementById('sort-select')?.addEventListener('change', (e) => {
            renderDiscography(window.artistDataCache.discography, e.target.value);
        });

    } catch (error) {
        console.error('Init Error:', error);
    }
});

function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            const content = document.getElementById(tab.dataset.tab);
            if (content) content.classList.add('active');

            if (tab.dataset.tab === 'lists') loadListsModule();
            if (tab.dataset.tab === 'similar' && !similarTabLoaded) {
                window.SimilarLoader?.init('artist', window.currentArtistId, 'similar-artists-container', 'compact');
                similarTabLoaded = true;
            }
            if (tab.dataset.tab === 'discography') setupAlbumActionButtons();
        };
    });
}