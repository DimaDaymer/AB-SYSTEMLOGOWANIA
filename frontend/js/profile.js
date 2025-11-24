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
        getApiUrl: (endpoint) => {
            if (isPublicProfile) {
                // ИСПРАВЛЕНИЕ: Добавляем '/' только если endpoint не пустой
                const separator = endpoint ? '/' : '';
                return `/api/users/${publicUsername}${separator}${endpoint}`;
            } else {
                // Для "своих" данных
                // ИСПРАВЛЕНИЕ: Обрабатываем пустую строку ('') или 'profile' для основного профиля (должен быть /api/users/me)
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
                } else {
                    newScript.textContent = script.textContent;
                }
                document.body.appendChild(newScript);
            }

        } catch (err) {
            console.error(err);
            container.innerHTML = `<div style="color:red; padding:20px;">Ошибка загрузки модуля: ${filePath}</div>`;
        }
    }

    // === 3. ЗАПУСК ===
    // Загружаем блоки. User-info и Right-panel можно оставить старыми,
    // здесь фокус на Tabs.
    await Promise.all([
        loadComponent('user-info-component', '/components/profile/user-info-panel.html'),
        loadComponent('tabs-component', '/components/profile/tabs-panel.html'),
        loadComponent('right-panel-component', '/components/profile/right-panel.html')
    ]);
});