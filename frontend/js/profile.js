document.addEventListener('DOMContentLoaded', async () => {
    //
    // This is the code that loads the main user data and profile.
    // It's the core logic for the page.
    async function loadUserProfile() {
        const token = localStorage.getItem('token');
        const username = localStorage.getItem('username'); // Используется как резервный ник

        if (!token || !username) {
            window.location.href = '/login.html';
            return;
        }

        try {
            // *** ИЗМЕНЕНИЕ: Используем новый роут /user/me для получения своего профиля по токену ***
            const profileRes = await fetch(`/user/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (profileRes.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('username'); // Очищаем и username
                window.location.href = '/login.html';
                return;
            }

            const data = await profileRes.json();

            document.getElementById('nickname').textContent = data.nickname || username;
            document.getElementById('username').textContent = data.username || username;

            if (data.age) {
                document.getElementById('age').textContent = data.age;
                document.getElementById('age-container').style.display = 'block';
            }

            if (data.location) {
                document.getElementById('location').textContent = data.location;
                document.getElementById('location-container').style.display = 'block';
            }

            if (data.country) {
                document.getElementById('country').textContent = data.country;
                document.getElementById('country-container').style.display = 'block';
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
                // *** ИЗМЕНЕНИЕ: Используем ID 'contactEmail' из HTML, если он там есть.
                // Если в HTML у вас ID='email', поменяйте эту строку на 'email'
                document.getElementById('contactEmail').textContent = data.contact_email;
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
            // Если ошибка, перенаправляем на логин.
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/login.html';
        }
    }

    loadUserProfile();

    // The code from profile-tabs.js now follows directly below.
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    function getStarsForRating(rating) {
        if (rating === null || typeof rating === 'undefined') return '☆☆☆☆☆';
        const stars = rating / 2;
        const fullStars = Math.floor(stars);
        const halfStar = stars % 1 >= 0.25 && stars % 1 < 0.75 ? '½' : '';
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
        return '★'.repeat(fullStars) + halfStar + '☆'.repeat(emptyStars);
    }

    function scoreToStars(score) {
        if (score === null || typeof score === 'undefined') return '☆☆☆☆☆';
        const stars = score;
        const fullStars = Math.floor(stars);
        const halfStar = stars % 1 >= 0.25 && stars % 1 < 0.75 ? '½' : '';
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
        return '★'.repeat(fullStars) + halfStar + '☆'.repeat(emptyStars);
    }

    function renderAlbumTracks(container, tracks) {
        container.innerHTML = '';
        if (!tracks || tracks.length === 0) {
            container.innerHTML = '<div class="no-ratings">Нет оценок треков для этого альбома.</div>';
            return;
        }
        tracks.forEach(track => {
            const trackElement = document.createElement('div');
            trackElement.className = 'track-item';
            trackElement.innerHTML = `
                <div class="track-name">${track.track_number}. ${track.title}</div>
                <div class="track-rating">
                    <span class="rating-stars">${getStarsForRating(track.user_rating)}</span>
                    <span class="rating-value">${track.user_rating ? `${track.user_rating}/10` : '—'}</span>
                </div>
            `;
            container.appendChild(trackElement);
        });
    }

    async function loadAlbumsWithTrackRatings() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                document.getElementById('track-ratings-container').innerHTML = '<p>Пожалуйста, войдите в систему, чтобы увидеть оценки треков.</p>';
                return;
            }

            const container = document.getElementById('track-ratings-container');
            container.innerHTML = '<div class="loading">Загрузка оценок треков...</div>';

            const res = await fetch(`/user/track-ratings`, {
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
                            renderAlbumTracks(tracksContainer, album.tracks);
                        }
                        tracksContainer.style.maxHeight = tracksContainer.scrollHeight + 'px';
                    } else {
                        tracksContainer.style.maxHeight = '0px';
                    }
                });
            });

        } catch (err) {
            console.error('Ошибка загрузки оценок треков:', err);
            const container = document.getElementById('track-ratings-container');
            container.innerHTML = `<p style="color: #ff6b6b;">Ошибка загрузки оценок треков: ${err.message}</p>`;
        }
    }

    async function loadUserActions(type, containerId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                document.getElementById(containerId).innerHTML = '<p>Пожалуйста, войдите в систему, чтобы увидеть этот список.</p>';
                return;
            }

            const url = type === 'all'
                ? '/api/actions/all' // Предполагаем, что этот роут существует
                : `/api/actions/${type}`; // Предполагаем, что эти роуты существуют

            const container = document.getElementById(containerId);
            container.innerHTML = '<div class="loading">Загрузка...</div>';

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error(`Не удалось загрузить ${type}`);

            const actions = await res.json();

            if (!actions || actions.length === 0) {
                container.innerHTML = `<p>Нет найденных элементов в категории ${type}</p>`;
                return;
            }

            container.innerHTML = '';
            actions.forEach(action => {
                const actionEl = document.createElement('div');
                actionEl.className = 'album-entry';
                actionEl.innerHTML = `
                    <div class="list-image">
                        <img src="${action.cover_url || '/assets/album-placeholder.png'}"
                             alt="${action.title}" class="album-cover-small" />
                    </div>
                    <a href="/release/album/${action.slug}"
                       style="color: inherit; text-decoration: none; display: flex; align-items: center; width: 100%;">
                        <div class="album-details">
                            <span class="title">${action.title}</span>
                            <span class="artist-year">${action.artist} (${action.release_year})</span>
                        </div>
                        <span class="date-rated">${new Date(action.created_at).toLocaleDateString()}</span>
                    </a>
                `;
                container.appendChild(actionEl);
            });
        } catch (err) {
            console.error(`Ошибка загрузки ${type}:`, err);
            const container = document.getElementById(containerId);
            container.innerHTML = `<p style="color: #ff6b6b;">Ошибка загрузки ${type}: ${err.message}</p>`;
        }
    }

    async function loadRatedAlbums() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                document.getElementById('recent').innerHTML = '<p>Пожалуйста, войдите в систему, чтобы увидеть ваши оценки</p>';
                return;
            }

            const container = document.getElementById('recent');
            container.innerHTML = '<div class="loading">Загрузка оцененных альбомов...</div>';

            const res = await fetch('/user/rated-albums', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Ошибка HTTP! статус: ${res.status}, ${errorText}`);
            }

            const albums = await res.json();

            if (!albums || albums.length === 0) {
                container.innerHTML = '<p>Пока нет оцененных альбомов</p>';
                return;
            }

            container.innerHTML = '';
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
                            <span class="artist-year">${album.artist} (${new Date(album.created_at).getFullYear()})</span>
                        </div>
                        <span class="rating-stars">${scoreToStars(album.score)}</span>
                        <span class="date-rated">${new Date(album.created_at).toLocaleDateString()}</span>
                    </a>
                `;
                container.appendChild(albumEl);
            });

        } catch (err) {
            console.error('Ошибка загрузки оцененных альбомов:', err);
            const container = document.getElementById('recent');
            container.innerHTML = `<p style="color: #ff6b6b;">Ошибка загрузки оценок: ${err.message}</p>`;
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');

            switch (tab.dataset.tab) {
                case 'recent':
                    loadRatedAlbums();
                    break;
                case 'albums':
                    loadUserActions('listen', 'albums');
                    break;
                case 'liked':
                    loadUserActions('like', 'liked');
                    break;
                case 'wishlist':
                    loadUserActions('wishlist', 'wishlist');
                    break;
                case 'trackratings':
                    loadAlbumsWithTrackRatings();
                    break;
            }
        });
    });

    // Initial load for the active tab
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        // Убедимся, что начальная загрузка происходит для первого таба, если нет активного
        if (activeTab.dataset.tab === 'recent') {
            loadRatedAlbums();
        } else {
            // Для остальных табов нужно вызвать соответствующую функцию
            switch (activeTab.dataset.tab) {
                case 'albums':
                    loadUserActions('listen', 'albums');
                    break;
                case 'liked':
                    loadUserActions('like', 'liked');
                    break;
                case 'wishlist':
                    loadUserActions('wishlist', 'wishlist');
                    break;
                case 'trackratings':
                    loadAlbumsWithTrackRatings();
                    break;
            }
        }
    } else {
        // Загрузить таб "Recent" по умолчанию, если ни один не активен
        loadRatedAlbums();
    }
});