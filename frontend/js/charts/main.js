// frontend/js/main.js

import { currentPage, itemsPerPage, initPaginationControls, renderPagination, applyFilters } from './pagination.js';
import { renderAlbums, checkAndScrollToAlbum } from './renderAlbums.js';
import { initAutocomplete } from './autocomplete.js'; // 🟢 КРИТИЧЕСКИЙ ИМПОРТ

const newReleasesContainer = document.getElementById('newReleasesContainer');
const mainTitleElement = document.getElementById('main-content-title');

/**
 * Генерирует и отображает динамический заголовок на основе URL-параметров.
 * @param {URLSearchParams} params - Параметры запроса из URL.
 */
export function renderDynamicTitle(params) {
    let timePhrase = '';
    const year = params.get('year');
    const yearRange = params.get('yearRange');

    if (year) {
        timePhrase = ` from ${year}`;
    } else if (yearRange) {
        timePhrase = ` (${yearRange.replace('-', 's ')} Decade)`;
    } else {
        const timeframe = params.get('timeframe');
        if (timeframe === 'recent') {
            timePhrase = ` (Most Recent)`;
        } else if (timeframe === 'all') {
            timePhrase = ` (All Time)`;
        }
    }

    const sortBy = params.get('sort') || 'release_date';
    let rankingPhrase = 'New Releases';

    if (sortBy === 'rating') {
        rankingPhrase = 'Top Rated';
    } else if (sortBy === 'popularity') {
        rankingPhrase = 'Most Popular';
    } else if (sortBy === 'release_date') {
        const order = params.get('order') || 'desc';
        rankingPhrase = order === 'asc' ? 'Oldest Releases' : 'New Releases';
    } else if (sortBy === 'global_rank') {
        rankingPhrase = 'Top Chart';
    }

    const format = params.get('format');
    let contentPhrase = 'Albums';

    if (format && format.includes(',')) {
        contentPhrase = 'Releases';
    } else if (format === 'Album') {
        contentPhrase = 'Albums';
    } else if (format === 'EP') {
        contentPhrase = 'EPs';
    } else if (format === 'Single') {
        contentPhrase = 'Singles';
    }
    else if (format === 'Compilation') {
        contentPhrase = 'Compilations';
    }
    else if (format === 'DJ Mix') {
        contentPhrase = 'DJ Mixes';
    }
    else if (format === 'Mixtape') {
        contentPhrase = 'Mixtapes';
    }
    else if (format === 'Video') {
        contentPhrase = 'Videos';
    }


    const genres = params.get('genres');
    const description = params.get('description');
    const languages = params.get('language');

    let tagPhrase = '';

    if (genres) {
        tagPhrase += ` in ${genres.split(',')[0].replace(/-/g, ' ')}`;
    }
    if (description) {
        tagPhrase += ` (${description.split(',')[0].replace(/-/g, ' ')} descriptor)`;
    }
    if (languages) {
        tagPhrase += ` in ${languages.split(',')[0].replace(/-/g, ' ')} language`;
    }

    const searchTerm = params.get('search');
    let searchPhrase = '';
    if (searchTerm) {
        if (tagPhrase || timePhrase) {
            searchPhrase = ` matching "${searchTerm}"`;
        } else {
            rankingPhrase = `Search Results`;
            contentPhrase = 'Releases';
            searchPhrase = ` for "${searchTerm}"`;
        }
    }

    const finalTitle = `${rankingPhrase} ${contentPhrase}${tagPhrase}${timePhrase}${searchPhrase}`;

    if (mainTitleElement) {
        mainTitleElement.textContent = finalTitle;
    }
}

/**
 * Основная функция для загрузки альбомов с сервера.
 */
export async function loadAlbums() {
    try {
        newReleasesContainer.innerHTML = '<p style="text-align:center; padding:20px;">Loading releases...</p>';

        const params = new URLSearchParams(window.location.search);

        renderDynamicTitle(params);

        params.set('page', currentPage);
        params.set('limit', itemsPerPage);

        const queryUrl = `/api/albums?${params.toString()}`;

        const headers = {};
        const token = localStorage.getItem('token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(queryUrl, { headers: headers });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const jsonResponse = await response.json();

        let albums = [];
        let meta = null;

        if (Array.isArray(jsonResponse)) {
            albums = jsonResponse;
        } else {
            albums = jsonResponse.data;
            meta = jsonResponse.meta;
        }

        renderAlbums(albums);

        if (meta) {
            renderPagination(meta, loadAlbums);
        }

        setTimeout(checkAndScrollToAlbum, 100);
    } catch (error) {
        console.error('Error fetching albums:', error);
        newReleasesContainer.innerHTML = '<p>Failed to load releases.</p>';
        if (mainTitleElement) mainTitleElement.textContent = 'Error Loading Releases';
    }
}

/**
 * Загружает и выполняет скрипты из HTML-фрагмента
 */
function executeScriptsFromFragment(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(script => {
        const newScript = document.createElement('script');

        // Установка типа для модулей
        if (script.type === 'module') {
            newScript.type = 'module';
        }

        if (script.src) {
            newScript.src = script.src;
        } else {
            newScript.appendChild(document.createTextNode(script.textContent));
        }
        document.body.appendChild(newScript);
    });
}

/**
 * 1. Безопасная загрузка навбара
 */
function loadNavbar() {
    fetch('/navbar.html')
        .then(response => response.text())
        .then(html => {
            const container = document.getElementById('navbar-container');
            container.innerHTML = html;

            executeScriptsFromFragment(container);

            if (typeof window.initNavbar === 'function') {
                window.initNavbar();
            }
        })
        .catch(err => console.error('Failed to load navbar: ', err));
}

/**
 * 2. Загрузка фильтров
 */
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

            // 🟢 ВЫЗОВ АВТОДОПОЛНЕНИЯ
            if (typeof initAutocomplete === 'function') {
                initAutocomplete();
            }

            // Инициализация после загрузки фильтров
            loadAlbums();
        })
        .catch(err => console.error('Failed to load sidebar: ', err));
}

// Привязываем функцию сброса страницы на 1 к глобальному window.applyFilters
window.applyFilters = () => applyFilters(loadAlbums);


document.addEventListener('DOMContentLoaded', () => {
    loadNavbar();

    initPaginationControls(itemsPerPage, loadAlbums);

    if (typeof window.loadFilterSidebar === 'function') {
        window.loadFilterSidebar();
    } else {
        loadAlbums();
    }
});