// lists1.js — управление списками

// Глобальная переменная для хранения albumId
let currentAlbumId = null;

// Показываем сообщение (для теста — alert)
function showMessage(message, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = isError ? 'global-message error' : 'global-message success';

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

// ----------------------------------------------------
// Функции для управления модальным окном и его вкладками
// ----------------------------------------------------

function closeListWindow() {
    const overlay = document.getElementById('list-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }
}

// NEW: Функция для открытия модального окна и загрузки списков
// Эту функцию удаляем, так как она будет дублировать логику из albums1.js
/*
function openListWindow(albumId) {
    const overlay = document.getElementById('list-overlay');
    if (overlay) {
        window.currentAlbumId = albumId; // Сохраняем ID альбома для использования
        overlay.style.display = 'flex';
        document.body.classList.add('no-scroll');
        loadUserLists(); // Загружаем списки только при открытии окна
        setupTabSwitching(); // Настраиваем переключение вкладок
    }
}
*/

// Функция для обработки переключения вкладок
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.list-tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;

            // Скрываем все вкладки
            document.querySelectorAll('.list-tab-content').forEach(content => {
                content.style.display = 'none';
            });

            // Деактивируем все кнопки
            tabButtons.forEach(btn => btn.classList.remove('active'));

            // Показываем целевую вкладку и активируем кнопку
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.style.display = 'block';
                button.classList.add('active');
            }
        });
    });
}

// ----------------------------------------------------
// lists_page.html — все списки пользователя
// ----------------------------------------------------

async function loadLists() {
    const container = document.getElementById('listCardsContainer');
    if (!container) return;

    container.innerHTML = '<p>Загрузка списков...</p>';
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            container.innerHTML = '<p>Пожалуйста, войдите, чтобы просмотреть свои списки.</p>';
            return;
        }

        const response = await fetch('/api/user-lists/my-lists', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                container.innerHTML = '<p>Ваша сессия истекла. Пожалуйста, войдите снова.</p>';
                setTimeout(() => window.location.href = '/login.html', 2000);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const lists = await response.json();
        renderLists(lists);
    } catch (error) {
        console.error('Ошибка загрузки списков:', error);
        container.innerHTML = '<p>Не удалось загрузить списки. Пожалуйста, попробуйте позже.</p>';
    }
}

function renderLists(lists) {
    const container = document.getElementById('listCardsContainer');
    container.innerHTML = '';

    if (lists.length === 0) {
        container.innerHTML = '<p>У вас пока нет списков. Создайте свой первый список!</p>';
        return;
    }

    lists.forEach(list => {
        const card = document.createElement('a');
        card.href = `/list/${list.slug}`;
        card.classList.add('list-card');
        card.innerHTML = `
            <img src="https://via.placeholder.com/400x250.png?text=List+Image" alt="List Image" class="list-image">
            <div class="list-content">
                <h2 class="list-name">${list.name}</h2>
                <p class="list-username">Создатель: ${list.username}</p>
                <p class="list-items-count">${list.albums_count} ${list.albums_count === 1 ? 'альбом' : 'альбомов'}</p>
                <div class="list-meta">
                    <span class="list-date">Создан: ${new Date(list.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// ----------------------------------------------------
// list_window.html — модальное окно
// ----------------------------------------------------

async function saveNewList() {
    const listName = document.getElementById('list-name').value.trim();
    const listDescription = document.getElementById('list-description').value.trim();

    if (!listName) {
        showMessage('Пожалуйста, введите название списка.', true);
        return;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Пожалуйста, войдите, чтобы создать список.', true);
            return;
        }

        const response = await fetch('/api/user-lists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: listName, description: listDescription })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Ошибка создания списка');

        showMessage('Новый список успешно создан.');

        if (window.currentAlbumId && result.listId) {
            await addAlbumToList(result.listId);
        }

        closeListWindow();
    } catch (error) {
        console.error('Ошибка создания списка:', error);
        showMessage('Ошибка: ' + error.message, true);
    }
}

async function loadUserLists() {
    const container = document.getElementById('lists-container');
    const newForm = document.getElementById('new-list-form');
    const existingListsSection = document.getElementById('existing-lists');

    // Получаем кнопки вкладок
    const existingListsButton = document.querySelector('.list-tab-button[data-target="existing-lists"]');
    const newFormButton = document.querySelector('.list-tab-button[data-target="new-list-form"]');

    // Сбрасываем видимость секций перед загрузкой
    if (existingListsSection) existingListsSection.style.display = 'none';
    if (newForm) newForm.style.display = 'none';

    // Показываем индикатор загрузки
    if (container) {
        container.innerHTML = '<p>Загрузка ваших списков...</p>';
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            if (newForm) newForm.style.display = 'block';
            if (newFormButton) newFormButton.classList.add('active');
            if (existingListsButton) existingListsButton.classList.remove('active');
            if (container) container.innerHTML = '<p>Пожалуйста, войдите, чтобы просмотреть свои списки.</p>';
            return;
        }

        const response = await fetch('/api/user-lists/my-lists', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Не удалось загрузить списки');
        }

        const lists = await response.json();

        if (lists.length > 0) {
            if (existingListsSection) existingListsSection.style.display = 'block';
            if (existingListsButton) {
                existingListsButton.classList.add('active');
                newFormButton.classList.remove('active');
            }
            if (container) {
                container.innerHTML = '';
                lists.forEach(list => {
                    const div = document.createElement('div');
                    div.className = 'list-item';
                    div.textContent = `${list.name} (${list.albums_count} альбомов)`;
                    div.dataset.listId = list.id;
                    div.onclick = () => {
                        document.querySelectorAll('.list-item').forEach(item => item.classList.remove('selected'));
                        div.classList.add('selected');
                    };
                    container.appendChild(div);
                });
            }
        } else {
            if (newForm) newForm.style.display = 'block';
            if (newFormButton) {
                newFormButton.classList.add('active');
                existingListsButton.classList.remove('active');
            }
            if (container) {
                container.innerHTML = '<p>У вас пока нет списков. Создайте свой первый список!</p>';
            }
        }
    } catch (error) {
        console.error('Error loading user lists:', error);
        showMessage('Не удалось загрузить ваши списки. Вы можете создать новый.', true);
        if (newForm) newForm.style.display = 'block';
        if (existingListsSection) existingListsSection.style.display = 'none';
    }
}

async function addAlbumToList(listId = null) {
    let targetListId;

    if (listId) {
        targetListId = listId;
    } else {
        const selectedItem = document.querySelector('.list-item.selected');
        if (!selectedItem) {
            showMessage('Пожалуйста, выберите список для добавления.', true);
            return;
        }
        targetListId = selectedItem.dataset.listId;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Пожалуйста, войдите, чтобы добавить альбом.', true);
            return;
        }

        if (!window.currentAlbumId) {
            showMessage('Ошибка: ID альбома не найден.', true);
            return;
        }

        const response = await fetch(`/api/user-lists/${targetListId}/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ albumId: window.currentAlbumId })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Ошибка добавления альбома');

        showMessage('Альбом успешно добавлен в список.');
        closeListWindow();

        if (window.location.pathname.startsWith('/list/')) {
            const listSlug = window.location.pathname.split('/').pop();
            if (listSlug) {
                await loadListDetails(listSlug);
            }
        }
    } catch (error) {
        console.error('Ошибка добавления альбома в список:', error);
        showMessage('Ошибка: ' + error.message, true);
    }
}

// ----------------------------------------------------
// list.html — отдельный список
// ----------------------------------------------------

async function loadListDetails(listSlug) {
    const listNameElem = document.querySelector('.list-header h1');
    const listMetaElem = document.querySelector('.list-header p');
    const albumListContainer = document.querySelector('.album-list-container');
    const sortBy = document.getElementById('sort-by')?.value || 'added_desc';

    if (!listNameElem || !albumListContainer) return;

    listNameElem.textContent = 'Загрузка...';
    listMetaElem.textContent = '';
    albumListContainer.innerHTML = '<p>Загрузка альбомов...</p>';

    try {
        const response = await fetch(`/api/user-lists/${listSlug}?sortBy=${sortBy}`);
        if (!response.ok) {
            if (response.status === 404) {
                listNameElem.textContent = 'Список не найден';
                albumListContainer.innerHTML = '<p>Запрошенный список не существует или был удален.</p>';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const listData = await response.json();

        listNameElem.textContent = listData.name;
        listMetaElem.innerHTML = `Автор списка: ${listData.creator} &bull; Дата создания: ${new Date(listData.created_at).toLocaleDateString()}`;

        renderAlbums(listData.albums, albumListContainer);
    } catch (error) {
        console.error('Ошибка загрузки списка:', error);
        listNameElem.textContent = 'Ошибка';
        listMetaElem.textContent = '';
        albumListContainer.innerHTML = '<p>Не удалось загрузить содержимое списка. Пожалуйста, попробуйте позже.</p>';
    }
}

// ----------------------------------------------------
// Функции для отображения альбомов и управления действиями
// ----------------------------------------------------

function renderAlbums(albums, container) {
    container.innerHTML = '';
    if (albums.length === 0) {
        container.innerHTML = '<p>В этом списке пока нет альбомов.</p>';
        return;
    }

    albums.forEach(album => {
        const albumCard = document.createElement('div');
        albumCard.classList.add('album-card');
        albumCard.dataset.albumId = album.id; // Добавляем data-атрибут для идентификации
        const albumUrl = `/release/album/${album.slug}`;
        const releaseYear = album.release_date ?
            new Date(album.release_date).getFullYear() :
            (album.release_year || 'N/A');
        const rating = "N/A"; // Изначально ставим "N/A"
        albumCard.innerHTML = `
                <a href="${albumUrl}">
                    ${album.cover_url ?
            `<img src="${album.cover_url}" alt="${album.title} cover">` :
            '<img src="https://via.placeholder.com/80" alt="Placeholder cover">'}
                    <div class="album-details">
                        <h2>${album.title}</h2>
                        <p><strong>Artist:</strong> ${album.artist}</p>
                        <p><strong>Year:</strong> ${releaseYear}</p>
                        <p><strong>Genres:</strong> ${album.genres || 'N/A'}</p>
                        <p><strong>Descriptors:</strong> ${album.description || 'N/A'}</p>
                        <div class="rating-info">
                            <span class="score">${rating}</span>
                            <span>❤️ ${album.likes?.toLocaleString() || 0}</span>
                            <span>⭐ ${album.wishlist_count?.toLocaleString() || 0}</span>
                            <span>📜 ${album.in_lists_count?.toLocaleString() || 0}</span>
                            <span>💬 ${album.reviews_count?.toLocaleString() || 0}</span>
                        </div>
                        <div class="album-actions">
                            <button class="action-button" data-album-id="${album.id}" data-action="listen">🎧 Listen</button>
                            <button class="action-button" data-album-id="${album.id}" data-action="like">❤️ Like</button>
                            <button class="action-button" data-album-id="${album.id}" data-action="wishlist">⭐ Wishlist</button>
                            <button class="action-button" data-album-id="${album.id}" data-action="add-to-list">➕ List</button>
                        </div>
                    </div>
                </a>
            `;
        container.appendChild(albumCard);
    });

    document.querySelectorAll('.action-button').forEach(button => {
        button.addEventListener('click', handleAlbumAction);
    });
    checkUserActions();
    fetchAndRenderRatings(albums); // 💡 НОВАЯ ФУНКЦИЯ ДЛЯ ЗАГРУЗКИ РЕЙТИНГОВ
}

// 💡 НОВАЯ ФУНКЦИЯ: Загрузка рейтингов для каждого альбома
async function fetchAndRenderRatings(albums) {
    for (const album of albums) {
        try {
            const res = await fetch(`/api/ratings/album/${album.id}/stats`);
            if (!res.ok) throw new Error('Failed to fetch album stats');
            const stats = await res.json();
            const rating = stats.average_score ? parseFloat(stats.average_score).toFixed(2) : "N/A";

            // Находим нужный элемент и обновляем его
            const albumCard = document.querySelector(`.album-card[data-album-id="${album.id}"]`);
            if (albumCard) {
                const scoreElement = albumCard.querySelector('.score');
                if (scoreElement) {
                    scoreElement.textContent = rating;
                }
            }
        } catch (error) {
            console.error(`Ошибка загрузки рейтинга для альбома ${album.id}:`, error);
        }
    }
}

// Эта функция была скопирована из new_releases.html
async function handleAlbumAction(e) {
    e.preventDefault();
    const button = e.target.closest('.action-button');
    if (!button) return;
    const albumId = button.dataset.albumId;
    const actionType = button.dataset.action;

    if (actionType === 'add-to-list') {
        // Меняем вызов на глобальную функцию из albums1.js
        window.openListWindow(albumId);
        return;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Please log in to perform this action', true);
            setTimeout(() => window.location.href = '/login.html', 2000);
            return;
        }
        const isActive = button.classList.contains('active');
        const method = isActive ? 'DELETE' : 'POST';
        const url = isActive
            ? `/api/actions?albumId=${albumId}&actionType=${actionType}`
            : '/api/actions';
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: method === 'POST'
                ? JSON.stringify({ albumId, actionType })
                : null
        });
        if (!res.ok) throw new Error('Action failed');
        button.classList.toggle('active');
        showMessage(isActive
            ? `Removed from ${actionType}`
            : `Added to ${actionType}`);
    } catch (error) {
        console.error('Action error:', error);
        showMessage('Error: ' + error.message, true);
    }
}

// Эта функция была скопирована из new_releases.html
async function checkUserActions() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch('/api/actions/all', {
            headers: {'Authorization': `Bearer ${token}`}
        });
        if (!res.ok) throw new Error('Failed to get actions');
        const actions = await res.json();
        actions.forEach(action => {
            const button = document.querySelector(
                `.action-button[data-album-id="${action.id}"][data-action="${action.action_type}"]`
            );
            if (button) button.classList.add('active');
        });
    } catch (error) {
        console.error('Error checking user actions:', error);
    }
}

// ----------------------------------------------------
// Главный обработчик событий
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Определяем, какая страница загружена
    if (window.location.pathname.startsWith('/list/')) {
        const listSlug = window.location.pathname.split('/').pop();
        if (listSlug) {
            loadListDetails(listSlug);
            const sortBySelect = document.getElementById('sort-by');
            if (sortBySelect) {
                sortBySelect.addEventListener('change', () => loadListDetails(listSlug));
            }
        }
    } else if (document.getElementById('listCardsContainer')) {
        loadLists();
    }
});