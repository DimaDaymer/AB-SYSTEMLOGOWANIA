document.addEventListener('DOMContentLoaded', async () => {
    // === 1. ОПРЕДЕЛЕНИЕ КОНТЕКСТА ===
    const path = window.location.pathname;
    const isPublicProfile = path.startsWith('/user/');
    const publicUsername = isPublicProfile ? path.split('/')[2] : null;
    const token = localStorage.getItem('token');

    // Глобальный контекст, доступный внутри HTML-компонентов
    window.profileContext = {
        isPublic: isPublicProfile,
        username: publicUsername,
        token: token,
        // Хелпер для получения правильного URL API
        // Хелпер для получения правильного URL API
        getApiUrl: (endpoint) => {
            if (isPublicProfile) {
                // Для публичного профиля (друга): /api/users/<username>/<endpoint>
                const separator = endpoint ? '/' : '';
                return `/api/users/${publicUsername}${separator}${endpoint}`;
            } else {
                // Для "своих" данных (страница /profile)

                // !!! ИСПРАВЛЕНИЕ: СВОИ СПИСКИ !!!
                if (endpoint === 'lists') {
                    return '/api/user-lists/my-lists'; // Используем правильный роут из userLists.js
                }

                // Обрабатываем пустую строку ('') или 'profile' для основного профиля
                if (endpoint === '' || endpoint === 'profile') return '/api/users/me';
                if (endpoint === 'my-tags') return '/api/tags/my-tags';

                // Остальные роуты для себя
                return `/api/users/${endpoint}`;
            }
        },
        // Хелпер для Actions (listen, like, wishlist)
        getActionUrl: (type) => {
            if (isPublicProfile) {
                return `/api/users/${publicUsername}/actions/${type}`;
            }
            return `/api/actions/${type}`; // Роут для себя
        }
    };

    // === 2. ЗАГРУЗЧИК КОМПОНЕНТОВ ===
    async function loadComponent(containerId, filePath) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            const res = await fetch(filePath);
            if (!res.ok) throw new Error(`Failed to load ${filePath}`);
            const html = await res.text();

            container.innerHTML = html;

            // Ручной запуск скриптов внутри загруженного HTML
            const scripts = container.querySelectorAll('script');
            for (let script of scripts) {
                const newScript = document.createElement('script');
                if (script.src) {
                    newScript.src = script.src;
                    // Добавляем async false, чтобы скрипты выполнялись последовательно
                    newScript.async = false;
                    document.body.appendChild(newScript);
                } else {
                    // Выполняем инлайн-скрипты
                    newScript.textContent = script.textContent;
                    document.body.appendChild(newScript);
                }
                // Удаляем старый скрипт, чтобы избежать повторного выполнения
                script.remove();
            }

        } catch (err) {
            console.error(err);
            container.innerHTML = `<div style="color:red; padding:20px;">Ошибка загрузки модуля: ${filePath}</div>`;
        }
    }

    // === 3. ЗАПУСК ===
    // Загружаем блоки.
    // === 3. ЗАПУСК ===
    await Promise.all([
        loadComponent('user-info-component', '/components/profile/user-info-panel.html'),
        loadComponent('tabs-component', '/components/profile/tabs-panel.html'),
        loadComponent('right-panel-component', '/components/profile/right-panel.html'),
        loadComponent('user-lists-component', '/components/profile/user_lists.html'),

        // --- ДОБАВЬТЕ ЭТУ СТРОКУ ---
        loadComponent('comment-box-component', '/components/profile/comment-box-profile.html')
    ]);
});