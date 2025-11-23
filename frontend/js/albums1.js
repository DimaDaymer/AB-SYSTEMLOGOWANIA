export function showMessage(message, isError = false) {
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

export async function loadComponent(containerId, componentPath) {
    try {
        const container = document.getElementById(containerId);
        // Если контейнера нет, возвращаем false, чтобы знать об ошибке
        if (!container) {
            console.warn(`Container #${containerId} not found for ${componentPath}`);
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
            script.remove();
        });
        return true;
    } catch (error) {
        console.warn(`[Component] Failed to load ${componentPath}:`, error);
        return false;
    }
}
window.loadComponent = loadComponent;

let currentAlbumId = null;
let albumDataCache = null;
window.components = window.components || {};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const slug = getSlugFromURL();
        if (!slug) throw new Error('No slug provided');

        // 1. Загружаем Навбар
        await loadNavbar();

        // 2. !!! ВАЖНО: Сначала грузим ОСНОВНЫЕ контейнеры !!!
        await loadBaseComponents();

        // 3. !!! ВАЖНО: Теперь, когда Tabs Container создан, грузим ВЛОЖЕННЫЕ компоненты !!!
        await loadChildComponents();

        // 4. Получаем данные и обновляем всё
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
        const res = await fetch('/navbar.html');
        cont.innerHTML = await res.text();
        if (typeof initNavbar === 'function') initNavbar();
    }
}

// Загрузка каркаса (Родительские блоки)
async function loadBaseComponents() {
    const baseComponents = [
        { id: 'album-cover-container', path: '/components/albums/album-cover.html' },
        { id: 'tracklist-container', path: '/components/albums/tracklist.html' },
        { id: 'album-info-container', path: '/components/albums/album-info.html' },
        { id: 'tabs-container', path: '/components/albums/tabs-container.html' }, // <--- Создает DIV для треков
        { id: 'user-actions-container', path: '/components/albums/user-actions.html' },
        { id: 'album-star-rating-host', path: '/components/albums/album-rating-stars.html' },
        { id: 'histogram-container', path: '/components/albums/histogram.html' },
        { id: 'media-links-container', path: '/components/albums/media-links.html' }
    ];
    await Promise.all(baseComponents.map(c => loadComponent(c.id, c.path)));
}

// Загрузка вложенных элементов (Дочерние блоки)
async function loadChildComponents() {
    // Этот компонент грузится ВНУТРЬ tabs-container.html, поэтому ждем
    await loadComponent('track-ratings-tab-container', '/components/albums/track-ratings-tab.html');
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
    if (window.components.mediaLinks) window.components.mediaLinks.update(data.id);

    // Обновляем рейтинг треков
    if (window.components.trackRatingsTab && data.tracks) {
        window.components.trackRatingsTab.update(data.tracks, {});
    }
}

function updateScoresDisplay(stats) {
    const userScoreEl = document.querySelector('.score-value');
    const userRatingsCountEl = document.querySelector('.score-ratings');
    if (!stats) return;
    const rawScore = parseFloat(stats.average_score || stats.average_rating);
    const userAvgScore = (isNaN(rawScore) || rawScore === 0) ? 'N/A' : rawScore.toFixed(2);
    const userTotalRatings = stats.total_ratings || stats.rating_count || 0;
    if (userScoreEl) userScoreEl.innerHTML = `${userAvgScore} <span style="font-size:1.5rem;color:#ADFF2F;">★</span>`;
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

// Глобальные функции
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
        refreshStats();
    } catch(e) { showMessage('Error saving rating', true); }
};

window.clearAlbumRating = async () => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return window.location.href = '/login.html';
        const res = await fetch(`/api/ratings/${currentAlbumId}/ratings`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed');
        showMessage('Rating cleared!');
        window.currentAlbumRating = 0;
        if (window.components.albumRatingStars) window.components.albumRatingStars.updateRating(0);
        refreshStats();
    } catch(e) { showMessage('Error clearing rating', true); }
};

async function refreshStats() {
    try {
        const res = await fetch(`/api/ratings/album/${currentAlbumId}/stats`);
        if (res.ok) updateScoresDisplay(await res.json());

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
// Экспорты для HTML

async function openListWindow() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }
        const response = await fetch('/list_window.html');
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const styleElement = doc.querySelector('style');
        if (styleElement) {
            const head = document.head || document.getElementsByTagName('head')[0];
            if (!head.querySelector('#list-window-styles')) {
                const newStyle = document.createElement('style');
                newStyle.id = 'list-window-styles';
                newStyle.textContent = styleElement.textContent;
                head.appendChild(newStyle);
            }
        }

        const overlay = doc.querySelector('.overlay');
        let existingOverlay = document.getElementById('list-overlay');
        if (!existingOverlay) {
            overlay.id = 'list-overlay';
            document.body.appendChild(overlay);
        } else {
            existingOverlay.innerHTML = overlay.innerHTML;
        }

        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) newScript.src = script.src;
            else newScript.textContent = script.textContent;
            document.body.appendChild(newScript);
        });

        await new Promise(resolve => setTimeout(resolve, 50));
        const targetOverlay = document.getElementById('list-overlay');
        if (targetOverlay) {
            targetOverlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
            if (window.loadUserLists) window.loadUserLists();
            if (window.setupTabSwitching) window.setupTabSwitching();
        }
    } catch (err) {
        console.error(err);
    }
}

async function openTagWindow() {
    try {
        console.log('Attempting to open tag window...');
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
        if (styleElement) {
            if (!head.querySelector('#tag-window-styles')) {
                const newStyle = document.createElement('style');
                newStyle.id = 'tag-window-styles';
                newStyle.textContent = styleElement.textContent;
                head.appendChild(newStyle);
                console.log('Tag window styles added to head.');
            }
        }

        const overlayElement = doc.querySelector('.overlay');
        if (!overlayElement) {
            console.error('Overlay element not found in tag_window.html');
            window.showMessage('Modal content error.', true);
            return;
        }

        let existingOverlay = document.getElementById('tag-overlay');
        if (existingOverlay) existingOverlay.remove();
        console.log('Old overlay removed, new overlay element found.');

        overlayElement.id = 'tag-overlay';
        document.body.appendChild(overlayElement);

        await new Promise(resolve => setTimeout(resolve, 50));
        const targetOverlay = document.getElementById('tag-overlay');
        if (targetOverlay) {
            targetOverlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
            console.log('Tag window displayed.');
        }

        doc.querySelectorAll('script').forEach(script => {
            const newScript = document.createElement('script');
            newScript.textContent = script.textContent;
            document.body.appendChild(newScript);
        });
        console.log('Tag window scripts executed.');

        if (window.loadAlbumTags) {
            window.loadAlbumTags();
        }

    } catch (err) {
        console.error('Failed to open tag window:', err);
        window.showMessage('Failed to open tag window. Check console.', true);
    }
}

window.openTagWindow = openTagWindow;
window.openListWindow = openListWindow;
window.sendAlbumAction = sendAlbumAction;
window.rateAlbum = rateAlbum;
window.clearAlbumRating = clearAlbumRating; // <-- Добавляем новую функцию в window
window.currentAlbumId = currentAlbumId;
window.albumDataCache = albumDataCache;