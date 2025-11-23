// frontend/js/auth.js
// ЭТО КЛИЕНТСКИЙ КОД. ОН РАБОТАЕТ В БРАУЗЕРЕ.
// ЗДЕСЬ НЕЛЬЗЯ ИСПОЛЬЗОВАТЬ require()

document.addEventListener('DOMContentLoaded', () => {

    // Вспомогательная функция для показа сообщений
    function showAuthMessage(message, containerId, isError = true) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.textContent = message;
        container.style.display = 'block';
        container.style.color = isError ? 'red' : 'green';

        // Скрываем сообщение через 5 секунд
        setTimeout(() => {
            if (container) {
                container.textContent = '';
                container.style.display = 'none';
            }
        }, 5000);
    }

    // ----------------------------------------------------------------------
    // 1. ЛОГИКА ВХОДА (LOGIN)
    // ----------------------------------------------------------------------
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loginError) loginError.textContent = '';

            const usernameInput = document.getElementById('loginUsername');
            const passwordInput = document.getElementById('loginPassword');

            // Проверка на существование элементов (на всякий случай)
            if (!usernameInput || !passwordInput) return;

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                showAuthMessage('Пожалуйста, введите имя пользователя и пароль.', 'loginError');
                return;
            }

            try {
                // Отправляем запрос на сервер
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    // Сохраняем токен и имя
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('username', username); // Сохраним для отображения в профиле

                    // Перенаправляем на главную или в профиль
                    window.location.href = '/profile';
                } else {
                    showAuthMessage(data.error || 'Неверные данные. Попробуйте еще раз.', 'loginError');
                }
            } catch (error) {
                console.error('Login request failed:', error);
                showAuthMessage('Ошибка сети. Сервер недоступен.', 'loginError');
            }
        });
    }

    // ----------------------------------------------------------------------
    // 2. ЛОГИКА РЕГИСТРАЦИИ (REGISTER)
    // ----------------------------------------------------------------------
    const registerForm = document.getElementById('registerForm');
    const registerError = document.getElementById('registerError');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (registerError) registerError.textContent = '';

            const usernameInput = document.getElementById('username');
            const emailInput = document.getElementById('email');
            const passwordInput = document.getElementById('password');

            if (!usernameInput || !emailInput || !passwordInput) return;

            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!username || !email || !password) {
                showAuthMessage('Все поля обязательны.', 'registerError');
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    showAuthMessage('Регистрация успешна! Переходим на вход...', 'registerError', false);
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                } else {
                    showAuthMessage(data.error || 'Ошибка регистрации.', 'registerError');
                }
            } catch (error) {
                console.error('Registration request failed:', error);
                showAuthMessage('Ошибка сети. Сервер недоступен.', 'registerError');
            }
        });
    }

    // ----------------------------------------------------------------------
    // 3. ЛОГИКА ВЫХОДА (LOGOUT)
    // ----------------------------------------------------------------------
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            localStorage.removeItem('userAvatar');
            window.location.href = '/login.html';
        });
    }
});