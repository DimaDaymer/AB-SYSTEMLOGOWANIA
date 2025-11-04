// frontend/js/artist.js

document.addEventListener('DOMContentLoaded', () => {
    // Получаем slug из URL
    const pathSegments = window.location.pathname.split('/');
    // Предполагаем, что URL выглядит как /artist/artist-slug
    const artistSlug = pathSegments[pathSegments.length - 1];

    if (artistSlug) {
        loadArtistData(artistSlug);
    } else {
        document.getElementById('artistName').textContent = 'Ошибка: Исполнитель не найден.';
    }
});

/**
 * Загружает и отображает данные исполнителя.
 * @param {string} slug - SLUG исполнителя.
 */
async function loadArtistData(slug) {
    try {
        const response = await fetch(`/api/artists/${slug}`);

        if (response.status === 404) {
            document.getElementById('artistName').textContent = 'Исполнитель не найден.';
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch artist data');
        }

        const data = await response.json();

        // --- 1. Основная информация ---
        document.getElementById('pageTitle').textContent = `${data.name} | RateYourMusic Clone`;
        document.getElementById('artistName').textContent = data.name;
        document.getElementById('artistLocation').textContent = data.location;
        document.getElementById('artistPhoto').src = data.artist_photo_url || '/assets/artist-placeholder.png';
        document.getElementById('artistBio').textContent = data.bio || 'Биография отсутствует.';

        // --- 2. Детали ---
        document.getElementById('foundedDate').textContent = data.founded_date || 'Неизвестно';
        document.getElementById('membersList').textContent = data.members.join(', ') || 'Нет информации';
        document.getElementById('genresList').textContent = data.genres.join(', ') || 'Не указаны';

        // Связанные исполнители
        if (data.related_artists && data.related_artists.length > 0) {
            document.getElementById('relatedArtistsList').textContent = data.related_artists.join(', ');
            document.getElementById('relatedArtistsBlock').style.display = 'block';
        }

        // Также известен как
        if (data.also_known_as && data.also_known_as.length > 0) {
            document.getElementById('alsoKnownAsList').textContent = data.also_known_as.join(', ');
            document.getElementById('alsoKnownAsBlock').style.display = 'block';
        }

        // --- 3. Дискография ---
        renderDiscography(data.discography);

    } catch (error) {
        console.error('Error loading artist data:', error);
        document.getElementById('artistName').textContent = 'Ошибка загрузки данных.';
    }
}

/**
 * Рендерит дискографию исполнителя.
 * @param {Array} discography - Массив объектов альбомов.
 */
function renderDiscography(discography) {
    const container = document.getElementById('discographyContainer');
    container.innerHTML = '';

    if (discography.length === 0) {
        container.innerHTML = '<p>Дискография отсутствует.</p>';
        return;
    }

    discography.forEach(album => {
        const albumCard = document.createElement('a');
        albumCard.href = `/album/${album.slug}`;
        albumCard.classList.add('album-card');

        // Расчет отображения рейтинга
        const avgRating = album.average_rating ? parseFloat(album.average_rating).toFixed(2) : 'N/A';
        const ratingCount = album.total_ratings || 0;

        albumCard.innerHTML = `
            <img src="${album.cover_url || '/assets/album-placeholder.png'}" alt="${album.title} обложка">
            <div class="album-meta">
                <span class="album-year">${new Date(album.release_date).getFullYear()}</span>
                <span class="album-type">${album.type || 'Альбом'}</span>
            </div>
            <h4 class="album-title">${album.title}</h4>
            <div class="album-rating">
                <span class="rating-score">${avgRating}</span>
                <span class="rating-count">(${ratingCount})</span>
            </div>
        `;
        container.appendChild(albumCard);
    });
}