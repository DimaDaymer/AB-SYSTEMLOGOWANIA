import { handleTrackAction } from './handleTrackAction.js';

// Получаем currentPage и itemsPerPage из пагинации, если они экспортированы,
// или вычисляем номер иначе. Для простоты здесь предполагаем, что они доступны глобально
// или передаются, но чтобы не ломать импорты, возьмем из window или упростим.
// Лучший вариант: просто выводить индекс в текущем списке.

const container = document.getElementById('newReleasesContainer');

export function renderTracks(tracks) {
    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">No tracks found matching your criteria.</p>';
        return;
    }

    container.innerHTML = '';

    // Определяем offset для нумерации
    const params = new URLSearchParams(window.location.search);
    const currentPage = parseInt(params.get('page')) || 1;
    const itemsPerPage = parseInt(params.get('limit')) || 20; // Default matches select

    tracks.forEach((track, index) => {
        const albumSlug = track.album_slug || 'unknown';
        const artistSlug = track.artist_slug || '#';

        const albumUrl = `/release/album/${albumSlug}`;
        const trackUrl = track.slug ? `/track/${track.slug}` : '#';
        const coverUrl = track.cover_url || 'https://via.placeholder.com/60';

        const releaseYear = (track.release_date && !isNaN(new Date(track.release_date)))
            ? new Date(track.release_date).getFullYear()
            : 'N/A';

        const avgScore = track.avg_score ? parseFloat(track.avg_score).toFixed(2) : '0.00';

        // ИСПРАВЛЕНО: используем ratings_count
        const ratingsCount = track.ratings_count !== undefined ? track.ratings_count.toLocaleString() : 0;

        const userScore = track.user_score ? `<span style="color:#00ffcc">My: ${track.user_score}</span>` : '';

        const trackCard = document.createElement('div');
        trackCard.className = 'track-card';

        // Форматирование длительности
        let durationDisplay = 'N/A';
        if (track.duration) {
            const minutes = Math.floor(track.duration / 60);
            const seconds = track.duration % 60;
            durationDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        const rankNumber = (currentPage - 1) * itemsPerPage + index + 1;

        trackCard.innerHTML = `
            <div class="track-rank-number">#${rankNumber}</div>
            
            <a href="${albumUrl}" class="track-cover-link">
                <img src="${coverUrl}" alt="${track.album_title}">
            </a>
            
            <div class="track-info">
                <div>
                    <a href="${trackUrl}" class="track-title">${track.title}</a>
                </div>
                <div class="track-meta">
                    <div>by <a href="/artist/${artistSlug}">${track.artist_name || 'Unknown'}</a></div>
                    <div>on <a href="${albumUrl}">${track.album_title || 'Album'}</a> (${releaseYear})</div>
                </div>
            </div>

            <div class="track-stats">
                 <div class="rating-value">${avgScore}</div>
                 <div class="listens-count">based on ${ratingsCount} ratings</div>
                 <div style="font-size:0.8em; margin-top:2px;">${userScore}</div>
            </div>

            <div class="track-actions">
                 <button class="track-action-btn like-btn" data-id="${track.id}">❤️</button>
            </div>
        `;

        container.appendChild(trackCard);
    });

    document.querySelectorAll('.track-action-btn').forEach(btn => {
        btn.addEventListener('click', handleTrackAction);
    });
}