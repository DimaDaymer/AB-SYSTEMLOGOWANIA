// frontend/js/pagination.js

// Глобальные переменные пагинации для всего приложения
export let currentPage = 1;
// Чтение сохраненного значения или 50 по умолчанию
export let itemsPerPage = parseInt(localStorage.getItem('chartItemsPerPage')) || 50;

const paginationFooter = document.getElementById('pagination-footer');

/**
 * Устанавливает новую страницу и вызывает загрузку элементов.
 * @param {number} page - Номер страницы для перехода.
 * @param {function} loadFn - Функция загрузки (loadAlbumsFn или loadTracksFn).
 */
export function goToPage(page, loadFn) {
    currentPage = page;
    loadFn();

    // 🟢 ИСПРАВЛЕНИЕ: Ищем либо контейнер альбомов, либо контейнер треков для скролла
    const scrollTarget = document.getElementById('album-list-container') || document.getElementById('track-list-container');
    if (scrollTarget) {
        // Скролл наверх списка
        scrollTarget.scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Обрабатывает изменение лимита отображаемых элементов.
 * @param {string} val - Новое значение лимита (строка).
 * @param {function} loadFn - Функция загрузки (loadAlbumsFn или loadTracksFn).
 */
export function handleLimitChange(val, loadFn) {
    itemsPerPage = parseInt(val);
    // Сохранение выбора в память
    localStorage.setItem('chartItemsPerPage', itemsPerPage);

    currentPage = 1; // Сброс на первую страницу
    loadFn();
}

/**
 * Отрисовывает элементы управления пагинацией.
 * @param {object} meta - Объект метаданных с total, page, limit, total_pages.
 * @param {function} loadFn - Функция загрузки (loadAlbumsFn или loadTracksFn).
 */
export function renderPagination(meta, loadFn) {
    if (!paginationFooter) return;
    paginationFooter.innerHTML = ''; // Очистка

    const { total, page, total_pages } = meta;
    if (total_pages <= 1) return;

    // Хелпер для создания кнопок
    const createButton = (text, targetPage, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.className = 'page-btn';
        btn.textContent = text;
        btn.disabled = isDisabled;
        if (!isDisabled) {
            btn.onclick = () => goToPage(targetPage, loadFn);
        }
        return btn;
    };

    // Кнопка Prev
    paginationFooter.appendChild(createButton('«', page - 1, page === 1));

    // Центральные кнопки
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(total_pages, page + 2);

    if (page <= 3) endPage = Math.min(total_pages, 5);
    if (page >= total_pages - 2) startPage = Math.max(1, total_pages - 4);

    if (startPage > 1) {
        paginationFooter.appendChild(createButton('1', 1));
        if (startPage > 2) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.className = 'page-btn disabled';
            paginationFooter.appendChild(dots);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = createButton(i.toString(), i);
        if (i === page) btn.classList.add('active');
        paginationFooter.appendChild(btn);
    }

    if (endPage < total_pages) {
        if (endPage < total_pages - 1) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.className = 'page-btn disabled';
            paginationFooter.appendChild(dots);
        }
        paginationFooter.appendChild(createButton(total_pages.toString(), total_pages));
    }

    // Кнопка Next
    paginationFooter.appendChild(createButton('»', page + 1, page === total_pages));

    // Инфо текст
    const info = document.createElement('div');
    info.className = 'pagination-info';
    info.textContent = `Showing page ${page} of ${total_pages} (${total} tracks total)`;
    paginationFooter.appendChild(info);
}

/**
 * Устанавливает начальное значение в селекте "itemsPerPage".
 * @param {number} initialLimit - Значение из `itemsPerPage`.
 * @param {function} loadFn - Функция загрузки (loadAlbumsFn или loadTracksFn).
 */
export function initPaginationControls(initialLimit, loadFn) {
    const select = document.getElementById('itemsPerPage');
    if (select) {
        select.value = initialLimit;
        // Привязываем обработчик, используя функцию-обертку
        select.onchange = (e) => handleLimitChange(e.target.value, loadFn);
    }
}

/**
 * Сброс страницы на 1 и запуск загрузки данных.
 * Используется при изменении фильтров.
 * @param {function} loadFn - Функция загрузки (loadAlbumsFn или loadTracksFn).
 */
export function applyFilters(loadFn) {
    currentPage = 1;
    loadFn();
}