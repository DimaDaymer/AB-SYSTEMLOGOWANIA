// frontend/js/auth.js
document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Registration failed');
                }

                alert('Registration successful! Please login.');
                window.location.href = 'login.html';
            } catch (err) {
                document.getElementById('registerError').textContent = err.message;
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Login failed');
                }

                // ✅ Сохраняем и token, и username
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);

                alert('Login successful!');
                window.location.href = 'profile.html'; // Перенаправление на профиль
            } catch (err) {
                document.getElementById('loginError').textContent = err.message;
            }
        });
    }
});
