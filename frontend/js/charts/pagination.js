// frontend/js/pagination.js

// Глобальные переменные пагинации для всего приложения
export let currentPage = 1;
// Чтение сохраненного значения или 50 по умолчанию
export let itemsPerPage = parseInt(localStorage.getItem('chartItemsPerPage')) || 50;

const paginationFooter = document.getElementById('pagination-footer');

/**
 * Устанавливает новую страницу и вызывает загрузку альбомов.
 * @param {number} page - Номер страницы для перехода.
 * @param {function} loadAlbumsFn - Функция загрузки альбомов из главного модуля.
 */
export function goToPage(page, loadAlbumsFn) {
    currentPage = page;
    loadAlbumsFn();
    // Скролл наверх списка
    document.getElementById('album-list-container').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Обрабатывает изменение лимита отображаемых элементов.
 * @param {string} val - Новое значение лимита (строка).
 * @param {function} loadAlbumsFn - Функция загрузки альбомов из главного модуля.
 */
export function handleLimitChange(val, loadAlbumsFn) {
    itemsPerPage = parseInt(val);
    // Сохранение выбора в память
    localStorage.setItem('chartItemsPerPage', itemsPerPage);

    currentPage = 1; // Сброс на первую страницу
    loadAlbumsFn();
}

/**
 * Отрисовывает элементы управления пагинацией.
 * @param {object} meta - Объект метаданных пагинации.
 * @param {function} loadAlbumsFn - Функция загрузки альбомов из главного модуля.
 */
export function renderPagination(meta, loadAlbumsFn) {
    paginationFooter.innerHTML = '';
    if (!meta || meta.total_pages <= 1) return;

    const { page, total_pages, total } = meta;
    const maxButtons = 7; // Максимальное число видимых кнопок

    // Кнопка Prev
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '&laquo;';
    prevBtn.disabled = page === 1;
    prevBtn.onclick = () => goToPage(page - 1, loadAlbumsFn);
    paginationFooter.appendChild(prevBtn);

    // Логика отображения номеров (1 ... 4 5 6 ... 10)
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(total_pages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.className = 'page-btn';
        firstBtn.textContent = '1';
        firstBtn.onclick = () => goToPage(1, loadAlbumsFn);
        paginationFooter.appendChild(firstBtn);

        if (startPage > 2) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.color = '#777';
            dots.style.padding = '0 5px';
            paginationFooter.appendChild(dots);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === page ? 'active' : ''}`;
        btn.textContent = i;
        if (i !== page) {
            btn.onclick = () => goToPage(i, loadAlbumsFn);
        }
        paginationFooter.appendChild(btn);
    }

    if (endPage < total_pages) {
        if (endPage < total_pages - 1) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.color = '#777';
            dots.style.padding = '0 5px';
            paginationFooter.appendChild(dots);
        }
        const lastBtn = document.createElement('button');
        lastBtn.className = 'page-btn';
        lastBtn.textContent = total_pages;
        lastBtn.onclick = () => goToPage(total_pages, loadAlbumsFn);
        paginationFooter.appendChild(lastBtn);
    }

    // Кнопка Next
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '&raquo;';
    nextBtn.disabled = page === total_pages;
    nextBtn.onclick = () => goToPage(page + 1, loadAlbumsFn);
    paginationFooter.appendChild(nextBtn);

    // Инфо текст
    const info = document.createElement('div');
    info.className = 'pagination-info';
    info.textContent = `Showing page ${page} of ${total_pages} (${total} albums total)`;
    paginationFooter.appendChild(info);
}

/**
 * Устанавливает начальное значение в селекте "itemsPerPage".
 * @param {number} initialLimit - Значение из `itemsPerPage`.
 * @param {function} loadAlbumsFn - Функция загрузки альбомов из главного модуля.
 */
export function initPaginationControls(initialLimit, loadAlbumsFn) {
    const select = document.getElementById('itemsPerPage');
    if (select) {
        select.value = initialLimit;
        // Привязываем обработчик, используя функцию-обертку, чтобы передать loadAlbumsFn
        select.onchange = (e) => handleLimitChange(e.target.value, loadAlbumsFn);
    }
}

/**
 * Сброс страницы на 1 при применении фильтров.
 * @param {function} loadAlbumsFn - Функция загрузки альбомов из главного модуля.
 */
export function applyFilters(loadAlbumsFn) {
    currentPage = 1;
    loadAlbumsFn();
}