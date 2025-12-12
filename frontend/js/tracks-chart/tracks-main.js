// ИСПРАВЛЕННЫЕ ПУТИ ИМПОРТА:
import { currentPage, itemsPerPage, initPaginationControls, renderPagination, applyFilters } from '../charts/pagination.js';
import { renderTracks } from './renderTracks.js';
import { initAutocomplete } from '../charts/autocomplete.js';

const tracksContainer = document.getElementById('newReleasesContainer');
const mainTitleElement = document.getElementById('main-content-title');

/**
 * Генерирует заголовок для страницы треков (по аналогии с альбомами)
 */
function renderDynamicTitle(params) {
    let timePhrase = '';
    const year = params.get('year');
    const yearRange = params.get('yearRange');

    if (year) timePhrase = ` from ${year}`;
    else if (yearRange) timePhrase = ` (${yearRange.replace('-', 's ')} Decade)`;

    const sortBy = params.get('sort') || 'release_date';
    let rankingPhrase = 'New Tracks';

    if (sortBy === 'rating') rankingPhrase = 'Top Rated Tracks';
    else if (sortBy === 'popularity') rankingPhrase = 'Most Popular Tracks';
    else if (sortBy === 'release_date') rankingPhrase = 'New Tracks';

    const genres = params.get('genres');
    let tagPhrase = '';
    if (genres) tagPhrase += ` in ${genres.split(',')[0].replace(/-/g, ' ')}`;

    const searchTerm = params.get('search');
    let searchPhrase = '';
    if (searchTerm) searchPhrase = ` matching "${searchTerm}"`;

    const finalTitle = `${rankingPhrase}${tagPhrase}${timePhrase}${searchPhrase}`;
    if (mainTitleElement) mainTitleElement.textContent = finalTitle;
}

/**
 * Загрузка треков с API
 */
export async function loadTracks() {
    try {
        tracksContainer.innerHTML = '<p style="text-align:center; padding:20px;">Loading tracks...</p>';

        const params = new URLSearchParams(window.location.search);

        // Добавляем глобальные фильтры, если они есть (из sidebar)
        if (window.selectedGenresArray && window.selectedGenresArray.length) params.set('genres', window.selectedGenresArray.join(','));
        if (window.selectedFormatArray && window.selectedFormatArray.length) params.set('format', window.selectedFormatArray.join(','));
        // Добавляем остальные массивы фильтров
        if (window.selectedDescriptionArray && window.selectedDescriptionArray.length) params.set('description', window.selectedDescriptionArray.join(','));
        if (window.selectedLanguageArray && window.selectedLanguageArray.length) params.set('language', window.selectedLanguageArray.join(','));

        renderDynamicTitle(params);

        params.set('page', currentPage);
        params.set('limit', itemsPerPage);

        const queryUrl = `/api/tracks?${params.toString()}`;

        const headers = {};
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(queryUrl, { headers: headers });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const jsonResponse = await response.json();
        const tracks = jsonResponse.data || [];
        const meta = jsonResponse.meta;

        renderTracks(tracks);

        if (meta) {
            renderPagination(meta, loadTracks);
        }

    } catch (error) {
        console.error('Error fetching tracks:', error);
        tracksContainer.innerHTML = '<p>Failed to load tracks.</p>';
    }
}

// --- Интеграция с Sidebar ---

function executeScriptsFromFragment(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(script => {
        const newScript = document.createElement('script');
        if (script.type === 'module') newScript.type = 'module';
        if (script.src) newScript.src = script.src;
        else newScript.appendChild(document.createTextNode(script.textContent));
        document.body.appendChild(newScript);
    });
}

function loadNavbar() {
    fetch('/navbar.html')
        .then(response => response.text())
        .then(html => {
            const container = document.getElementById('navbar-container');
            container.innerHTML = html;
            executeScriptsFromFragment(container);
            if (typeof window.initNavbar === 'function') window.initNavbar();
        });
}

window.loadFilterSidebar = function () {
    fetch('/filter_sidebar.html')
        .then(response => response.text())
        .then(html => {
            const container = document.getElementById('filter-sidebar-container');
            container.innerHTML = html;

            executeScriptsFromFragment(container);

            if (typeof window.initFilters === 'function') {
                window.initFilters();
            }
            if (typeof initAutocomplete === 'function') {
                initAutocomplete();
            }

            // Переопределяем глобальную функцию applyFilters, чтобы она вызывала loadTracks
            window.applyFilters = () => applyFilters(loadTracks);

            // Первая загрузка
            loadTracks();
        })
        .catch(err => console.error('Failed to load sidebar: ', err));
}

document.addEventListener('DOMContentLoaded', () => {
    loadNavbar();
    initPaginationControls(itemsPerPage, loadTracks);

    if (typeof window.loadFilterSidebar === 'function') {
        window.loadFilterSidebar();
    } else {
        loadTracks();
    }
});