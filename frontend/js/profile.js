document.addEventListener('DOMContentLoaded', async () => {
    // Получаем токен и имя пользователя в самом начале.
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    // Если токена или имени пользователя нет, сразу перенаправляем на страницу входа.
    if (!token || !username) {
        window.location.href = '/login.html';
        return; // Прекращаем выполнение, чтобы избежать дальнейших действий.
    }

    // Если данные для аутентификации есть, можно загружать профиль.
    async function loadUserProfile() {
        try {
            const profileRes = await fetch(`/user/profile?username=${username}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Проверяем ответ сервера. Ошибка 401 означает, что токен недействителен.
            if (profileRes.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }

            // Если все хорошо, получаем данные и заполняем страницу.
            const data = await profileRes.json();

            document.getElementById('nickname').textContent = data.nickname || username;
            document.getElementById('username').textContent = data.username || username;

            // ... Остальной код для заполнения данных профиля
            if (data.age) {
                document.getElementById('age').textContent = data.age;
                document.getElementById('age-container').style.display = 'block';
            }

            if (data.location) {
                document.getElementById('location').textContent = data.location;
                document.getElementById('location-container').style.display = 'block';
            }

            if (data.description) {
                document.getElementById('description').textContent = data.description;
                document.getElementById('description-container').style.display = 'block';
            }

            if (data.gender) {
                document.getElementById('gender').textContent = data.gender;
                document.getElementById('gender-container').style.display = 'block';
            }

            if (data.contact_email) {
                document.getElementById('email').textContent = data.contact_email;
                document.getElementById('email-container').style.display = 'block';
            }

            if (data.music) {
                document.getElementById('music').textContent = data.music;
                document.getElementById('music-container').style.display = 'block';
            }

            if (data.movies) {
                document.getElementById('movies').textContent = data.movies;
                document.getElementById('movies-container').style.display = 'block';
            }

            if (data.profile_pic) {
                const avatarUrl = data.profile_pic + `?${Date.now()}`;
                document.getElementById('avatar-img').src = avatarUrl;
                localStorage.setItem('userAvatar', avatarUrl);
            } else {
                const savedAvatar = localStorage.getItem('userAvatar');
                if (savedAvatar) {
                    document.getElementById('avatar-img').src = savedAvatar;
                }
            }
        } catch (err) {
            console.error('Error loading profile:', err);
        }
    }

    // Вызываем функцию для загрузки профиля.
    loadUserProfile();
});