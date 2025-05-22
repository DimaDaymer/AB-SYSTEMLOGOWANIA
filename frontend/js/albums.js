// frontend/albums.js
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const albumId = urlParams.get('id');

    if (!albumId) {
        alert('Album ID not specified');
        return;
    }

    try {
        // Fetch album data
        const response = await fetch(`/api/albums/${albumId}`);
        if (!response.ok) {
            throw new Error('Album not found');
        }
        const album = await response.json();

        // Update album info
        document.getElementById('album-title').textContent = album.title;
        document.getElementById('album-artist').textContent = album.artist;
        document.getElementById('release-year').textContent = album.release_year;
        document.getElementById('genres').textContent = album.genre;
        document.getElementById('label').textContent = album.label || 'N/A';
        document.getElementById('language').textContent = album.language || 'N/A';
        document.getElementById('type').textContent = album.type || 'N/A';

        // Static track list (пример реализации, если бы были данные)
        const tracksList = document.getElementById('tracks');
        tracksList.innerHTML = `
            <li>1. Track 1</li>
            <li>2. Track 2</li>
            <li>3. Track 3</li>
        `;

        // Static reviews (пример реализации, если бы были данные)
        const reviewContainer = document.getElementById('review-container');
        reviewContainer.innerHTML = `
            <div class="review">
                <strong class="review-user">MusicLover123</strong>
                <div class="stars">★★★★☆</div>
                <p class="review-text">A classic album that defined a generation!</p>
            </div>
        `;

    } catch (error) {
        console.error('Error loading album:', error);
        alert('Error loading album details');
    }
});