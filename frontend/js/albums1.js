// frontend/js/albums1.js
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const albumId = urlParams.get('id');

    // Simple custom message display function instead of alert()
    const showMessage = (message, isError = false) => {
        console.log(isError ? 'Error: ' + message : 'Info: ' + message);
        // In a real application, you would display this in a dedicated message area
        // or a custom modal. For now, it logs to the console.
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
            font-weight: bold;
            background-color: ${isError ? '#fdd' : '#dfd'};
            color: ${isError ? '#c00' : '#080'};
            border: 1px solid ${isError ? '#c00' : '#080'};
        `;
        document.body.insertBefore(messageDiv, document.body.firstChild);
        setTimeout(() => messageDiv.remove(), 5000); // Remove after 5 seconds
    };


    if (!albumId) {
        showMessage('Album ID not specified', true); // Replaced alert
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
        showMessage('Error loading album details: ' + error.message, true); // Replaced alert
    }
});
