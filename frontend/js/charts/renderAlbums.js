// frontend/js/charts/renderAlbums.js

const defaultContainer = document.getElementById('newReleasesContainer');

export function checkAndScrollToAlbum() {
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

export function renderAlbums(albums, container = defaultContainer) {
    if (!container) return;

    if (!albums || albums.length === 0) {
        container.innerHTML = '<p>Nie znaleziono albumów.</p>';
        return;
    }
    container.innerHTML = '';

    albums.forEach((album, index) => {
        const albumCard = document.createElement('div');
        albumCard.classList.add('album-card');
        if (album.slug) albumCard.id = album.slug;
        albumCard.dataset.albumId = album.id;

        const albumUrl = `/release/album/${album.slug}`;
        let releaseYear = album.release_year || (album.release_date ? new Date(album.release_date).getFullYear() : 'N/A');

        const ratingValue = parseFloat(album.avg_score);
        const rating = (ratingValue && !isNaN(ratingValue) && ratingValue > 0)
            ? `${ratingValue.toFixed(2)} / 5.0`
            : "N/A";

        const genres = Array.isArray(album.genres) ? album.genres.join(', ') : 'N/A';
        const descriptorsDisplay = Array.isArray(album.descriptors) && album.descriptors.length > 0
            ? album.descriptors.join(', ')
            : 'N/A';

        const formatDisplay = album.format_name ? album.format_name : 'N/A';
        const attributesDisplay = (Array.isArray(album.album_attributes) && album.album_attributes.length > 0)
            ? album.album_attributes.join(', ')
            : 'N/A';

        const listensCount = parseInt(album.listens_count || 0).toLocaleString();
        const likesCount = parseInt(album.likes_count || 0).toLocaleString();
        const wishlistCount = parseInt(album.wishlist_count || 0).toLocaleString();
        const inListsCount = parseInt(album.in_lists_count || 0).toLocaleString();
        const reviewsCount = parseInt(album.reviews_count || 0).toLocaleString();

        const activeListen = album.is_listened ? 'active' : '';
        const activeLike = album.is_liked ? 'active' : '';
        const activeWish = album.is_wishlisted ? 'active' : '';

        const rank = album.global_rank || (index + 1);

        albumCard.innerHTML = `
            <div class="chart-rank">#${rank}</div>
            <a href="${albumUrl}" class="album-cover-link">
                ${album.cover_url
            ? `<img src="${album.cover_url}" alt="okładka ${album.title}">`
            : '<img src="https://via.placeholder.com/120" alt="Brak okładki">'}
            </a>

            <div class="album-details-wrapper">
                <a href="${albumUrl}" class="album-text-link">
                    <h2>${album.title}</h2>
                    <p><strong>Wykonawca:</strong> ${album.artist_name || 'N/A'}</p>
                    <p><strong>Rok:</strong> ${releaseYear}</p>
                    <p><strong>Format:</strong> ${formatDisplay}</p>
                    <p><strong>Atrybuty:</strong> ${attributesDisplay}</p>
                    <p><strong>Gatunki:</strong> ${genres}</p>
                    <p><strong>Deskryptory:</strong> ${descriptorsDisplay}</p>
                </a>

                <div class="rating-info">
                    <span class="score">${rating}</span>
                    <span title="Odsłuchania" class="stat-listens"><i class="icon-listen"></i> <span class="count-val">${listensCount}</span> Odsłuchań</span>
                    <span title="Polubienia" class="stat-likes"><i class="icon-like"></i> <span class="count-val">${likesCount}</span> Polubień</span>
                    <span title="Lista życzeń" class="stat-wishlist"><i class="icon-wish"></i> <span class="count-val">${wishlistCount}</span> Chce usłyszeć</span>
                    <span title="Listy"><i class="icon-list"></i> ${inListsCount} List</span>
                    <span title="Recenzje"><i class="icon-review"></i> ${reviewsCount} Recenzji</span>
                </div>

                <div class="album-actions">
                    <button class="action-button ${activeListen}" data-album-id="${album.id}" data-action="listen">
                        <i class="icon-listen"></i>
                    </button>
                    <button class="action-button ${activeLike}" data-album-id="${album.id}" data-action="like">
                        <i class="icon-like"></i>
                    </button>
                    <button class="action-button ${activeWish}" data-album-id="${album.id}" data-action="wishlist">
                        <i class="icon-wish"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(albumCard);
    });

    container.querySelectorAll('.action-button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const button = e.currentTarget;
            const albumId = button.dataset.albumId;
            const actionType = button.dataset.action;
            const token = localStorage.getItem('token');

            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            button.disabled = true;

            try {
                const res = await fetch('/api/actions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ albumId, actionType })
                });

                if (!res.ok) throw new Error('Akcja nieudana');

                const data = await res.json();
                const isActive = data.active;

                if (isActive) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }

                updateAlbumCounter(button, actionType, isActive);

            } catch (err) {
                console.error("Błąd akcji:", err);
                alert("Coś poszło nie tak. Spróbuj ponownie.");
            } finally {
                button.disabled = false;
            }
        });
    });
}

function updateAlbumCounter(button, actionType, isNowActive) {
    const detailsWrapper = button.closest('.album-details-wrapper');
    if (!detailsWrapper) return;

    let selector = '';
    if (actionType === 'listen') selector = '.stat-listens .count-val';
    else if (actionType === 'like') selector = '.stat-likes .count-val';
    else if (actionType === 'wishlist') selector = '.stat-wishlist .count-val';

    if (!selector) return;

    const countSpan = detailsWrapper.querySelector(selector);
    if (countSpan) {
        let count = parseInt(countSpan.textContent.replace(/\D/g, '')) || 0;

        if (isNowActive) {
            count++;
        } else {
            count = Math.max(0, count - 1);
        }

        countSpan.textContent = count.toLocaleString();
    }
}