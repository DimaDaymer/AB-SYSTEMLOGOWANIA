// public/js/artist.js

import { handleAlbumAction } from './charts/handleAlbumAction.js';

let currentArtistId = null;
let artistDiscography = {};

document.addEventListener('DOMContentLoaded', async () => {
    let slug = window.location.pathname.split('/').pop();
    if (slug === 'artist.html' || !slug || slug.includes('.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        slug = urlParams.get('slug');
    }

    if (!slug) return console.error('No artist slug found');

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`/api/artist/${slug}`, {
            method: 'GET',
            headers: {
                'Authorization': token ? `Bearer ${token}` : ''
            }
        });

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        currentArtistId = data.artist.id;
        window.currentArtistSlug = slug;

        artistDiscography = data.discography;

        await renderArtistPage(data);
        setupFollowButton(data.artist.id, data.artist.isFollowing);
        checkAdminRightsAndSetupEditButton(slug);
        setupTabs();
        setupDiscographySort();

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('artist-name').textContent = 'Error loading artist';
    }
});

function setupDiscographySort() {
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const sortBy = sortSelect.value;
            renderDiscography(artistDiscography, sortBy);
            setupAlbumActionButtons();
        });
    }
}

async function checkAdminRightsAndSetupEditButton(slug) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` }});
        const user = await res.json();
        const btn = document.getElementById('edit-bio-btn');
        if (btn && user.role === 'admin') {
            btn.style.display = 'block';
            btn.onclick = () => window.location.href = `/edit_artist.html?slug=${slug}`;
        }
    } catch(e) {
        console.error('Admin check failed for edit button', e);
    }
}

async function loadMembersModule(containerId) {
    try {
        const res = await fetch('/components/artist/artist-members.html');
        if (res.ok) {
            document.getElementById(containerId).innerHTML = await res.text();
            return true;
        } else {
            console.warn(`Failed to fetch /components/artist/artist-members.html.`);
            document.getElementById(containerId).innerHTML = '<div style="color:red;">Failed to load members module.</div>';
        }
    } catch (e) {
        console.error('Error loading members module:', e);
    }
    return false;
}

async function renderArtistPage(data) {
    const { artist, discography } = data;

    document.title = `${artist.name} | Melody Rater`;
    document.getElementById('artist-name').textContent = artist.name;

    const artistImg = artist.picture_url || '/images/default-artist.png';
    document.getElementById('artist-picture').src = artistImg;
    const bg = document.getElementById('dynamic-background');
    if(bg) bg.style.backgroundImage = `url('${artistImg}')`;

    document.getElementById('artist-country').textContent = artist.origin_country || 'Unknown';
    document.getElementById('artist-formed-year').textContent = artist.formed_year || 'N/A';
    document.getElementById('artist-followers-count').textContent = artist.followers_count || 0;
    document.getElementById('artist-global-score').textContent = artist.globalScore || 'N/A';

    const genresContainer = document.getElementById('artist-genres');
    genresContainer.innerHTML = '';
    if (artist.genres && artist.genres.length > 0) {
        artist.genres.forEach(g => {
            const link = document.createElement('a');
            link.href = `/chart-page.html?genre=${encodeURIComponent(g)}`;
            link.className = 'genre-tag';
            link.textContent = g;
            genresContainer.appendChild(link);
        });
    }

    const bioText = artist.bio || 'No biography available.';
    document.getElementById('artist-description').innerHTML = bioText.replace(/\n/g, '<br>');

    // 1. Рендеринг дискографии
    renderDiscography(discography, document.getElementById('sort-select').value);

    // 2. Привязка обработчиков после рендеринга
    setupAlbumActionButtons();

    const moduleLoaded = await loadMembersModule('members-module-container');
    if (moduleLoaded && window.initMembersModule) {
        console.log("Initializing Members Module for:", artist.name, "Type:", artist.artist_type);
        window.initMembersModule(artist.id, artist.artist_type || 'solo');
    }
}

function renderDiscography(discography, sortBy = 'release_date_desc') {
    const discoContainer = document.getElementById('discography-list');
    discoContainer.innerHTML = '';
    const order = ['Album', 'EP', 'Mixtape', 'Single', 'Compilation', 'Live'];
    const types = Object.keys(discography).sort((a, b) => {
        let idxA = order.indexOf(a); let idxB = order.indexOf(b);
        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    const sortAlbums = (albums) => {
        return albums.slice().sort((a, b) => {
            switch (sortBy) {
                case 'average_rating_desc':
                    const ratingA = a.average_rating || 0;
                    const ratingB = b.average_rating || 0;
                    if (ratingB === ratingA) return 0;
                    if (ratingA === 0) return 1;
                    if (ratingB === 0) return -1;
                    return ratingB - ratingA;
                case 'ratings_count_desc': return (b.ratings_count || 0) - (a.ratings_count || 0);
                case 'release_date_asc': return (a.release_year || 0) - (b.release_year || 0);
                case 'release_date_desc': return (b.release_year || 0) - (a.release_year || 0);
                case 'title_asc': return a.title.localeCompare(b.title);
                default: return (b.release_year || 0) - (a.release_year || 0);
            }
        });
    };

    types.forEach(type => {
        let albums = discography[type];
        if (!albums.length) return;
        albums = sortAlbums(albums);

        const section = document.createElement('div');
        section.className = 'disco-section';
        section.innerHTML = `<h3 class="section-title">${type}s</h3>`;
        const grid = document.createElement('div');
        grid.className = 'albums-grid';
        albums.forEach(album => {
            const albumId = album.id;

            const card = document.createElement('div');
            card.className = 'album-card';

            // Получение активных состояний: эти флаги приходят с сервера
            const activeListen = album.is_listened ? 'active' : '';
            const activeLike = album.is_liked ? 'active' : '';
            const activeWish = album.is_wishlisted ? 'active' : '';

            const rating = album.average_rating > 0 ? Number(album.average_rating).toFixed(1) : '-';
            card.innerHTML = `
                <a href="/release/album/${album.slug}" class="album-link">
                    <div class="cover-wrapper">
                        <img src="${album.cover_url || '/images/default_cover.png'}" alt="${album.title}" loading="lazy">
                        <div class="rating-badge">${rating}</div>
                    </div>
                    <div class="album-title">${album.title}</div>
                    <div class="album-year">${album.release_year}</div>
                </a>
                
                ${albumId ? `
                <div class="album-actions">
                    <button class="action-button ${activeListen}" data-album-id="${albumId}" data-action="listen" title="Listen">
                        <i class="fas fa-headphones"></i>
                    </button>
                    <button class="action-button ${activeLike}" data-album-id="${albumId}" data-action="like" title="Like">
                        <i class="fas fa-heart"></i>
                    </button>
                    <button class="action-button ${activeWish}" data-album-id="${albumId}" data-action="wishlist" title="Wishlist">
                        <i class="fas fa-star"></i>
                    </button>
                </div>
                ` : `
                <div class="album-actions" style="opacity:0.5; font-size: 0.9em; padding-top: 10px; border-top: 1px solid #2a2a2a; color: #777; justify-content: center;" title="The server did not provide the database ID for this album. Actions are disabled.">
                    Album ID Unavailable (Check server response)
                </div>
                `}
                `;
            grid.appendChild(card);
        });
        section.appendChild(grid);
        discoContainer.appendChild(section);
    });
}

function setupAlbumActionButtons() {
    document.querySelectorAll('.album-actions .action-button').forEach(button => {
        button.removeEventListener('click', handleAlbumAction);
        button.addEventListener('click', handleAlbumAction);
    });
}

function setupFollowButton(artistId, isFollowing) {
    const btn = document.getElementById('follow-button');
    if(!btn) return;

    const updateBtn = (active) => {
        if (active) {
            btn.innerHTML = '<i class="fas fa-check"></i> Following';
            btn.classList.add('following');
            btn.classList.remove('btn-outline');
        } else {
            btn.innerHTML = '<i class="fas fa-plus"></i> Follow';
            btn.classList.remove('following');
            btn.classList.add('btn-outline');
        }
    };
    updateBtn(isFollowing);

    btn.onclick = async () => {
        btn.disabled = true;
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Для подписки необходима авторизация.');
                window.location.href = '/login.html';
                return;
            }
            const res = await fetch(`/api/artist/${artistId}/follow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({})
            });
            if (res.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();
            if (res.ok) {
                document.getElementById('artist-followers-count').textContent = data.followers_count;
                updateBtn(data.status === 'followed');
            }
        } catch (e) { console.error(e); } finally { btn.disabled = false; }
    };
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');

            if (tab.dataset.tab === 'discography') {
                setupAlbumActionButtons();
            }
        });
    });
}