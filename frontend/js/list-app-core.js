// frontend/js/list-app-core.js

const ListApp = {
    // === ОБЩИЙ СТЭЙТ ===
    state: {
        currentAlbumId: null, // ID альбома для модального окна добавления
        currentListSlug: null, // Slug текущего списка (для list.html)
        currentUser: null,
        listId: null, // ID списка (для list.html)
        isOwner: false, // Флаг владельца (для list.html)
        isOrderModified: false, // Флаг для ручной сортировки (для list.html)
        currentSortMethod: 'added_desc', // Текущий метод сортировки (для list.html)
    },

    // === УТИЛИТЫ ===
    utils: {
        getCurrentUser() {
            const token = localStorage.getItem('token');
            if (!token) return null;
            try {
                // Декодирование JWT
                return JSON.parse(atob(token.split('.')[1]));
            } catch (e) {
                return null;
            }
        },

        async fetchAPI(url, options = {}) {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json', ...options.headers };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(url, { ...options, headers });

            // Обработка ошибок (не response.ok)
            if (!response.ok) {
                const isJson = response.headers.get('content-type')?.includes('application/json');
                let data;

                try {
                    data = await (isJson ? response.json() : response.text());
                } catch(e) {
                    data = `Ошибка чтения ответа от сервера. Статус: ${response.status}`;
                }

                if (response.status === 401) localStorage.removeItem('token');

                const errorMessage = isJson ? (data.error || data.message || `Ошибка ${response.status}`) : `Ошибка API: ${response.status} ${response.statusText}`;

                throw new Error(errorMessage);
            }

            return response.json();
        },

        toast(msg, type = 'success') {
            const existing = document.querySelectorAll('.global-message');
            existing.forEach(el => el.remove());

            const div = document.createElement('div');
            div.textContent = msg;
            div.className = `global-message ${type === 'error' ? 'error' : 'success'}`;
            div.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                padding: 12px 24px; border-radius: 8px; color: ${type === 'error' ? '#ff4d4d' : '#2ecc71'};
                background: ${type === 'error' ? '#330000' : '#002200'};
                border: 1px solid currentColor; font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 9999;
            `;
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 4000);
        }
    }
};

// Экспортируем ListApp, чтобы другие модули могли его расширить
window.ListApp = ListApp;