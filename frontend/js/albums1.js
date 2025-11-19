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
// Добавляем функцию в глобальный объект window
window.showMessage = showMessage;

// Функция для загрузки компонентов
export async function loadComponent(containerId, componentPath) {
    try {
        const response = await fetch(componentPath);
        if (!response.ok) throw new Error(`Failed to load component: ${componentPath}`);
        const html = await response.text();
        const container = document.getElementById(containerId);
        if (!container) throw new Error(`Container with ID '${containerId}' not found.`);
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
        console.error(`Error loading component ${containerId}:`, error);
        showMessage(`Error loading component: ${containerId}`, true);
        return false;
    }
}
// Добавляем функцию в глобальный объект window
window.loadComponent = loadComponent;

// Глобальные переменные
let currentAlbumId = null;
let albumDataCache = null;
window.components = window.components || {};

// НОВАЯ ФУНКЦИЯ: Проверка роли пользователя
async function checkUserRole() {
    const token = localStorage.getItem('token');
    if (!token) return null; // Пользователь не авторизован

    try {
        const response = await fetch('/api/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            // Ошибка авторизации, неверный токен или ошибка сервера
            // Если сервер возвращает HTML, то ошибка произойдет здесь:
            if (response.headers.get('content-type')?.includes('text/html')) {
                // Тут мы могли бы явно прочитать HTML для отладки, но для продакшна просто возвращаем null
            }
            return null;
        }

        const userData = await response.json(); // <-- СТРОКА, ГДЕ ВЫПАДАЕТ ОШИБКА, ЕСЛИ СЕРВЕР ОТВЕТИЛ HTML
        return userData.role; // Вернет 'admin', 'user' или что-то другое
    } catch (err) {
        console.error('Error fetching user role:', err);
        return null;
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
        window.currentAlbumId = currentAlbumId; // 💡 Устанавливаем глобальный ID здесь
        window.albumDataCache = albumDataCache;

        updateComponents(albumDataCache);
        await loadUserData(currentAlbumId);
        updateScoresDisplay();

        // *** ИЗМЕНЕНИЕ: Проверка роли администратора и отображение кнопки ***
        const userRole = await checkUserRole();
        const editAlbumBtn = document.getElementById('edit-album-btn');

        console.log('User Role Check Result:', userRole);

        if (editAlbumBtn) {
            // Кнопка уже скрыта в HTML, но здесь гарантируем ее статус
            editAlbumBtn.style.display = 'none';

            if (userRole === 'admin') {
                editAlbumBtn.style.display = 'block'; // Показываем кнопку только для админа
                editAlbumBtn.addEventListener('click', () => {
                    const slug = getSlugFromURL();
                    if (slug) {
                        window.location.href = `/edit_album.html?slug=${slug}`;
                    } else {
                        showMessage('Album slug not found', true);
                    }
                });
            }
        }
        // *** КОНЕЦ ИЗМЕНЕНИЯ ***

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
        const navbarContainer = document.getElementById('navbar-container');
        if (!navbarContainer) return;
        navbarContainer.innerHTML = html;

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
        { id: 'album-rating-tab-container', path: '/components/albums/album-rating-tab.html'},
        { id: 'track-ratings-tab-container', path: '/components/albums/track-ratings-tab.html'},
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

    if (window.components && window.components.trackRatingsTab && albumData.tracks) {
        window.components.trackRatingsTab.update(albumData.tracks, {});
    }

    if (window.components && window.components.albumRatingTab) {
        window.components.albumRatingTab.init(albumData.tracks);
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
            if (window.components && window.components.trackRatingsTab) {
                window.components.trackRatingsTab.update(albumDataCache.tracks, userTrackRatings);
            }
        }
    } catch (error) {
        console.error('[Albums] Error loading user data:', error);
    }
}

async function loadUserRating(albumId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch(`/api/ratings/${albumId}/user-rating`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            if (res.status !== 404) return;
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        if (data.score !== null) {
            const exactMatch = document.querySelector(`.rating-stars input[value="${data.score}"]`);
            if (exactMatch) {
                exactMatch.checked = true;
                exactMatch.dispatchEvent(new Event('change')); // Add this line
            } else {
                const allStars = document.querySelectorAll('.rating-stars input');
                const ratingValue = parseFloat(data.score);

                for (const star of allStars) {
                    if (Math.abs(parseFloat(star.value) - ratingValue) < 0.3) {
                        star.checked = true;
                        star.dispatchEvent(new Event('change')); // Add this line
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

async function checkUserAction(albumId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch(`/api/actions/album/${albumId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const actions = await res.json();
            // Corrected logic to handle object instead of array
            if (actions) {
                for (const actionType in actions) {
                    if (actions[actionType]) {
                        const button = document.querySelector(`.user-actions div[data-action="${actionType}"]`);
                        if (button) button.classList.add('active');
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error checking user actions:', err);
    }
}

async function loadUserTrackRatings(albumId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) return {};

        const res = await fetch(`/api/track-ratings/album/${albumId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const ratings = await res.json();
            return ratings;
        }
        return {};
    } catch (err) {
        console.error('Error loading track ratings:', err);
        return {};
    }
}

function updateScoresDisplay() {
    const userScoreEl = document.querySelector('.score-block:first-of-type .score-value');
    const userRatingsCountEl = document.querySelector('.score-block:first-of-type .score-ratings');

    const userAvgScore = 8.1;
    const userTotalRatings = 50980;

    if (userScoreEl && userRatingsCountEl) {
        userScoreEl.innerHTML = `${userAvgScore} <span class="star-display"></span>`;
        userRatingsCountEl.textContent = `from ${userTotalRatings.toLocaleString()} ratings`;
    }
}

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

document.addEventListener('click', async (e) => {
    // ВНИМАНИЕ: ЭТОТ ОБРАБОТЧИК БОЛЬШЕ НЕ НУЖЕН ДЛЯ КНОПКИ "ADD TO LIST"
    // ПОСКОЛЬКУ МЫ ИСПОЛЬЗУЕМ ONCLICK НАПРЯМУЮ В HTML
    if (e.target.closest('.user-actions div[data-action]')) {
        const button = e.target.closest('.user-actions div[data-action]');
        const actionType = button.dataset.action;
        // Проверяем, если это не кнопка "Add to list", то выполняем sendAlbumAction
        if (actionType !== 'add-to-list') {
            await sendAlbumAction(actionType);
        }
    }
});

// Реализация debounce для оптимизации поиска
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
// 💡 Новая, исправленная функция для открытия окна списка
async function openListWindow() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Please log in to add to a list', true);
            setTimeout(() => window.location.href = '/login.html', 2000);
            return;
        }

        // 1. Загружаем HTML-код модального окна
        const response = await fetch('/list_window.html');
        if (!response.ok) {
            throw new Error('Failed to load list window component.');
        }
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 2. Извлекаем и добавляем стили
        const styleElement = doc.querySelector('style');
        if (styleElement) {
            const head = document.head || document.getElementsByTagName('head')[0];
            const existingStyle = head.querySelector('#list-window-styles');
            if (!existingStyle) {
                const newStyle = document.createElement('style');
                newStyle.id = 'list-window-styles';
                newStyle.textContent = styleElement.textContent;
                head.appendChild(newStyle);
            }
        }

        // 3. Извлекаем и добавляем оверлей
        const overlay = doc.querySelector('.overlay');
        if (!overlay) {
            throw new Error('Could not find .overlay element in list_window.html');
        }

        let existingOverlay = document.getElementById('list-overlay');
        if (!existingOverlay) {
            overlay.id = 'list-overlay';
            document.body.appendChild(overlay);
        } else {
            existingOverlay.innerHTML = overlay.innerHTML;
        }

        // 4. Извлекаем и исполняем скрипты
        const scripts = doc.querySelectorAll('script');
        let scriptPromises = [];
        scripts.forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.textContent;
            }
            document.body.appendChild(newScript);
        });

        // Добавленная задержка для гарантированной загрузки скриптов
        await new Promise(resolve => setTimeout(resolve, 50));

        // 5. Отображаем оверлей и предотвращаем прокрутку
        const targetOverlay = document.getElementById('list-overlay');
        if (targetOverlay) {
            targetOverlay.style.display = 'flex';
            document.body.classList.add('no-scroll');

            // Вызываем функции инициализации только после того, как скрипты гарантированно загружены
            // Используем window.loadUserLists и window.setupTabSwitching, чтобы быть уверенными, что функции доступны
            if (window.loadUserLists) window.loadUserLists();
            if (window.setupTabSwitching) window.setupTabSwitching();
        }
    } catch (err) {
        console.error('Error opening list window:', err);
        showMessage('Error opening list window: ' + err.message, true);
    }
}

// Добавляем функцию в глобальный объект window для доступа из HTML
window.openListWindow = openListWindow;
window.sendAlbumAction = sendAlbumAction;
window.rateAlbum = rateAlbum;
window.currentAlbumId = currentAlbumId;
window.albumDataCache = albumDataCache;