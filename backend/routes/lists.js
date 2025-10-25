// frontend/js/lists.js

/**
 * Загружает HTML-компонент в указанный контейнер.
 * @param {string} containerId - ID элемента, куда будет загружен компонент.
 * @param {string} url - URL-адрес HTML-компонента.
 * @param {Function} callback - Функция, которая будет вызвана после успешной загрузки.
 */
function loadComponent(containerId, url, callback = null) {
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load component: ' + response.statusText);
            }
            return response.text();
        })
        .then(html => {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = html;
                // !!! Важно: вызываем callback только после вставки HTML
                if (callback && typeof callback === 'function') {
                    callback();
                }
            }
        })
        .catch(error => {
            console.error(`Error loading component from ${url}:`, error);
        });
}

/**
 * Отображает временное сообщение пользователю.
 * @param {string} message - Текст сообщения.
 * @param {boolean} isError - Флаг, указывающий, является ли сообщение ошибкой.
 */
function showMessage(message, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = isError ? 'global-message error' : 'global-message success';

    // Добавляем стили для отображения сообщения
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

    // Удаляем сообщение через 5 секунд
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => messageDiv.remove(), 300);
    }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    // Загрузка компонентов, таких как навбар и боковая панель
    loadComponent('navbar-container', '/components/navbar.html');
    loadComponent('filter-sidebar-container', '/components/filter_sidebar.html');

    // Загружаем списки пользователя
    loadUserLists();
});

async function loadUserLists() {
    const userListsContainer = document.getElementById('userListsContainer');
    if (!userListsContainer) return;

    userListsContainer.innerHTML = '<p>Загрузка ваших списков...</p>';

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            userListsContainer.innerHTML = '<p>Пожалуйста, войдите, чтобы просмотреть свои списки.</p>';
            return;
        }

        const response = await fetch('/api/user-lists/my-lists', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user lists.');
        }

        const lists = await response.json();
        renderLists(lists);

    } catch (error) {
        console.error('Error loading user lists:', error);
        showMessage('Ошибка загрузки списков: ' + error.message, true);
        userListsContainer.innerHTML = `<p>Ошибка загрузки списков: ${error.message}</p>`;
    }
}

function renderLists(lists) {
    const userListsContainer = document.getElementById('userListsContainer');
    userListsContainer.innerHTML = '';

    if (lists.length === 0) {
        userListsContainer.innerHTML = '<p>У вас еще нет списков.</p>';
        return;
    }

    lists.forEach(list => {
        const listCard = document.createElement('div');
        listCard.classList.add('list-card');

        listCard.innerHTML = `
            <a href="/lists/${list.slug}">
                <h2>${list.name}</h2>
                <p>${list.description || 'Нет описания'}</p>
            </a>
            <div class="list-meta">
                <span>⭐ ${list.albums_count || 0} альбомов</span>
                <span>👤 ${list.username}</span>
            </div>
        `;

        userListsContainer.appendChild(listCard);
    });
}