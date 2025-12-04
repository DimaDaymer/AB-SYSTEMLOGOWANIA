// frontend/js/renderAlbums.js

import { handleAlbumAction } from './handleAlbumAction.js';

const newReleasesContainer = document.getElementById('newReleasesContainer');

/**
 * Проверяет хеш URL и скроллит к соответствующему альбому, выделяя его.
 */
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

/**
 * Отрисовывает список альбомов.
 * @param {Array<object>} albums - Массив объектов альбомов.
 */
export function renderAlbums(albums) {
    if (!albums || albums.length === 0) {
        newReleasesContainer.innerHTML = '<p>No albums found.</p>';
        return;
    }
    newReleasesContainer.innerHTML = '';

    albums.forEach(album => {
        const albumCard = document.createElement('div');
        albumCard.classList.add('album-card');
        if (album.slug) albumCard.id = album.slug;

        const albumUrl = `/release/album/${album.slug}`;
        const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : (album.release_year || 'N/A');

        const ratingValue = parseFloat(album.avg_score);
        const rating = (ratingValue && !isNaN(ratingValue) && ratingValue > 0) ? `${ratingValue.toFixed(2)} / 5.0` : "N/A";

        const descriptorTags = album.descriptors;
        const descriptorsDisplay = Array.isArray(descriptorTags) && descriptorTags.length > 0
            ? descriptorTags.join(', ')
            : 'N/A';

        const listensCount = parseInt(album.listens_count || 0).toLocaleString();
        const likesCount = parseInt(album.likes_count || 0).toLocaleString();
        const wishlistCount = parseInt(album.wishlist_count || 0).toLocaleString();
        const inListsCount = parseInt(album.in_lists_count || 0).toLocaleString();
        const reviewsCount = parseInt(album.reviews_count || 0).toLocaleString();

        const activeListen = album.is_listened ? 'active' : '';
        const activeLike = album.is_liked ? 'active' : '';
        const activeWish = album.is_wishlisted ? 'active' : '';

        const rankHtml = (album.global_rank && album.global_rank > 0) ?
            `<div class="chart-rank">#${album.global_rank}</div>` :
            '';

        albumCard.innerHTML = `
            ${rankHtml} <a href="${albumUrl}" class="album-cover-link">
                ${album.cover_url ?
            `<img src="${album.cover_url}" alt="${album.title} cover">` :
            '<img src="https://via.placeholder.com/120" alt="Placeholder cover">'}
            </a>

            <div class="album-details-wrapper">
                <a href="${albumUrl}" class="album-text-link">
                    <h2>${album.title}</h2>
                    <p><strong>Artist:</strong> ${album.artist_name || 'N/A'}</p>
                    <p><strong>Year:</strong> ${releaseYear}</p>
                    <p><strong>Genres:</strong> ${Array.isArray(album.genres) ? album.genres.join(', ') : 'N/A'}</p>
                    <p><strong>Descriptors:</strong> ${descriptorsDisplay}</p>
                </a>

                <div class="rating-info">
                    <span class="score">${rating}</span>
                    <span title="Listens">🎧 ${listensCount} Listens</span>
                    <span title="Likes">❤️ ${likesCount} Likes</span>
                    <span title="Wishlist">⭐ ${wishlistCount} Wishlist</span>
                    <span title="Lists">📜 ${inListsCount} Lists</span>
                    <span title="Reviews">💬 ${reviewsCount} Reviews</span>
                </div>

                <div class="album-actions">
                    <button class="action-button ${activeListen}" data-album-id="${album.id}" data-action="listen">
                        🎧 Listen
                    </button>
                    <button class="action-button ${activeLike}" data-album-id="${album.id}" data-action="like">
                        ❤️ Like
                    </button>
                    <button class="action-button ${activeWish}" data-album-id="${album.id}" data-action="wishlist">
                        ⭐ Wishlist
                    </button>
                </div>
            </div>
        `;
        newReleasesContainer.appendChild(albumCard);
    });

    // Привязка обработчика действий к кнопкам
    document.querySelectorAll('.action-button').forEach(button => {
        button.addEventListener('click', handleAlbumAction);
    });
}