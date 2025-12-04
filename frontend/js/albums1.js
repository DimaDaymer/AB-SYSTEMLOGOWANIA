// js/albums1.js

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ (Доступны везде) ===
function showMessage(message, isError = false) {
    const existingMessages = document.querySelectorAll('.global-message');
    existingMessages.forEach(msg => msg.remove());
    const messageDiv = document.createElement('div');
    messageDiv.className = 'global-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        padding: 10px 20px; background: ${isError ? '#ffdddd' : '#ddffdd'};
        color: ${isError ? '#ff0000' : '#008800'}; border: 1px solid ${isError ? '#ff0000' : '#008800'};
        border-radius: 5px; z-index: 1000; font-weight: bold;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2); transition: opacity 0.3s ease;
    `;
    document.body.appendChild(messageDiv);
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => messageDiv.remove(), 300);
    }, 5000);
}
window.showMessage = showMessage;

async function loadComponent(containerId, componentPath) {
    try {
        const container = document.getElementById(containerId);
        if (!container) {
            return false;
        }

        const response = await fetch(componentPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        container.innerHTML = html;

        const scripts = container.querySelectorAll('script');
        scripts.forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) newScript.src = script.src;
            else newScript.textContent = script.textContent;
            document.head.appendChild(newScript);
            // Удаляем старый скрипт, чтобы не засорять DOM,
            // но помните, что appendChild в head все равно выполняет его.
            script.remove();
        });
        return true;
    } catch (error) {
        console.warn(`[Component] Failed to load ${componentPath}:`, error);
        return false;
    }
}
window.loadComponent = loadComponent;

// === ЛОГИКА АЛЬБОМОВ ===
let currentAlbumId = null;
let albumDataCache = null;
window.components = window.components || {};

document.addEventListener('DOMContentLoaded', async () => {
    if (!document.getElementById('album-cover-container')) {
        return;
    }

    try {
        const slug = getSlugFromURL();
        if (!slug) throw new Error('No slug provided');

        await loadNavbar();
        await loadBaseComponents();
        await loadChildComponents();

        albumDataCache = await fetchAlbum(slug);
        currentAlbumId = albumDataCache.id;
        window.currentAlbumId = currentAlbumId;
        window.albumDataCache = albumDataCache;

        updateComponents(albumDataCache);

        updateScoresDisplay({
            average_rating: albumDataCache.average_rating || albumDataCache.avg_score,
            rating_count: albumDataCache.rating_count || albumDataCache.ratings_count
        });

        await loadUserData(currentAlbumId);
        checkAdminRights(slug);

    } catch (error) {
        console.error('[Albums] Init error:', error);
    }
});

function getSlugFromURL() {
    const path = window.location.pathname;
    const slug = path.substring(path.lastIndexOf('/') + 1);
    return (slug && slug !== 'album') ? slug : null;
}

async function loadNavbar() {
    const cont = document.getElementById('navbar-container');
    if(cont) {
        try {
            const res = await fetch('/navbar.html');
            if(res.ok) {
                cont.innerHTML = await res.text();
                cont.querySelectorAll('script').forEach(s => {
                    const sc = document.createElement('script');
                    if(s.src) sc.src = s.src;
                    else sc.textContent = s.textContent;
                    document.body.appendChild(sc);
                });
                if (window.initNavbar) {
                    window.initNavbar();
                }
            }
        } catch(e) { console.error('Navbar load failed', e); }
    }
}

async function loadBaseComponents() {
    const baseComponents = [
        { id: 'album-cover-container', path: '/components/albums/album-cover.html' },
        { id: 'tracklist-container', path: '/components/albums/tracklist.html' },
        { id: 'album-info-container', path: '/components/albums/album-info.html' },
        { id: 'tabs-container', path: '/components/albums/tabs-container.html' },
        { id: 'user-actions-container', path: '/components/albums/user-actions.html' },
        { id: 'media-links-container', path: '/components/albums/media-links.html' },
        { id: 'album-ratings-host-container', path: '/components/albums/album-ratings.html' },
    ];
    await Promise.all(baseComponents.map(c => loadComponent(c.id, c.path)));
}

async function loadChildComponents() {
    await loadComponent('track-ratings-tab-container', '/components/albums/track-ratings-tab.html');
    await loadComponent('album-lists-tab-container', '/components/albums/album-lists.html');
    await loadComponent('histogram-container', '/components/albums/histogram.html');
    await loadComponent('album-star-rating-host', '/components/albums/album-rating-stars.html');
    // Здесь загружается компонент комментариев, который внутри себя проверит загружен ли core.js
    await loadComponent('comments-container', '/components/albums/comment-box-album.html');
    await loadComponent('credits-container', '/components/albums/credits.html');
}

async function fetchAlbum(slug) {
    const response = await fetch(`/api/albums/by-slug/${slug}`);
    if (!response.ok) throw new Error('Album not found');
    return await response.json();
}

function updateComponents(data) {
    const bg = document.getElementById('dynamic-background');
    if (bg && data.cover_url) bg.style.backgroundImage = `url('${data.cover_url}')`;

    if (window.components.albumCover) window.components.albumCover.update(data);
    if (window.components.tracklist) window.components.tracklist.update(data.tracks || []);
    if (window.components.albumInfo) window.components.albumInfo.update(data);
    if (window.components.histogram) window.components.histogram.update(data.id);

    // Безопасное обновление Media Links
    if (window.components.mediaLinks) {
        try {
            window.components.mediaLinks.update(data.id);
        } catch (e) {
            console.warn("Media Links update failed (likely JSON error):", e);
        }
    }

    if (window.components.trackRatingsTab && data.tracks) {
        window.components.trackRatingsTab.update(data.tracks, {});
    }

    // Старый инициализатор удален, так как новый comments-box сам себя инициализирует
    // через внутренний скрипт и CommentsCore
    // if (window.CommentSystem && data.id) { window.CommentSystem.init(data.id); }

    if (window.initCreditsModule && data.id) {
        window.initCreditsModule(data.id);
    }
}

function updateScoresDisplay(stats) {
    const userScoreEl = document.getElementById('global-album-score');
    const userRatingsCountEl = document.getElementById('global-ratings-count');

    if (!stats) return;

    const rawScore = parseFloat(stats.average_rating || stats.average_score);
    const userTotalRatings = parseInt(stats.total_ratings || stats.rating_count || 0);
    let displayScore = 'N/A';

    if (!isNaN(rawScore) && (rawScore > 0 || userTotalRatings > 0)) {
        displayScore = rawScore.toFixed(2);
    }

    if (userScoreEl) userScoreEl.innerHTML = `${displayScore} <span style="font-size:1.5rem;color:#ADFF2F;">★</span>`;
    if (userRatingsCountEl) userRatingsCountEl.textContent = `based on ${userTotalRatings.toLocaleString()} ratings`;
}

async function loadUserData(albumId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`/api/ratings/${albumId}/user-rating`, { headers: { 'Authorization': `Bearer ${token}` }})
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && data.score !== null && window.components.albumRatingStars) {
                window.currentAlbumRating = parseFloat(data.score);
                window.components.albumRatingStars.updateRating(window.currentAlbumRating);
            }
        });

    fetch(`/api/actions/album/${albumId}`, { headers: { 'Authorization': `Bearer ${token}` }})
        .then(res => res.ok ? res.json() : [])
        .then(actions => {
            actions.forEach(a => {
                const btn = document.querySelector(`.user-actions div[data-action="${a.action_type}"]`);
                if (btn) btn.classList.add('active');
            });
        });

    if (window.components.trackRatingsTab && albumDataCache.tracks) {
        fetch(`/api/track-ratings/album/${albumId}`, { headers: { 'Authorization': `Bearer ${token}` }})
            .then(res => res.ok ? res.json() : {})
            .then(userTrackRatings => {
                window.components.trackRatingsTab.update(albumDataCache.tracks, userTrackRatings);
            });
    }
}

window.rateAlbum = async (rating) => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return window.location.href = '/login.html';

        const res = await fetch(`/api/ratings/${currentAlbumId}/ratings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ score: rating })
        });

        if (!res.ok) throw new Error('Failed');
        showMessage('Rating saved!');

        window.currentAlbumRating = rating;
        if (window.components.albumRatingStars) window.components.albumRatingStars.updateRating(rating);

        setTimeout(() => { refreshStats(); }, 500);

    } catch(e) { showMessage('Error saving rating', true); }
};

window.clearAlbumRating = async () => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return window.location.href = '/login.html';

        const res = await fetch(`/api/ratings/${currentAlbumId}/ratings`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${token}`}
        });

        if (!res.ok) throw new Error('Failed');
        showMessage('Rating cleared!');

        window.currentAlbumRating = 0;
        if (window.components.albumRatingStars){
            window.components.albumRatingStars.updateRating(0);
        }
        setTimeout(() => { refreshStats(); }, 500);

    } catch(e) { showMessage('Error clearing rating', true); }
};

async function refreshStats() {
    try {
        const res = await fetch(`/api/ratings/album/${currentAlbumId}/stats`);
        if (res.ok) {
            const data = await res.json();
            updateScoresDisplay(data);
        }
        if (window.components.histogram) {
            window.components.histogram.update(currentAlbumId);
        }
    } catch(e) { console.error(e); }
}

async function sendAlbumAction(actionType) {
    if (!currentAlbumId) return;
    try {
        const token = localStorage.getItem('token');
        if (!token) return window.location.href = '/login.html';
        const button = document.querySelector(`.user-actions div[data-action="${actionType}"]`);
        if (!button) return;
        const isActive = button.classList.contains('active');
        const method = isActive ? 'DELETE' : 'POST';
        const url = isActive ? `/api/actions?albumId=${currentAlbumId}&actionType=${actionType}` : '/api/actions';
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: method === 'POST' ? JSON.stringify({ albumId: currentAlbumId, actionType }) : null
        });
        if (!res.ok) throw new Error('Action failed');
        button.classList.toggle('active');
        showMessage(isActive ? `Removed from ${actionType}` : `Added to ${actionType}`);
    } catch (err) { showMessage('Error: ' + err.message, true); }
}

document.addEventListener('click', async (e) => {
    if (e.target.closest('.user-actions div[data-action]')) {
        const button = e.target.closest('.user-actions div[data-action]');
        const actionType = button.dataset.action;
        if (actionType !== 'add-to-list') await sendAlbumAction(actionType);
    }
});

async function checkAdminRights(slug) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` }});
        const user = await res.json();
        const btn = document.getElementById('edit-album-btn');
        if (btn && user.role === 'admin') {
            btn.style.display = 'block';
            btn.onclick = () => window.location.href = `/edit_album.html?slug=${slug}`;
        }
    } catch(e) {}
}

async function openTagWindow() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch('/tag_window.html');
        if (!response.ok) {
            window.showMessage('Failed to fetch tag_window.html.', true);
            throw new Error(`Failed to fetch tag_window.html: ${response.status}`);
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const head = document.head;
        const styleElement = doc.querySelector('style');
        if (styleElement && !head.querySelector('#tag-window-styles')) {
            const newStyle = document.createElement('style');
            newStyle.id = 'tag-window-styles';
            newStyle.textContent = styleElement.textContent;
            head.appendChild(newStyle);
        }

        const overlayElement = doc.querySelector('.overlay');
        if (!overlayElement) return;

        let existingOverlay = document.getElementById('tag-overlay');
        if (existingOverlay) existingOverlay.remove();

        overlayElement.id = 'tag-overlay';
        document.body.appendChild(overlayElement);

        await new Promise(resolve => setTimeout(resolve, 50));
        const targetOverlay = document.getElementById('tag-overlay');
        if (targetOverlay) {
            targetOverlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
        }

        doc.querySelectorAll('script').forEach(script => {
            const newScript = document.createElement('script');
            newScript.textContent = script.textContent;
            document.body.appendChild(newScript);
        });

        if (window.loadAlbumTags) {
            window.loadAlbumTags();
        }
    } catch (err) {
        console.error('Failed to open tag window:', err);
    }
}

window.openTagWindow = openTagWindow;
window.sendAlbumAction = sendAlbumAction;
window.rateAlbum = rateAlbum;
window.clearAlbumRating = clearAlbumRating;
window.currentAlbumId = currentAlbumId;
window.albumDataCache = albumDataCache;