// frontend/js/charts/renderTracks.js

export function checkAndScrollToTrack() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        // Пытаемся найти элемент с таким ID (slug)
        const targetElement = document.getElementById(hash);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.classList.add('highlighted');
            setTimeout(() => { targetElement.classList.remove('highlighted'); }, 2000);
        }
    }
}

export function renderTracks(tracks, container) {
    if (!container) return;
    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<p>Nie znaleziono utworów.</p>';
        return;
    }

    container.innerHTML = '';

    tracks.forEach((track, index) => {
        const trackCard = document.createElement('div');
        trackCard.classList.add('album-card');
        // Важно: присваиваем ID, чтобы checkAndScrollToTrack мог найти этот элемент
        if (track.slug) trackCard.id = track.slug;

        const releaseYear = track.release_date ? new Date(track.release_date).getFullYear() : 'N/A';

        const ratingValue = parseFloat(track.avg_score);
        const rating = (ratingValue && !isNaN(ratingValue) && ratingValue > 0)
            ? `${ratingValue.toFixed(2)} / 5.0`
            : "N/A";

        const genres = Array.isArray(track.genres) ? track.genres.join(', ') : 'N/A';
        const descriptors = Array.isArray(track.descriptors) ? track.descriptors.join(', ') : 'N/A';

        const albumListens = parseInt(track.album_listens || 0).toLocaleString();
        const albumLikes = parseInt(track.album_likes || 0).toLocaleString();

        const listsCount = parseInt(track.in_lists_count || 0).toLocaleString();
        const reviewsCount = parseInt(track.reviews_count || 0).toLocaleString();
        const rank = track.global_rank || (index + 1);

        trackCard.innerHTML = `
            <div class="chart-rank">#${rank}</div>
            <a href="/release/album/${track.album_slug}" class="album-cover-link">
                ${track.cover_url
            ? `<img src="${track.cover_url}" alt="okładka ${track.title}">`
            : '<img src="https://via.placeholder.com/120" alt="Brak okładki">'
        }
            </a>

            <div class="album-details-wrapper">
                <a href="/track/${track.slug}" class="album-text-link">
                    <h2>${track.title}</h2>
                    <p><strong>Wykonawca:</strong> ${track.artist_name || 'N/A'}</p>
                    <p><strong>Rok:</strong> ${releaseYear}</p>
                    <p><strong>Gatunki:</strong> ${genres}</p>
                    <p><strong>Deskryptory:</strong> ${descriptors}</p>
                </a>

                <p class="track-album-info">
                    Utwór nr ${track.track_number || '?'} z albumu 
                    <a href="/release/album/${track.album_slug}" class="album-link-inline">
                        ${track.album_title || 'Nieznany album'}
                    </a>
                </p>

                <div class="rating-info">
                    <span class="score">${rating}</span>
                    
                    <span title="Odsłuchania albumu" class="stat-listens">
                        <i class="icon-listen"></i> 
                        <span class="count-val" style="font-size: 0.9em; color: #888;">(Alb: ${albumListens})</span>
                    </span>

                    <span title="Polubienia albumu" class="stat-likes">
                        <i class="icon-like"></i> 
                        <span class="count-val" style="font-size: 0.9em; color: #888;">(Alb: ${albumLikes})</span>
                    </span>

                    <span title="Listy z utworem">
                        <i class="icon-list"></i> 
                        <span class="count-val">${listsCount}</span> List
                    </span>

                    <span title="Recenzje utworu">
                        <i class="icon-review"></i> 
                        <span class="count-val">${reviewsCount}</span> Recenzji
                    </span>
                </div>
            </div>
        `;
        container.appendChild(trackCard);
    });
}