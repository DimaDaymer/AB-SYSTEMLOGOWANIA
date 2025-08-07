// Функция для отображения сообщений
export function showMessage(message, isError = false) {
    const existingMessages = document.querySelectorAll('.global-message');
    existingMessages.forEach(msg => msg.remove());
    const messageDiv = document.createElement('div');
    messageDiv.className = 'global-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        background: ${isError ? '#ffdddd' : '#ddffdd'};
        color: ${isError ? '#ff0000' : '#008800'};
        border: 1px solid ${isError ? '#ff0000' : '#008800'};
        border-radius: 5px;
        z-index: 1000;
        font-weight: bold;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        transition: opacity 0.3s ease;
    `;
    document.body.appendChild(messageDiv);
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => messageDiv.remove(), 300);
    }, 5000);
}

// Функция для загрузки компонентов
export async function loadComponent(containerId, componentPath) {
    try {
        const response = await fetch(componentPath);
        if (!response.ok) throw new Error(`Failed to load component: ${componentPath}`);
        const html = await response.text();
        const container = document.getElementById(containerId);
        container.innerHTML = html;
        const scripts = container.querySelectorAll('script');
        for (const script of scripts) {
            const newScript = document.createElement('script');
            if (script.src) newScript.src = script.src;
            else newScript.textContent = script.textContent;
            document.body.appendChild(newScript);
            script.remove();
        }
        return true;
    } catch (error) {
        console.error(`Error loading component ${containerId}:`, error);
        showMessage(`Error loading component: ${containerId}`, true);
        return false;
    }
}

// Функция для отображения звездного рейтинга
export function getStarDisplay(score) {
    const fullStars = Math.floor(score);
    const halfStar = score % 1 >= 0.5 ? '★' : '';
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    return '★'.repeat(fullStars) + halfStar + '☆'.repeat(emptyStars);
}

// Глобальные переменные
let currentAlbumId = null;
let albumDataCache = null;
window.components = window.components || {};

// Компонент для вкладки с рейтингами треков (новый дизайн)
window.components.ratingTab = {
    update: function(tracks, userRatings) {
        const container = document.getElementById('track-ratings-container');
        if (!container) return;

        container.innerHTML = '';

        tracks.forEach(track => {
            const trackRating = userRatings[track.id] || 0;
            let starsHtml = '';
            for (let i = 5; i >= 1; i--) {
                starsHtml += `
                    <input type="radio" id="track-${track.id}-star${i}" name="track-rating-${track.id}" value="${i}" ${trackRating === i ? 'checked' : ''}>
                    <label for="track-${track.id}-star${i}">★</label>
                `;
            }

            const trackHtml = `
                <li class="track-rating-item" data-track-id="${track.id}">
                    <div class="track-info">
                        <div class="track-title">${track.track_number}. ${track.title}</div>
                        <div class="track-duration">${track.duration || ''}</div>
                    </div>
                    <div class="track-rating">
                        <div class="track-stars">
                            ${starsHtml}
                        </div>
                        <div class="track-rating-value">${trackRating}/5</div>
                    </div>
                </li>
            `;
            container.innerHTML += trackHtml;
        });

        // Добавляем один обработчик событий на родительский контейнер
        container.addEventListener('change', async (e) => {
            const ratingInput = e.target;
            if (ratingInput.type === 'radio' && ratingInput.name.startsWith('track-rating-')) {
                const trackItem = ratingInput.closest('.track-rating-item');
                const trackId = trackItem.dataset.trackId;
                const rating = parseInt(ratingInput.value);

                // Обновляем UI
                const ratingValueEl = trackItem.querySelector('.track-rating-value');
                if (ratingValueEl) {
                    ratingValueEl.textContent = `${rating}/5`;
                }

                // Сохраняем на сервере
                await saveTrackRating(trackId, rating);
            }
        });
    }
};

// Функция для сохранения рейтинга трека
async function saveTrackRating(trackId, rating) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Please log in to rate tracks', true);
            setTimeout(() => window.location.href = '/login.html', 2000);
            return;
        }

        const res = await fetch(`/api/track-ratings/${trackId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating })
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to save track rating');
        }

        showMessage('Track rating saved!');
    } catch (err) {
        console.error('Error saving track rating:', err);
        showMessage('Error: ' + err.message, true);
    }
}

// Основная функция инициализации страницы
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadNavbar();
        await loadAllComponents();
        const slug = getSlugFromURL();
        if (!slug) return;

        albumDataCache = await fetchAlbum(slug);
        currentAlbumId = albumDataCache.id;
        window.currentAlbumId = currentAlbumId;
        window.albumDataCache = albumDataCache;

        updateComponents(albumDataCache);
        await loadUserData(currentAlbumId);
        updateScoresDisplay();

    } catch (error) {
        console.error('[Albums] Initialization error:', error);
        showMessage('Error loading page: ' + error.message, true);
    }
});

// Загрузка навбара
async function loadNavbar() {
    try {
        const response = await fetch('/navbar.html');
        const html = await response.text();
        document.getElementById('navbar-container').innerHTML = html;

        const navbarScripts = document.getElementById('navbar-container').querySelectorAll('script');
        navbarScripts.forEach(script => {
            const newScript = document.createElement('script');
            newScript.textContent = script.textContent;
            document.body.appendChild(newScript);
        });

        if (typeof initNavbar === 'function') initNavbar();
    } catch (err) {
        console.error('Failed to load navbar: ', err);
    }
}

// Получение slug из URL
function getSlugFromURL() {
    const path = window.location.pathname;
    const slug = path.substring(path.lastIndexOf('/') + 1);

    if (!slug || slug === 'album') {
        showMessage('Invalid album URL', true);
        return null;
    }

    return slug;
}

// Загрузка всех компонентов
export async function loadAllComponents() {
    const components = [
        { id: 'album-cover-container', path: '/components/albums/album-cover.html' },
        { id: 'tracklist-container', path: '/components/albums/tracklist.html' },
        { id: 'album-info-container', path: '/components/albums/album-info.html' },
        { id: 'tabs-container', path: '/components/albums/tabs-container.html' },
        { id: 'user-actions-container', path: '/components/albums/user-actions.html' },
        { id: 'album-ratings-container', path: '/components/albums/album-ratings.html' },
        { id: 'album-rating-stars-container', path: '/components/albums/album-rating-stars.html' },
        { id: 'histogram-container', path: '/components/albums/histogram.html' },
        { id: 'media-links-container', path: '/components/albums/media-links.html' }
    ];

    await Promise.all(components.map(comp => loadComponent(comp.id, comp.path)));
}

// Загрузка данных альбома
async function fetchAlbum(slug) {
    try {
        const response = await fetch(`/api/albums/by-slug/${slug}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Album not found');
        }
        return await response.json();
    } catch (error) {
        console.error('[Albums] Error fetching album:', error);
        throw error;
    }
}

// Обновление компонентов
function updateComponents(albumData) {
    const dynamicBackground = document.getElementById('dynamic-background');
    if (dynamicBackground && albumData.cover_url) {
        dynamicBackground.style.backgroundImage = `url('${albumData.cover_url}')`;
    }

    if (window.components && window.components.albumCover)
        window.components.albumCover.update(albumData);

    if (window.components && window.components.tracklist)
        window.components.tracklist.update(albumData.tracks || []);

    if (window.components && window.components.albumInfo)
        window.components.albumInfo.update(albumData);

    // Инициализация рейтинга треков
    if (window.components && window.components.ratingTab && albumData.tracks) {
        window.components.ratingTab.update(albumData.tracks, {});
    }
}

// Загрузка пользовательских данных
async function loadUserData(albumId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        await loadUserRating(albumId);
        await checkUserAction(albumId);

        if (albumDataCache?.tracks?.length > 0) {
            const userTrackRatings = await loadUserTrackRatings(albumId);
            if (window.components && window.components.ratingTab) {
                window.components.ratingTab.update(albumDataCache.tracks, userTrackRatings);
            }
        }
    } catch (error) {
        console.error('[Albums] Error loading user data:', error);
    }
}

// Загрузка пользовательского рейтинга альбома
async function loadUserRating(albumId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch(`/api/ratings/${albumId}/user-rating`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            if (res.status !== 404) throw new Error(`HTTP error! status: ${res.status}`);
            return;
        }

        const data = await res.json();
        if (data.score !== null) {
            const exactMatch = document.querySelector(`.rating-stars input[value="${data.score}"]`);
            if (exactMatch) {
                exactMatch.checked = true;
            } else {
                // Для нецелых значений
                const allStars = document.querySelectorAll('.rating-stars input');
                const ratingValue = parseFloat(data.score);

                for (const star of allStars) {
                    if (Math.abs(parseFloat(star.value) - ratingValue) < 0.3) {
                        star.checked = true;
                        break;
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error loading user rating:', err);
        showMessage('Error loading your rating', true);
    }
}

// Проверка действий пользователя
async function checkUserAction(albumId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch(`/api/actions/album/${albumId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const actions = await res.json();
            actions.forEach(action => {
                const button = document.querySelector(`.user-actions div[data-action="${action.action_type}"]`);
                if (button) button.classList.add('active');
            });
        }
    } catch (err) {
        console.error('Error checking user actions:', err);
    }
}

// Загрузка рейтингов треков пользователя
async function loadUserTrackRatings(albumId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return {};

        const res = await fetch(`/api/track-ratings/album/${albumId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const ratings = await res.json();
            return ratings.reduce((acc, rating) => {
                acc[rating.track_id] = rating.rating;
                return acc;
            }, {});
        }
        return {};
    } catch (err) {
        console.error('Error loading track ratings:', err);
        return {};
    }
}

// Обновление отображения рейтингов
function updateScoresDisplay() {
    const userScoreEl = document.querySelector('.score-block:first-of-type .score-value');
    const friendsScoreEl = document.querySelector('.score-block:last-of-type .score-value');
    const userRatingsCountEl = document.querySelector('.score-block:first-of-type .score-ratings');
    const friendsRatingsCountEl = document.querySelector('.score-block:last-of-type .score-ratings');

    const userAvgScore = 4.09;
    const userTotalRatings = 50980;
    const friendsAvgScore = 3.89;
    const friendsTotalRatings = 124;

    if (userScoreEl && userRatingsCountEl) {
        userScoreEl.innerHTML = `${userAvgScore} <span class="star-display">${getStarDisplay(userAvgScore)}</span>`;
        userRatingsCountEl.textContent = `from ${userTotalRatings.toLocaleString()} ratings`;
    }

    if (friendsScoreEl && friendsRatingsCountEl) {
        friendsScoreEl.innerHTML = `${friendsAvgScore} <span class="star-display">${getStarDisplay(friendsAvgScore)}</span>`;
        friendsRatingsCountEl.textContent = `from ${friendsTotalRatings.toLocaleString()} ratings`;
    }

    const histogramData = [
        { score: 5, count: 25832, percentage: 70 },
        { score: 4.5, count: 20000, percentage: 80 },
        { score: 4, count: 15498, percentage: 60 },
        { score: 3.5, count: 10200, percentage: 40 },
        { score: 3, count: 6234, percentage: 35 },
        { score: 2.5, count: 5000, percentage: 25 },
        { score: 2, count: 3000, percentage: 15 },
        { score: 1.5, count: 2000, percentage: 10 },
        { score: 1, count: 1000, percentage: 5 },
        { score: 0.5, count: 500, percentage: 2 }
    ];

    if (window.components && window.components.histogram)
        window.components.histogram.update(histogramData);
}

// Сохранение рейтинга альбома
async function rateAlbum(rating) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Please log in to rate albums', true);
            setTimeout(() => window.location.href = '/login.html', 2000);
            return;
        }

        const res = await fetch(`/api/ratings/${currentAlbumId}/ratings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ score: rating })
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Rating failed');
        }

        showMessage('Rating submitted successfully!');
        await loadUserRating(currentAlbumId);
    } catch (err) {
        console.error('Rating error:', err);
        showMessage('Error submitting rating: ' + err.message, true);
    }
}

// Обработчик оценки альбома
document.addEventListener('click', async (e) => {
    if (e.target.closest('.rating-stars')) {
        const ratingInput = e.target.closest('input') ||
            (e.target.tagName === 'LABEL' ? document.getElementById(e.target.htmlFor) : null);

        if (!ratingInput || !currentAlbumId) return;

        const rating = parseFloat(ratingInput.value);
        await rateAlbum(rating);
    }
});

// Отправка действия пользователя
async function sendAlbumAction(actionType) {
    if (!currentAlbumId) return;

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Please log in to perform this action', true);
            setTimeout(() => window.location.href = '/login.html', 2000);
            return;
        }

        const button = document.querySelector(`.user-actions div[data-action="${actionType}"]`);
        if (!button) return;

        const isActive = button.classList.contains('active');
        const method = isActive ? 'DELETE' : 'POST';
        const url = isActive ?
            `/api/actions?albumId=${currentAlbumId}&actionType=${actionType}` :
            '/api/actions';

        const res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: method === 'POST' ?
                JSON.stringify({ albumId: currentAlbumId, actionType }) :
                null
        });

        if (!res.ok) throw new Error('Action failed');

        button.classList.toggle('active');
        showMessage(isActive ?
            `Removed from ${actionType}` :
            `Added to ${actionType}`);
    } catch (err) {
        console.error('Action error:', err);
        showMessage('Error: ' + err.message, true);
    }
}

// Обработчик действий пользователя
document.addEventListener('click', async (e) => {
    if (e.target.closest('.user-actions div[data-action]')) {
        const button = e.target.closest('.user-actions div[data-action]');
        const actionType = button.dataset.action;
        await sendAlbumAction(actionType);
    }
});

// Глобальные переменные
window.sendAlbumAction = sendAlbumAction;
window.rateAlbum = rateAlbum;
window.currentAlbumId = currentAlbumId;
window.albumDataCache = albumDataCache;
window.getStarDisplay = getStarDisplay;