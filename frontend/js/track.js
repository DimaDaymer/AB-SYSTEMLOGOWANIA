window.components = window.components || {};
window.currentTrackId = null;
window.trackDataCache = null;
window.currentTrackRating = 0;

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
        console.warn(`[Komponent] Nie udało się заładować ${componentPath}:`, error);
        return false;
    }
}

function getSlugFromURL() {
    const path = window.location.pathname;
    const parts = path.split('/');
    const slug = parts.pop() || parts.pop();
    return (slug && slug !== 'track') ? slug : null;
}

function getToken() {
    return localStorage.getItem('token');
}

async function loadBaseComponents() {
    const baseComponents = [
        { id: 'album-cover-container', path: '/components/albums/album-cover.html' },
        { id: 'tracklist-container', path: '/components/albums/tracklist.html' },
        { id: 'track-info-container', path: '/components/tracks/track-info.html' },
        { id: 'track-star-rating-host', path: '/components/tracks/track-rating-stars.html' },
        { id: 'media-links-container', path: '/components/albums/media-links.html' },
        { id: 'histogram-container', path: '/components/albums/histogram.html' }
    ];
    await Promise.all(baseComponents.map(c => loadComponent(c.id, c.path)));
}

async function loadEntityListsModule() {
    const container = document.getElementById('track-lists-module-container');
    if (container) {
        await loadComponent('track-lists-module-container', '/components/lists/entity-lists.html');
    }
}

async function loadCommentsModule(trackId) {
    try {
        const commentRes = await fetch('/components/comment-box.html');
        if (commentRes.ok) {
            const container = document.getElementById('comments-module-container');
            if (container) {
                container.innerHTML = await commentRes.text();
                if (window.CommentsCore) {
                    new window.CommentsCore({
                        mode: 'TRACK',
                        entityId: trackId,
                        containerId: 'comments-system-root'
                    });
                }
            }
        }
    } catch (e) {
        console.error("Błąd ładowania modułu komentarzy:", e);
    }
}

async function fetchTrack(slug) {
    const response = await fetch(`/api/tracks/${slug}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Nie znaleziono utworu' }));
        throw new Error(errorData.message || `Status: ${response.status}`);
    }
    return await response.json();
}

async function loadTrackUserData(trackId) {
    const token = getToken();
    if (!token) return;

    try {
        const res = await fetch(`/api/track-ratings/${trackId}/user-rating`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.score !== null) {
                window.currentTrackRating = parseFloat(data.score);
                if (window.components.trackRatingStars) {
                    window.components.trackRatingStars.updateRating(window.currentTrackRating);
                }
            }
        }
    } catch (e) { console.error("Błąd ładowania oceny użytkownika:", e); }
}

async function refreshStats() {
    if (!window.currentTrackId) return;
    try {
        const res = await fetch(`/api/track-ratings/${window.currentTrackId}/stats`);
        if (res.ok) {
            const stats = await res.json();
            updateScoresDisplay(stats);
            if (window.components.histogram) {
                window.components.histogram.update(window.currentTrackId, 'track');
            }
        }
    } catch (e) { console.error("Nie udało się odświeżyć statystyk:", e); }
}

function updateComponents(data) {
    const bg = document.getElementById('dynamic-background');
    const coverUrl = data.album ? data.album.cover_url : data.cover_url;
    if (bg && coverUrl) bg.style.backgroundImage = `url('${coverUrl}')`;

    if (window.components.albumCover) window.components.albumCover.update(data.album || data);

    if (window.components.tracklist && data.album && data.album.tracks) {
        window.components.tracklist.update(data.album.tracks, data.id);
    }

    if (window.components.trackInfo) window.components.trackInfo.update(data);

    if (window.components.histogram) {
        window.components.histogram.update(data.id, 'track');
    }

    if (window.components.mediaLinks) {
        try {
            window.components.mediaLinks.update(data.album ? data.album.id : null, 'track');
        } catch (e) { console.warn("Aktualizacja linków mediów nie powiodła się:", e); }
    }

    if (window.SimilarLoader) {
        window.SimilarLoader.init('track', data.id, 'similar-tracks-container', 'compact');
    }
}

function updateScoresDisplay(stats) {
    const scoreEl = document.getElementById('global-track-score');
    const countEl = document.getElementById('global-ratings-count');
    if (!stats) return;

    const avg = parseFloat(stats.avg_score);
    const count = stats.ratings_count || 0;

    if (scoreEl) {
        scoreEl.textContent = (!isNaN(avg) && avg > 0) ? avg.toFixed(2) : 'N/A';
    }
    if (countEl) {
        countEl.textContent = `na podstawie ${count.toLocaleString()} ocen${count === 1 ? 'y' : ''}`;
    }
}

window.rateTrack = async (rating) => {
    const token = getToken();
    if (!token) {
        if (typeof showMessage === 'function') showMessage('Musisz być zalogowany, aby oceniać.', true);
        return;
    }

    try {
        const response = await fetch(`/api/track-ratings/${window.currentTrackId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ rating: rating })
        });
        if (!response.ok) throw new Error('Nie udało się zapisać oceny.');

        window.currentTrackRating = rating;
        if (window.components.trackRatingStars) window.components.trackRatingStars.updateRating(rating);

        if (typeof showMessage === 'function') showMessage(`Ocena ustawiona na ${rating.toFixed(1)}!`);
        refreshStats();
    } catch (e) {
        if (typeof showMessage === 'function') showMessage(e.message, true);
    }
};

window.clearTrackRating = async () => {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`/api/track-ratings/${window.currentTrackId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Nie udało się usunąć oceny.');

        window.currentTrackRating = 0;
        if (window.components.trackRatingStars) window.components.trackRatingStars.updateRating(0);

        if (typeof showMessage === 'function') showMessage('Ocena usunięta!');
        refreshStats();
    } catch (e) {
        if (typeof showMessage === 'function') showMessage(e.message, true);
    }
};

function setupListButton(trackId) {
    const btn = document.getElementById('add-track-to-list-btn');
    if (!btn) return;
    btn.onclick = () => {
        if (window.openListWindow) window.openListWindow(trackId, 'track');
        else if (typeof showMessage === 'function') showMessage('Moduł list nie został załadowany.', true);
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    const slug = getSlugFromURL();
    if (!slug) {
        const cont = document.getElementById('track-info-container');
        if (cont) cont.innerHTML = '<h1 style="color:red">Błąd: Brak sluga utworu.</h1>';
        return;
    }

    try {
        const trackData = await fetchTrack(slug);
        window.currentTrackId = trackData.id;
        window.trackDataCache = trackData;

        await loadBaseComponents();

        updateComponents(trackData);
        setupListButton(window.currentTrackId);

        updateScoresDisplay({
            avg_score: trackData.avg_score,
            ratings_count: trackData.ratings_count
        });

        await loadTrackUserData(window.currentTrackId);

        // Inicjalizacja modułu list i komentarzy
        await loadEntityListsModule();
        await loadCommentsModule(window.currentTrackId);

        if (trackData.avg_score === undefined) refreshStats();

    } catch (error) {
        console.error('[Błąd inicjalizacji utworu]:', error);
        const cont = document.getElementById('track-info-container');
        if (cont) cont.innerHTML = `<h1 style="color:red; padding:20px;">Błąd: ${error.message}</h1>`;
    }
});