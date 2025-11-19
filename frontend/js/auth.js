// frontend/js/auth.js (Клієнтський код для браузера)

document.addEventListener('DOMContentLoaded', () => {

    // Функція для відображення повідомлень про помилки/успіх
    function showAuthMessage(message, containerId, isError = true) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.textContent = message;
        container.style.display = 'block';
        container.style.color = isError ? 'red' : 'green';
        // Приховуємо повідомлення через 5 секунд
        setTimeout(() => {
            container.textContent = '';
            container.style.display = 'none';
        }, 5000);
    }

    // ----------------------------------------------------------------------
    // ЛОГІКА ВХОДУ (LOGIN)
    // ----------------------------------------------------------------------
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loginError) loginError.textContent = ''; // Очистити попередні помилки

            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!username || !password) {
                showAuthMessage('Будь ласка, введіть ім\'я користувача та пароль.', 'loginError');
                return;
            }

            try {
                // Використання коректного API-маршруту
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    // Перенаправлення
                    window.location.href = '/';
                } else {
                    showAuthMessage(data.error || 'Невірні облікові дані. Спробуйте ще раз.', 'loginError');
                }
            } catch (error) {
                console.error('Login request failed:', error);
                showAuthMessage('Виникла помилка мережі. Спробуйте ще раз.', 'loginError');
            }
        });
    }

    // ----------------------------------------------------------------------
    // ЛОГІКА РЕЄСТРАЦІЇ (REGISTER)
    // ----------------------------------------------------------------------
    const registerForm = document.getElementById('registerForm');
    const registerError = document.getElementById('registerError');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (registerError) registerError.textContent = ''; // Очистити попередні помилки

            const username = document.getElementById('username').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            if (!username || !email || !password) {
                showAuthMessage('Всі поля обов\'язкові для заповнення.', 'registerError');
                return;
            }

            try {
                // Використання коректного API-маршруту
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    showAuthMessage('Реєстрація успішна! Перенаправлення на сторінку входу...', 'registerError', false);
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                } else {
                    showAuthMessage(data.error || 'Помилка реєстрації. Можливо, користувач/email вже існує.', 'registerError');
                }
            } catch (error) {
                console.error('Registration request failed:', error);
                showAuthMessage('Виникла помилка мережі. Спробуйте ще раз.', 'registerError');
            }
        });
    }

    // ----------------------------------------------------------------------
    // ЛОГІКА ВИХОДУ (LOGOUT)
    // ----------------------------------------------------------------------
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/';
        });
    }
});