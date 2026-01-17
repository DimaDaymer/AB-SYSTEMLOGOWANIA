// === 1. ZMIENNE GLOBALNE I STAN ===
window.components = window.components || {};
window.currentAlbumId = null;
window.albumDataCache = null;
window.currentAlbumRating = 0;

window.showMessage = window.showMessage || function(msg, isError = false) {
    console.log(`[Message] ${isError ? 'ERROR: ' : ''}${msg}`);
    if (isError) alert(msg);
};

// === 2. FUNKCJE POMOCNICZE (HELPERS) ===

async function loadComponent(containerId, componentPath) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return false;

        const response = await fetch(componentPath);
        if (!response.ok) throw new Error(`HTTP ${response.status} dla ${componentPath}`);

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
        console.warn(`[Komponent] Nie udało się załadować ${componentPath}:`, error);
        return false;
    }
}
window.loadComponent = loadComponent;

function getSlugFromURL() {
    const path = window.location.pathname;
    const parts = path.split('/');
    const slug = parts[parts.length - 1];
    return (slug && slug !== 'album' && slug !== '') ? slug : null;
}

function getToken() {
    return localStorage.getItem('token');
}

// === 3. ŁADOWANIE KOMPONENTÓW ===

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
    const children = [
        { id: 'track-ratings-tab-container', path: '/components/albums/track-ratings-tab.html' },
        { id: 'album-lists-tab-container', path: '/components/lists/entity-lists.html' },
        { id: 'album-tags-tab-container', path: '/components/albums/tags.html' },
        { id: 'histogram-container', path: '/components/albums/histogram.html' },
        { id: 'album-star-rating-host', path: '/components/albums/album-rating-stars.html' },
        { id: 'credits-container', path: '/components/albums/credits.html' }
    ];
    await Promise.all(children.map(c => loadComponent(c.id, c.path)));
}

async function loadCommentsModule(albumId) {
    try {
        const commentRes = await fetch('/components/comment-box.html');
        if (commentRes.ok) {
            const container = document.getElementById('comments-container') || document.getElementById('comments-module-container');
            if (container) {
                container.innerHTML = await commentRes.text();
                if (window.CommentsCore) {
                    new window.CommentsCore({
                        mode: 'ALBUM',
                        entityId: albumId,
                        containerId: 'comments-system-root'
                    });
                }
            }
        }
    } catch (e) {
        console.error("Błąd ładowania modułu komentarzy:", e);
    }
}

// === 4. PRACA Z DANYMI (API) ===

async function fetchAlbum(slug) {
    const response = await fetch(`/api/albums/by-slug/${slug}`);
    if (!response.ok) throw new Error('Album nie został znaleziony');
    return await response.json();
}

async function loadUserData(albumId) {
    const token = getToken();
    if (!token) return;

    fetch(`/api/ratings/${albumId}/user-rating`, { headers: { 'Authorization': `Bearer ${token}` }})
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && data.score !== null && window.components.albumRatingStars) {
                window.currentAlbumRating = parseFloat(data.score);
                window.components.albumRatingStars.updateRating(window.currentAlbumRating);
            }
        }).catch(err => console.warn('User rating load error', err));

    fetch(`/api/actions/album/${albumId}`, { headers: { 'Authorization': `Bearer ${token}` }})
        .then(res => res.ok ? res.json() : [])
        .then(actions => {
            actions.forEach(a => {
                const btn = document.querySelector(`.user-actions div[data-action="${a.action_type}"]`);
                if (btn) btn.classList.add('active');
            });
        }).catch(err => console.warn('Actions load error', err));
}

async function loadTrackScores(albumId) {
    const token = getToken();
    if (!token || !window.components.trackRatingsTab) return;

    try {
        const res = await fetch(`/api/track-ratings/album/${albumId}/user-scores`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Błąd pobierania ocen utworów');
        const userRatingsMap = await res.json();

        if (window.albumDataCache && window.albumDataCache.tracks) {
            window.components.trackRatingsTab.update(window.albumDataCache.tracks, userRatingsMap);
        }
    } catch(e) { console.error('[Albumy] Utwory:', e); }
}

async function refreshStats() {
    if (!window.currentAlbumId) return;
    try {
        const res = await fetch(`/api/ratings/album/${window.currentAlbumId}/stats`);
        if (res.ok) {
            const data = await res.json();
            const normalizedData = {
                avg_score: data.avg_score || data.average_rating || 0,
                ratings_count: data.ratings_count || data.rating_count || 0
            };
            if (window.albumDataCache) {
                window.albumDataCache.avg_score = normalizedData.avg_score;
                window.albumDataCache.ratings_count = normalizedData.ratings_count;
            }
            updateScoresDisplay(normalizedData);
            if (window.components.histogram) window.components.histogram.update(window.currentAlbumId);
        }
    } catch(e) { console.error('[Statystyki] Refresh error:', e); }
}

// === 5. AKTUALIZACJA INTERFEJSU (UI) ===

function updateComponents(data) {
    const bg = document.getElementById('dynamic-background');
    if (bg && data.cover_url) bg.style.backgroundImage = `url('${data.cover_url}')`;

    if (window.components.albumCover) window.components.albumCover.update(data);
    if (window.components.tracklist) window.components.tracklist.update(data.tracks || []);
    if (window.components.albumInfo) window.components.albumInfo.update(data);
    if (window.components.histogram) window.components.histogram.update(data.id);

    if (window.components.mediaLinks && typeof window.components.mediaLinks.update === 'function') {
        window.components.mediaLinks.update(data.id);
    }

    if (window.components.trackRatingsTab && data.tracks) {
        window.components.trackRatingsTab.update(data.tracks, {});
    }

    if (window.initCreditsModule) window.initCreditsModule(data.id);
    if (window.renderAlbumTagsTab) window.renderAlbumTagsTab(data.id);
    if (window.SimilarLoader) {
        window.SimilarLoader.init('album', data.id, 'similar-albums-container', 'compact');
    }
}

function updateScoresDisplay(stats) {
    const userScoreEl = document.getElementById('global-album-score');
    const userRatingsCountEl = document.getElementById('global-ratings-count');
    if (!stats) return;

    const rawScore = parseFloat(stats.avg_score || stats.average_rating || 0);
    const totalRatings = parseInt(stats.ratings_count || stats.rating_count || 0);

    let displayScore = (totalRatings > 0 && !isNaN(rawScore)) ? rawScore.toFixed(2) : 'brak';

    if (userScoreEl) {
        userScoreEl.innerHTML = `${displayScore} <span style="font-size:1.5rem;color:#ADFF2F;">★</span>`;
    }
    // Teraz ten element istnieje w HTML, więc tekst się wyświetli
    if (userRatingsCountEl) {
        userRatingsCountEl.textContent = `na podstawie ${totalRatings.toLocaleString()} ocen`;
    }
}

// === 6. OBSŁUGA ZDARZEŃ (AKCJE) ===

window.rateAlbum = async (rating) => {
    const token = getToken();
    if (!token) return window.location.href = '/login.html';

    try {
        const res = await fetch(`/api/ratings/${window.currentAlbumId}/ratings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ score: rating })
        });
        if (!res.ok) throw new Error('Błąd zapisu');

        window.currentAlbumRating = rating;
        if (window.components.albumRatingStars) window.components.albumRatingStars.updateRating(rating);

        // НОВОЕ: Визуально помечаем кнопку "Przesłuchane" (listen) как активную
        const listenBtn = document.querySelector('.user-actions div[data-action="listen"]');
        if (listenBtn) {
            listenBtn.classList.add('active');
        }

        await refreshStats();
        await loadTrackScores(window.currentAlbumId);
        window.showMessage('Ocena została zapisana!');
    } catch(e) {
        window.showMessage('Błąd podczas zapisywania oceny', true);
    }
};

window.clearAlbumRating = async () => {
    const token = getToken();
    if (!token) return window.location.href = '/login.html';

    try {
        const res = await fetch(`/api/ratings/${window.currentAlbumId}/ratings`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${token}`}
        });
        if (!res.ok) throw new Error('Błąd usuwania');

        window.currentAlbumRating = 0;
        if (window.components.albumRatingStars) window.components.albumRatingStars.updateRating(0);

        await refreshStats();
        await loadTrackScores(window.currentAlbumId);
        window.showMessage('Ocena została usunięta!');
    } catch(e) {
        window.showMessage('Błąd podczas usuwania oceny', true);
    }
};

async function sendAlbumAction(actionType) {
    if (!window.currentAlbumId) return;
    const token = getToken();
    if (!token) return window.location.href = '/login.html';

    try {
        const button = document.querySelector(`.user-actions div[data-action="${actionType}"]`);
        if (!button) return;

        const isActive = button.classList.contains('active');
        const method = isActive ? 'DELETE' : 'POST';
        const url = isActive ? `/api/actions?albumId=${window.currentAlbumId}&actionType=${actionType}` : '/api/actions';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: method === 'POST' ? JSON.stringify({ albumId: window.currentAlbumId, actionType }) : null
        });

        if (!res.ok) throw new Error('Akcja nie powiodła się');
        button.classList.toggle('active');
        window.showMessage(isActive ? `Usunięto z ${actionType}` : `Dodano do ${actionType}`);
    } catch (err) {
        window.showMessage('Błąd: ' + err.message, true);
    }
}

// NOTE: Funkcja openTagWindow została przeniesiona do tag-app-modal.js
// Zapewniamy kompatybilność, jeśli tamten skrypt jest załadowany

async function checkAdminRights(slug) {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` }});
        if (!res.ok) return;
        const user = await res.json();
        const btn = document.getElementById('edit-album-btn');
        if (btn && user.role === 'admin') {
            btn.style.display = 'block';
            btn.onclick = () => window.location.href = `/edit_album.html?slug=${slug}`;
        }
    } catch(e) {}
}

// === 7. INICJALIZACJA ===

document.addEventListener('DOMContentLoaded', async () => {
    if (!document.getElementById('album-cover-container')) return;

    try {
        const slug = getSlugFromURL();
        if (!slug) throw new Error('Nie podano sluga');

        await loadBaseComponents();
        await loadChildComponents();

        const albumData = await fetchAlbum(slug);
        window.currentAlbumId = albumData.id;
        window.albumDataCache = albumData;

        updateComponents(albumData);
        updateScoresDisplay({
            avg_score: albumData.avg_score || albumData.average_rating,
            ratings_count: albumData.ratings_count || albumData.rating_count
        });

        await loadUserData(window.currentAlbumId);
        await loadTrackScores(window.currentAlbumId);
        await loadCommentsModule(window.currentAlbumId);
        checkAdminRights(slug);

    } catch (error) {
        console.error('[Błąd inicjalizacji]:', error);
    }
});

// Rejestracja globalnych funkcji
window.sendAlbumAction = sendAlbumAction;
window.rateAlbum = rateAlbum;
window.clearAlbumRating = clearAlbumRating;
// window.openTagWindow jest teraz obsługiwane przez tag-app-modal.js

// Obsługa kliknięć w akcje użytkownika
document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('.user-actions div[data-action]');
    if (actionBtn) {
        const actionType = actionBtn.dataset.action;
        if (actionType === 'add-to-list') {
            if (actionBtn.hasAttribute('onclick')) {
                return;
            }
            // Sprawdzamy czy window.openListWindow został poprawnie nadpisany przez list-app-modal.js
            if (typeof window.openListWindow === 'function') {
                window.openListWindow(window.currentAlbumId, 'album');
            } else {
                console.error("Moduł list nie został jeszcze załadowany.");
            }
        } else {
            sendAlbumAction(actionType);
        }
    }
});