let currentAlbumId = null;
let currentAlbumSlug = null;

function showMessage(message, isError = false) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.className = isError ? 'message-container error' : 'message-container success';
        messageContainer.style.display = 'block';

        setTimeout(() => {
            messageContainer.style.display = 'none';
        }, 5000);
    } else {
        console.warn('Message container not found. Message:', message);
    }
}

async function fetchAlbumData() {
    const urlParams = new URLSearchParams(window.location.search);
    const albumSlug = urlParams.get('slug');

    if (!albumSlug) {
        showMessage('Album slug not found in URL. Cannot load data.', true);
        return;
    }

    try {
        const response = await fetch(`/api/albums/by-slug/${albumSlug}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to load album data. Server returned: ${errorText}`);
        }

        const albumData = await response.json();
        populateForm(albumData);
        currentAlbumId = albumData.id;
        currentAlbumSlug = albumData.slug;
    } catch (error) {
        console.error('Error fetching album data:', error);
        showMessage('An error occurred while loading album data. Check the console for details.', true);
    }
}

function populateForm(album) {
    document.getElementById('album-title').value = album.title || '';
    document.getElementById('album-artist').value = (Array.isArray(album.artist) ? album.artist.join(', ') : album.artist) || '';
    document.getElementById('album-cover-url').value = album.cover_url || '';
    document.getElementById('type').value = (Array.isArray(album.type) ? album.type[0] : album.type) || ''; // Assuming 'type' is a single value from an array
    document.getElementById('release_date').value = album.release_date ? new Date(album.release_date).toISOString().split('T')[0] : '';
    document.getElementById('album-genre').value = (Array.isArray(album.genres) ? album.genres.join(', ') : album.genres) || '';
    document.getElementById('album-label').value = (Array.isArray(album.label) ? album.label.join(', ') : album.label) || '';
    document.getElementById('album-language').value = (Array.isArray(album.language) ? album.language.join(', ') : album.language) || '';
    document.getElementById('album-description').value = (Array.isArray(album.description) ? album.description.join(', ') : album.description) || '';


    const tracklistContainer = document.getElementById('tracks-container');
    tracklistContainer.innerHTML = '';
    (album.tracks || []).forEach(track => {
        addTrackField(track);
    });
}

function addTrackField(track = {}) {
    const tracklistContainer = document.getElementById('tracks-container');
    const trackDiv = document.createElement('div');
    trackDiv.className = 'track-item';
    const trackNumber = tracklistContainer.children.length + 1;
    trackDiv.innerHTML = `
        <input type="number" name="track_number" class="form-control track-number" placeholder="No." value="${track.track_number || trackNumber}" min="1" required>
        <input type="text" name="track_title" class="form-control track-title" placeholder="Track Title" value="${track.title || ''}" required>
        <input type="text" name="track_duration" class="form-control track-duration" placeholder="Duration (m:ss)" value="${track.duration || ''}">
        <button type="button" class="btn btn-danger remove-track-btn">Remove</button>
    `;
    tracklistContainer.appendChild(trackDiv);
}

function validateDuration(duration) {
    if (!duration) return true;
    return /^\d+:\d{2}$/.test(duration);
}

async function handleEditFormSubmit(event) {
    event.preventDefault();

    const title = document.getElementById('album-title').value;
    const artist = document.getElementById('album-artist').value;
    const cover_url = document.getElementById('album-cover-url').value;
    const type = document.getElementById('type').value;
    const release_date = document.getElementById('release_date').value;
    const genres = document.getElementById('album-genre').value;
    const label = document.getElementById('album-label').value;
    const language = document.getElementById('album-language').value;
    const description = document.getElementById('album-description').value;

    const tracks = [];
    const trackItems = document.querySelectorAll('.track-item');
    for (const item of trackItems) {
        const track_number = item.querySelector('.track-number').value;
        const track_title = item.querySelector('.track-title').value;
        const track_duration = item.querySelector('.track-duration').value;

        if (track_duration && !validateDuration(track_duration)) {
            showMessage(`Invalid duration format for track "${track_title}". Use m:ss format (e.g., 3:45 or 123:05).`, true);
            return;
        }

        tracks.push({
            track_number: parseInt(track_number, 10),
            title: track_title,
            duration: track_duration
        });
    }

    const albumData = {
        title,
        artist,
        cover_url,
        type,
        release_date,
        genres,
        label,
        language,
        description,
        tracks
    };

    try {
        const response = await fetch(`/api/albums/${currentAlbumId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(albumData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update album');
        }

        const responseData = await response.json();
        showMessage('Album updated successfully!', false);
        setTimeout(() => {
            // Используем новый слаг, возвращенный сервером, для перенаправления
            window.location.href = `/release/album/${responseData.slug}`;
        }, 2000);
    } catch (error) {
        console.error('Error updating album:', error);
        showMessage('Error updating album: ' + error.message, true);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchAlbumData();
    const editAlbumForm = document.getElementById('edit-album-form');
    if (editAlbumForm) {
        editAlbumForm.addEventListener('submit', handleEditFormSubmit);
    }
    const addTrackButton = document.getElementById('add-track-btn');
    if (addTrackButton) {
        addTrackButton.addEventListener('click', () => addTrackField());
    }
    const tracksContainer = document.getElementById('tracks-container');
    if (tracksContainer) {
        tracksContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-track-btn')) {
                event.target.closest('.track-item').remove();
            }
        });
    }
});