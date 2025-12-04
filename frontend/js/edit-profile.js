// js/edit-profile.js

document.addEventListener('DOMContentLoaded', async () => {
    // === 0. ЗАГРУЗКА НАВБАРА ===
    const navContainer = document.getElementById('navbar-container');
    if (navContainer) {
        try {
            const res = await fetch('/navbar.html');
            if (res.ok) {
                navContainer.innerHTML = await res.text();
                // Активируем скрипты навбара (например, поиск)
                navContainer.querySelectorAll('script').forEach(script => {
                    const newScript = document.createElement('script');
                    if (script.src) newScript.src = script.src;
                    else newScript.textContent = script.textContent;
                    document.body.appendChild(newScript);
                });
            }
        } catch (e) {
            console.error('Error loading navbar:', e);
        }
    }
    // ===========================

    const form = document.getElementById('editProfileForm');
    const messageEl = document.getElementById('updateMessage');
    const token = localStorage.getItem('token');

    // 1. Проверка авторизации
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // 2. Функция загрузки текущих данных
    async function loadCurrentProfile() {
        try {
            const res = await fetch('/api/users/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) throw new Error('Failed to load profile');

            const data = await res.json();

            document.getElementById('firstName').value = data.first_name || '';
            document.getElementById('lastName').value = data.last_name || '';
            document.getElementById('location').value = data.location || '';
            document.getElementById('country').value = data.country || '';
            document.getElementById('contactEmail').value = data.contact_email || '';
            document.getElementById('description').value = data.description || '';
            document.getElementById('music').value = data.music || '';
            document.getElementById('movies').value = data.movies || '';
            document.getElementById('gender').value = data.gender || '';

            if (data.social) {
                if (typeof data.social === 'object') {
                    document.getElementById('social').value = JSON.stringify(data.social);
                } else {
                    document.getElementById('social').value = data.social;
                }
            }

            if (data.birth_date) {
                const dateObj = new Date(data.birth_date);
                if (!isNaN(dateObj.getTime())) {
                    const isoDate = dateObj.toISOString().split('T')[0];
                    document.getElementById('birthDate').value = isoDate;
                }
            }

        } catch (err) {
            console.error(err);
            messageEl.textContent = 'Ошибка загрузки данных профиля.';
            messageEl.style.color = 'red';
        }
    }

    // 3. Обработка отправки формы
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageEl.textContent = 'Сохранение...';
        messageEl.style.color = '#fff';

        const payload = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            birthDate: document.getElementById('birthDate').value,
            gender: document.getElementById('gender').value,
            location: document.getElementById('location').value,
            country: document.getElementById('country').value,
            social: document.getElementById('social').value,
            contactEmail: document.getElementById('contactEmail').value,
            description: document.getElementById('description').value,
            music: document.getElementById('music').value,
            movies: document.getElementById('movies').value
        };

        try {
            const res = await fetch('/api/users/profile/update', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                messageEl.textContent = 'Профиль успешно обновлен!';
                messageEl.style.color = 'lightgreen';
                setTimeout(() => {
                    window.location.href = '/profile.html';
                }, 1500);
            } else {
                const errData = await res.json();
                throw new Error(errData.error || 'Ошибка обновления');
            }
        } catch (err) {
            console.error(err);
            messageEl.textContent = `Ошибка: ${err.message}`;
            messageEl.style.color = 'red';
        }
    });

    loadCurrentProfile();
});