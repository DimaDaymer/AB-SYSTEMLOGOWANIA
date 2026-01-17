// frontend/js/charts/renderArtists.js

export function checkAndScrollToArtist() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const targetElement = document.getElementById(hash);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.classList.add('highlighted');
            setTimeout(() => { targetElement.classList.remove('highlighted'); }, 2000);
        }
    }
}

export function renderArtists(artists, container) {
    if (!container) return;
    if (!artists || artists.length === 0) {
        container.innerHTML = '<p>Nie znaleziono wykonawców.</p>';
        return;
    }

    container.innerHTML = '';

    artists.forEach((artist, index) => {
        const card = document.createElement('div');
        card.classList.add('album-card');

        // Важно: присваиваем ID (slug) для прокрутки
        if (artist.slug) card.id = artist.slug;

        const ratingValue = parseFloat(artist.avg_score);
        const rating = (ratingValue && !isNaN(ratingValue) && ratingValue > 0)
            ? `${ratingValue.toFixed(2)} / 5.0`
            : "N/A";

        const genres = Array.isArray(artist.genres) ? artist.genres.join(', ') : 'N/A';
        const descriptors = Array.isArray(artist.descriptors) ? artist.descriptors.join(', ') : 'N/A';

        const country = (Array.isArray(artist.locations) && artist.locations.length > 0)
            ? artist.locations.join(', ')
            : 'Nieznany';

        const followersCount = parseInt(artist.followers_count || (artist.stats && artist.stats.followers_count) || 0).toLocaleString();
        const listsCount = parseInt(artist.in_lists_count || (artist.stats && artist.stats.in_lists_count) || 0).toLocaleString();
        const reviewsCount = parseInt(artist.reviews_count || (artist.stats && artist.stats.reviews_count) || 0).toLocaleString();

        const rank = artist.global_rank || (index + 1);

        const isFollowing = artist.is_following;
        const activeClass = isFollowing ? 'active' : '';

        card.innerHTML = `
            <div class="chart-rank">#${rank}</div>
            <a href="/artist/${artist.slug}" class="album-cover-link">
                <img src="${artist.picture_url || '/img/default-artist.png'}" 
                     alt="${artist.name}" 
                     style="border-radius: 50%; object-fit: cover;">
            </a>

            <div class="album-details-wrapper">
                <a href="/artist/${artist.slug}" class="album-text-link">
                    <h2>${artist.name}</h2>
                    <p><strong>Kraj:</strong> ${country}</p>
                    <p><strong>Gatunki:</strong> ${genres}</p>
                    <p><strong>Deskryptory:</strong> ${descriptors}</p>
                </a>

                <div class="rating-info">
                    <span class="score">${rating}</span>
                    <span title="Obserwujący">
                        <i class="icon-follower"></i> 
                        <span class="count-val">${followersCount}</span> Obserwujących
                    </span>
                    <span title="Listy">
                        <i class="icon-list"></i> 
                        <span class="count-val">${listsCount}</span> List
                    </span>
                    <span title="Recenzje">
                        <i class="icon-review"></i> 
                        <span class="count-val">${reviewsCount}</span> Recenzji
                    </span>
                </div>

                <div class="album-actions">
                    <button class="action-button ${activeClass}" 
                            data-artist-id="${artist.id}" 
                            data-action="follow" 
                            title="${isFollowing ? 'Przestań obserwować' : 'Obserwuj'}">
                        <i class="icon-follower"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // Обработка клика по кнопке "Follow"
    container.querySelectorAll('button[data-action="follow"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const button = e.currentTarget;
            const artistId = button.dataset.artistId;
            const token = localStorage.getItem('token');

            if(!token) {
                window.location.href = '/login.html';
                return;
            }

            button.disabled = true;

            try {
                const res = await fetch(`/api/artist/${artistId}/follow`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!res.ok) throw new Error('Akcja nieudana');

                const data = await res.json();

                // Определяем статус подписки на основе ответа API
                const isNowFollowing = data.status === 'followed';

                if(isNowFollowing) {
                    button.classList.add('active');
                    button.title = 'Przestań obserwować';
                } else {
                    button.classList.remove('active');
                    button.title = 'Obserwuj';
                }

                // Передаем корректное значение в функцию обновления счетчика
                updateArtistCounter(button, isNowFollowing);

            } catch(err) {
                console.error('Błąd obserwowania:', err);
                alert("Coś poszło nie tak.");
            } finally {
                button.disabled = false;
            }
        });
    });
}

function updateArtistCounter(button, isNowFollowing) {
    const card = button.closest('.album-card');
    if (!card) return;

    // Ищем спан со счетчиком внутри блока "Obserwujący"
    const countSpan = card.querySelector('span[title="Obserwujący"] .count-val');
    if (countSpan) {
        // Убираем пробелы (toLocaleString добавляет их) перед парсингом
        let count = parseInt(countSpan.textContent.replace(/\s/g, '')) || 0;

        if (isNowFollowing) {
            count++;
        } else {
            count = Math.max(0, count - 1);
        }

        countSpan.textContent = count.toLocaleString();
    }
}