// frontend/js/edit-profile.js

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const form = document.getElementById('editProfileForm');
    const updateMessage = document.getElementById('updateMessage');

    if (!token || !username) {
        window.location.href = '/login.html';
        return;
    }

    // *** ИЗМЕНЕНИЕ 1: Использование нового маршрута /user/me для ЗАГРУЗКИ данных ***
    fetch(`/user/me`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
        .then(res => {
            if (res.status === 401) {
                // Если токен недействителен, перенаправляем на логин
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                window.location.href = '/login.html';
                return Promise.reject(new Error('Unauthorized'));
            }
            return res.json();
        })
        .then(data => {
            if (data) {
                // Присваиваем значения полям формы для редактирования
                document.getElementById('firstName').value = data.first_name || ''; // Используем data.first_name
                document.getElementById('lastName').value = data.last_name || '';   // Используем data.last_name

                // Преобразование даты в формат YYYY-MM-DD
                let birthDate = data.birth_date ? new Date(data.birth_date).toISOString().split('T')[0] : '';
                document.getElementById('birthDate').value = birthDate;

                document.getElementById('gender').value = data.gender || '';
                document.getElementById('location').value = data.location || '';
                document.getElementById('country').value = data.country || '';

                // Соцсети и медиа, если они передаются как объекты/массивы, нужно преобразовать обратно в строки
                document.getElementById('social').value = data.social ? (typeof data.social === 'string' ? data.social : JSON.stringify(data.social)) : '';
                document.getElementById('contactEmail').value = data.contact_email || '';
                document.getElementById('description').value = data.description || '';
                document.getElementById('music').value = data.music ? (typeof data.music === 'string' ? data.music : data.music.join(', ')) : '';
                document.getElementById('movies').value = data.movies ? (typeof data.movies === 'string' ? data.movies : data.movies.join(', ')) : '';
            }
        })
        .catch(err => {
            console.error('Error loading profile data:', err);
            updateMessage.textContent = 'Ошибка загрузки данных для редактирования.';
        });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        updateMessage.textContent = 'Updating...';

        const profileData = {
            // *** ИЗМЕНЕНИЕ 2: Использование ключей first_name и last_name для соответствия БД ***
            first_name: document.getElementById('firstName').value,
            last_name: document.getElementById('lastName').value,
            // ----------------------------------------------------------------------------------
            birth_date: document.getElementById('birthDate').value, // Соответствие ключу БД
            gender: document.getElementById('gender').value,
            location: document.getElementById('location').value,
            country: document.getElementById('country').value,
            social: document.getElementById('social').value,
            contact_email: document.getElementById('contactEmail').value,
            description: document.getElementById('description').value,
            music: document.getElementById('music').value,
            movies: document.getElementById('movies').value
        };

        try {
            // *** ИЗМЕНЕНИЕ 3: Роут обновления оставлен как /user/profile/update, как в твоем бэкенде ***
            const res = await fetch(`/user/profile/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });

            const result = await res.json();
            if (res.ok) {
                updateMessage.textContent = 'Профиль успешно обновлен!';
                // Опционально: обновить локальное хранилище или перенаправить
            } else {
                updateMessage.textContent = result.error || 'Ошибка обновления профиля.';
            }
        } catch (err) {
            updateMessage.textContent = 'Ошибка связи с сервером при обновлении профиля.';
            console.error(err);
        }
    });
});