// frontend/js/profile.js
document.addEventListener('DOMContentLoaded', async () => {

    async function loadUserProfile() {
        // ... (код без изменений) ...
        const token = localStorage.getItem('token');
        const storedUsername = localStorage.getItem('username') || 'Пользователь';

        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        try {
            const profileRes = await fetch(`/api/users/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (profileRes.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }

            if (!profileRes.ok) throw new Error(`Ошибка сервера: ${profileRes.status}`);

            const data = await profileRes.json();

            const nicknameEl = document.getElementById('nickname');
            if (nicknameEl) nicknameEl.textContent = data.nickname || data.username || storedUsername;

            const usernameEl = document.getElementById('username');
            if (usernameEl) usernameEl.textContent = data.username || storedUsername;

            const showBlock = (id, value, containerId) => {
                const el = document.getElementById(id);
                const cont = document.getElementById(containerId);
                if (value && el && cont) {
                    el.textContent = value;
                    cont.style.display = 'block';
                } else if (cont) {
                    cont.style.display = 'none';
                }
            };

            showBlock('age', data.age, 'age-container');
            showBlock('location', data.location, 'location-container');
            showBlock('country', data.country, 'country-container');
            showBlock('description', data.description, 'description-container');
            showBlock('gender', data.gender, 'gender-container');
            showBlock('contactEmail', data.contact_email, 'email-container');
            showBlock('music', data.music, 'music-container');
            showBlock('movies', data.movies, 'movies-container');

            const avatarImg = document.getElementById('avatar-img');
            if (avatarImg && data.profile_pic) {
                avatarImg.src = data.profile_pic;
            }

        } catch (err) {
            console.error('Error loading profile:', err);
        }
    }

    loadUserProfile();

    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    function scoreToStars(score) {
        // ... (код без изменений) ...
        if (score === null || typeof score === 'undefined') return '☆☆☆☆☆';
        const stars = score <= 5 ? score : score / 2;
        const fullStars = Math.floor(stars);
        const halfStar = stars % 1 >= 0.25 && stars % 1 < 0.75 ? '½' : '';
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
        return '★'.repeat(Math.max(0, fullStars)) + halfStar + '☆'.repeat(Math.max(0, emptyStars));
    }

    async function loadAlbumsWithTrackRatings() {
        // ... (код без изменений) ...
        try {
            const token = localStorage.getItem('token');
            const container = document.getElementById('track-ratings-container');
            if (!token) return;

            container.innerHTML = '<div class="loading">Загрузка оценок треков...</div>';
            const res = await fetch(`/api/users/track-ratings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Не удалось загрузить оценки треков');
            const albumsWithRatings = await res.json();

            if (!albumsWithRatings || albumsWithRatings.length === 0) {
                container.innerHTML = '<div class="no-ratings">Пока нет оценок треков</div>';
                return;
            }

            container.innerHTML = '';
            albumsWithRatings.forEach(album => {
                const albumElement = document.createElement('div');
                albumElement.className = 'album-with-tracks';
                albumElement.innerHTML = `
                    <div class="album-header">
                        <div class="album-header-content">
                            <img src="${album.cover_url || '/assets/album-placeholder.png'}"
                                 alt="${album.title}" class="album-cover-small">
                            <div>
                                <div class="album-title">${album.title}</div>
                                <div class="album-artist">${album.artist}</div>
                            </div>
                        </div>
                        <div class="toggle-icon">▼</div>
                    </div>
                    <div class="tracks-container"></div>
                `;
                container.appendChild(albumElement);

                const header = albumElement.querySelector('.album-header');
                const tracksContainer = albumElement.querySelector('.tracks-container');

                header.addEventListener('click', () => {
                    const isExpanded = header.classList.toggle('expanded');
                    if (isExpanded) {
                        if (tracksContainer.innerHTML === '') {
                            album.tracks.forEach(track => {
                                const tDiv = document.createElement('div');
                                tDiv.className = 'track-item';
                                tDiv.innerHTML = `<div class="track-name">${track.track_number}. ${track.title}</div>
                                    <div class="track-rating"><span class="rating-stars">${scoreToStars(track.user_rating)}</span><span class="rating-value">${track.user_rating}</span></div>`;
                                tracksContainer.appendChild(tDiv);
                            });
                        }
                        tracksContainer.style.maxHeight = tracksContainer.scrollHeight + 'px';
                    } else {
                        tracksContainer.style.maxHeight = '0px';
                    }
                });
            });
        } catch (err) {
            console.error(err);
        }
    }

    async function loadUserActions(type, containerId) {
        // ... (код без изменений) ...
        try {
            const token = localStorage.getItem('token');
            const container = document.getElementById(containerId);
            if (!token) return;

            container.innerHTML = '<div class="loading">Загрузка...</div>';
            const res = await fetch(`/api/actions/${type}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                container.innerHTML = '<p>Пусто.</p>';
                return;
            }

            const actions = await res.json();
            if (!actions || actions.length === 0) {
                container.innerHTML = `<p>Список пуст</p>`;
                return;
            }

            container.innerHTML = '';
            actions.forEach(action => {
                const actionEl = document.createElement('div');
                actionEl.className = 'album-entry';
                actionEl.innerHTML = `
                    <div class="list-image">
                        <img src="${action.cover_url || '/assets/album-placeholder.png'}" alt="${action.title}" class="album-cover-small" />
                    </div>
                    <a href="/release/album/${action.slug}" style="color: inherit; text-decoration: none; display: flex; align-items: center; width: 100%;">
                        <div class="album-details">
                            <span class="title">${action.title}</span>
                            <span class="artist-year">${action.artist}</span>
                        </div>
                    </a>
                `;
                container.appendChild(actionEl);
            });
        } catch (err) {
            console.error(err);
        }
    }

    async function loadRatedAlbums() {
        // ... (код без изменений) ...
        try {
            const token = localStorage.getItem('token');
            const container = document.getElementById('recent');
            container.innerHTML = '<div class="loading">Загрузка...</div>';
            const res = await fetch('/api/users/rated-albums', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error(`Status: ${res.status}`);
            const albums = await res.json();
            if (!albums || albums.length === 0) {
                container.innerHTML = '<p>Пока нет оценок</p>';
                return;
            }
            container.innerHTML = '';
            albums.forEach(album => {
                const albumEl = document.createElement('div');
                albumEl.className = 'album-entry';
                albumEl.innerHTML = `
                    <div class="list-image">
                        <img src="${album.cover_url || '/assets/album-placeholder.png'}" alt="${album.title}" class="album-cover-small" />
                    </div>
                    <a href="/release/album/${album.slug}" style="color: inherit; text-decoration: none; display: flex; align-items: center; width: 100%;">
                        <div class="album-details">
                            <span class="title">${album.title}</span>
                            <span class="artist-year">${album.artist}</span>
                        </div>
                        <span class="rating-stars">${scoreToStars(album.score)}</span>
                    </a>
                `;
                container.appendChild(albumEl);
            });
        } catch (err) {
            console.error(err);
        }
    }

    // === (ИЗМЕНЕННАЯ ФУНКЦИЯ) ===
    async function loadUserTags() {
        const container = document.getElementById('user-tags-container');
        if (!container) return;

        container.innerHTML = '<div class="loading">Loading tags...</div>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/tags/my-tags', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to load tags');

            const data = await res.json();

            if (data.length === 0) {
                container.innerHTML = '<p>No tags created yet.</p>';
                return;
            }

            const groupedTags = {};
            data.forEach(item => {
                if (!groupedTags[item.tag_name]) {
                    groupedTags[item.tag_name] = [];
                }
                groupedTags[item.tag_name].push(item);
            });

            container.innerHTML = '';

            for (const [tagName, albums] of Object.entries(groupedTags)) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'tag-group'; // Класс для стилей аккордеона

                const title = document.createElement('h3');
                title.className = 'tag-group-title'; // Класс для стилей
                title.textContent = `#${tagName}`;

                const listDiv = document.createElement('div');
                listDiv.className = 'tag-albums-list'; // Класс для стилей

                // Скрываем список по умолчанию
                listDiv.style.maxHeight = '0px';

                albums.forEach(album => {
                    const albumEl = document.createElement('div');
                    albumEl.className = 'album-entry';
                    albumEl.innerHTML = `
                     <div class="list-image">
                        <img src="${album.cover_url || '/assets/album-placeholder.png'}" 
                             alt="${album.title}" class="album-cover-small" />
                    </div>
                    <a href="/release/album/${album.slug}" 
                       style="color: inherit; text-decoration: none; display: flex; align-items: center; width: 100%;">
                        <div class="album-details">
                            <span class="title">${album.title}</span>
                            <span class="artist-year">${album.artist_name} (${new Date(album.release_date).getFullYear()})</span>
                        </div>
                    </a>
                `;
                    listDiv.appendChild(albumEl);
                });

                // Добавляем обработчик клика на заголовок
                title.addEventListener('click', () => {
                    const isExpanded = groupDiv.classList.toggle('expanded');
                    if (isExpanded) {
                        // Устанавливаем max-height, чтобы плавно открыть
                        listDiv.style.maxHeight = listDiv.scrollHeight + 'px';
                    } else {
                        // Сворачиваем
                        listDiv.style.maxHeight = '0px';
                    }
                });


                groupDiv.appendChild(title);
                groupDiv.appendChild(listDiv);
                container.appendChild(groupDiv);
            }

        } catch (err) {
            console.error('Error loading tags:', err);
            container.innerHTML = '<p style="color:red">Error loading tags</p>';
        }
    }

    // === ОБРАБОТЧИК КЛИКОВ ПО ТАБАМ (без изменений) ===
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.dataset.tab;
            const contentDiv = document.getElementById(targetId);
            if(contentDiv) contentDiv.classList.add('active');

            switch (targetId) {
                case 'recent': loadRatedAlbums(); break;
                case 'albums': loadUserActions('listen', 'albums'); break;
                case 'liked': loadUserActions('like', 'liked'); break;
                case 'wishlist': loadUserActions('wishlist', 'wishlist'); break;
                case 'trackratings': loadAlbumsWithTrackRatings(); break;
                case 'tags': loadUserTags(); break; // <--- Он уже был здесь
            }
        });
    });

    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        if (activeTab.dataset.tab === 'recent') loadRatedAlbums();
    } else {
        loadRatedAlbums();
    }
});