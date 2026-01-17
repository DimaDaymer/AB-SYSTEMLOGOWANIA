// frontend/js/charts/main.js

import PaginationUtils, { renderPagination, initPaginationControls, getLimit } from '../pagination.js';
import { renderAlbums, checkAndScrollToAlbum } from './renderAlbums.js';
import { renderTracks, checkAndScrollToTrack } from './renderTracks.js';
import { renderArtists, checkAndScrollToArtist } from './renderArtists.js';
import { initAutocomplete } from './autocomplete.js';

const newReleasesContainer = document.getElementById('newReleasesContainer');
const mainTitleElement = document.getElementById('main-content-title');

let currentPage = 1;
// Флаг, чтобы не пытаться угадывать страницу при каждом клике, а только при первой загрузке
let initialHashProcessed = false;

export function renderDynamicTitle(params) {
    let type = params.get('type') || 'albums';
    const typeNames = { 'albums': 'Albumy', 'tracks': 'Utwory', 'artists': 'Wykonawcy' };
    let entityName = typeNames[type] || 'Albumy';

    let timePhrase = '';
    const year = params.get('year');
    const yearRange = params.get('yearRange');
    if (year) timePhrase = ` z roku ${year}`;
    else if (yearRange) timePhrase = ` (Dekada ${yearRange.replace('-', 's ')})`;

    const sortBy = params.get('sort') || 'release_date';
    let rankingPhrase = `Nowe ${entityName}`;
    if (sortBy === 'rating') rankingPhrase = `Najwyżej oceniane ${entityName}`;
    else if (sortBy === 'popularity') rankingPhrase = `Najpopularniejsze ${entityName}`;
    else if (sortBy === 'release_date') {
        const order = params.get('order') || 'desc';
        rankingPhrase = order === 'asc' ? `Najstarsze ${entityName}` : `Nowe ${entityName}`;
    }

    const genres = params.get('genres');
    const description = params.get('description');
    let tagPhrase = '';
    if (genres) tagPhrase += ` w gatunku ${genres.split(',')[0].replace(/-/g, ' ')}`;
    if (description) tagPhrase += ` (deskryptor: ${description.split(',')[0].replace(/-/g, ' ')})`;

    if (mainTitleElement) {
        mainTitleElement.textContent = `${rankingPhrase}${tagPhrase}${timePhrase}`;
    }
}

/**
 * Вспомогательная функция для извлечения правильного ранга в зависимости от контекста (URL)
 */
function getContextRank(item, type, params) {
    // Если сортировка НЕ по рейтингу, понятие "страница по рангу" не работает
    const sortBy = params.get('sort');
    if (sortBy && sortBy !== 'rating') return 0;

    // --- АРТИСТЫ ---
    if (type === 'artists') {
        if (params.has('location') && item.ranks && Array.isArray(item.ranks.locations)) {
            const locParam = params.get('location');
            const locRankObj = item.ranks.locations.find(r => r.name === locParam);
            if (locRankObj) return locRankObj.rank;
        }
        return item.ranks?.global || item.global_rank || 0;
    }

    // --- АЛЬБОМЫ ---
    if (type === 'albums') {
        const extra = item.extra_ranks || {};

        // Если ищем в конкретном формате (например, LP)
        if (params.has('format') && extra.format) {
            if (extra.format.name === params.get('format')) {
                return extra.format.rank;
            }
        }

        // Если ищем в атрибутах (например, Live)
        if (params.has('attributes') && Array.isArray(extra.attributes)) {
            const attrParam = params.get('attributes');
            const attrRankObj = extra.attributes.find(a => a.name === attrParam);
            if (attrRankObj) return attrRankObj.rank;
        }

        // По умолчанию — общий рейтинг альбома
        return item.current_rank || item.global_rank || 0;
    }

    // --- ТРЕКИ ---
    if (type === 'tracks') {
        return item.rank_general || item.global_rank || 0;
    }

    return 0;
}

// Функция для определения страницы на основе slug из URL
async function resolvePageFromHash(type, slug, limit) {
    if (!slug) return 1;

    let singleEndpoint = '';
    if (type === 'albums') singleEndpoint = `/api/albums/${slug}`;
    else if (type === 'tracks') singleEndpoint = `/api/tracks/${slug}`;
    else if (type === 'artists') singleEndpoint = `/api/artist/${slug}`;

    if (!singleEndpoint) return 1;

    try {
        const response = await fetch(singleEndpoint);
        if (!response.ok) return 1;

        const data = await response.json();
        const item = data.data || data;

        const params = new URLSearchParams(window.location.search);

        // Получаем ранг именно для ТЕКУЩЕГО фильтра (формат, страна и т.д.)
        const rank = getContextRank(item, type, params);

        if (rank && rank > 0) {
            // Рассчитываем страницу: ceil(rank / limit)
            const calculatedPage = Math.ceil(rank / limit);
            console.log(`Hash detected (${slug}). Rank in this context: ${rank}. Target page: ${calculatedPage}`);
            return calculatedPage;
        }
    } catch (e) {
        console.warn("Could not resolve page from hash:", e);
    }
    return 1;
}

export async function loadChartData(pageNum) {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type') || 'albums';
    const limit = getLimit();
    const hash = window.location.hash.replace('#', '');

    if (typeof pageNum === 'undefined') {
        if (hash && !initialHashProcessed) {
            const resolvedPage = await resolvePageFromHash(type, hash, limit);
            currentPage = resolvedPage;
            initialHashProcessed = true;
        } else {
            if (!initialHashProcessed) currentPage = 1;
        }
    } else {
        currentPage = pageNum;
    }

    try {
        if (newReleasesContainer) {
            newReleasesContainer.innerHTML = '<p style="text-align:center; padding:20px;">Ładowanie...</p>';
        }

        renderDynamicTitle(params);

        params.set('page', currentPage);
        params.set('limit', limit);

        let endpoint = '/api/albums';
        if (type === 'tracks') endpoint = '/api/tracks';
        if (type === 'artists') endpoint = '/api/artist';

        const queryUrl = `${endpoint}?${params.toString()}`;
        const headers = {};
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(queryUrl, { headers: headers });
        if (!response.ok) throw new Error(`Błąd HTTP! status: ${response.status}`);

        const jsonResponse = await response.json();

        let data = [];
        let meta = null;

        if (Array.isArray(jsonResponse)) {
            data = jsonResponse;
        } else {
            data = jsonResponse.data || jsonResponse.tracks || jsonResponse.artist || [];
            meta = jsonResponse.meta;
        }

        if (newReleasesContainer) {
            newReleasesContainer.innerHTML = '';
            if (type === 'tracks') {
                renderTracks(data, newReleasesContainer);
                setTimeout(checkAndScrollToTrack, 100);
            } else if (type === 'artists') {
                renderArtists(data, newReleasesContainer);
                setTimeout(checkAndScrollToArtist, 100);
            } else {
                renderAlbums(data, newReleasesContainer);
                setTimeout(checkAndScrollToAlbum, 100);
            }
        }

        const paginationContainer = document.getElementById('pagination-footer');
        if (meta && paginationContainer) {
            renderPagination(
                paginationContainer,
                meta,
                (p) => loadChartData(p),
                { scrollTarget: 'newReleasesContainer' }
            );
        }

    } catch (error) {
        console.error('Błąd podczas pobierania данных:', error);
        if (newReleasesContainer) {
            newReleasesContainer.innerHTML = `<p style="color:red; text-align:center;">Nie udało się załadować: ${error.message}</p>`;
        }
    }
}

window.loadFilterSidebar = function () {
    fetch('/filter_sidebar.html')
        .then(response => response.text())
        .then(html => {
            const container = document.getElementById('filter-sidebar-container');
            if (container) {
                container.innerHTML = html;

                const scripts = container.querySelectorAll('script');
                scripts.forEach(oldScript => {
                    const newScript = document.createElement('script');
                    if (oldScript.src) {
                        newScript.src = oldScript.src;
                    } else {
                        newScript.textContent = oldScript.textContent;
                    }
                    document.body.appendChild(newScript);
                    oldScript.remove();
                });

                setTimeout(() => {
                    if (typeof window.initFilters === 'function') {
                        window.initFilters();
                    }
                    if (typeof initAutocomplete === 'function') {
                        initAutocomplete();
                    }
                    loadChartData();
                }, 50);
            }
        })
        .catch(err => {
            console.error('Błąd ładowania paska bocznego:', err);
            loadChartData();
        });
}

window.applyFilters = () => {
    currentPage = 1;
    initialHashProcessed = true;
    loadChartData();
};

document.addEventListener('DOMContentLoaded', () => {
    initPaginationControls('itemsPerPage', () => {
        currentPage = 1;
        loadChartData();
    });

    if (document.getElementById('filter-sidebar-container')) {
        window.loadFilterSidebar();
    } else {
        loadChartData();
    }
});