// frontend/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    function showAuthMessage(message, containerId, isError = true) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.textContent = message;
        container.style.display = 'block';
        container.style.color = isError ? 'red' : 'green';

        setTimeout(() => {
            if (container) {
                container.textContent = '';
                container.style.display = 'none';
            }
        }, 5000);
    }

    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loginError) loginError.textContent = '';

            const usernameInput = document.getElementById('loginUsername');
            const passwordInput = document.getElementById('loginPassword');

            if (!usernameInput || !passwordInput) return;

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                showAuthMessage('Proszę podać nazwę użytkownika i hasło.', 'loginError');
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('username', username);
                    window.location.href = '/profile';
                } else {
                    showAuthMessage(data.error || 'Nieprawidłowe dane. Spróbuj ponownie.', 'loginError');
                }
            } catch (error) {
                console.error('Login request failed:', error);
                showAuthMessage('Błąd sieci. Serwer jest niedostępny.', 'loginError');
            }
        });
    }

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
                showAuthMessage('Wszystkie pola są obowiązkowe.', 'registerError');
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
                    showAuthMessage('Rejestracja pomyślna! Przekierowanie do logowania...', 'registerError', false);
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                } else {
                    showAuthMessage(data.error || 'Błąd rejestracji.', 'registerError');
                }
            } catch (error) {
                console.error('Registration request failed:', error);
                showAuthMessage('Błąd sieci. Serwer jest niedostępny.', 'registerError');
            }
        });
    }

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