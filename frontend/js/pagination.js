// frontend/js/pagination.js

const STORAGE_KEY = 'userListsItemsPerPage';

export let currentPage = 1;

export function getLimit() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 50;
}

export function getCurrentPage() {
    return currentPage;
}

export function goToPage(page, loadFn, options = {}) {
    currentPage = page;
    loadFn(page);

    const scrollTargetId = options.scrollTarget;
    let scrollElement = null;

    if (typeof scrollTargetId === 'string') {
        if (scrollTargetId.startsWith('.') || scrollTargetId.startsWith('#')) {
            scrollElement = document.querySelector(scrollTargetId);
        } else {
            scrollElement = document.getElementById(scrollTargetId);
        }
    }

    if (scrollElement) {
        scrollElement.scrollIntoView({ behavior: 'smooth' });
    } else if (options.scrollToTop !== false) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

export function handleLimitChange(val, loadFn) {
    const newLimit = parseInt(val, 10);
    localStorage.setItem(STORAGE_KEY, newLimit);
    currentPage = 1;
    loadFn(1);
}

export function initPaginationControls(selectId, loadFn) {
    const select = document.getElementById(selectId);
    if (select) {
        select.value = getLimit();
        select.onchange = (e) => {
            handleLimitChange(e.target.value, loadFn);
        };
    }
}

export function renderPagination(container, meta, loadFn, options = {}) {
    const paginationFooter = typeof container === 'string'
        ? document.getElementById(container)
        : container;

    if (!paginationFooter) return;
    paginationFooter.innerHTML = '';

    const total = meta.total || 0;
    const page = meta.page || 1;
    // Используем лимит из мета-данных (для комментов это 5) или из настроек
    const currentLimit = meta.limit || getLimit();
    const total_pages = meta.total_pages || Math.ceil(total / currentLimit) || 1;

    if (total_pages <= 1) {
        if (total > 0 && options.showInfo !== false) {
            paginationFooter.innerHTML = `<div class="pagination-info" style="color: #777; margin-top: 10px;">Wszystkie elementy: ${total}</div>`;
        }
        return;
    }

    const createButton = (text, targetPage, isDisabled = false, isActive = false) => {
        const btn = document.createElement('button');
        btn.className = isActive ? 'page-btn active' : 'page-btn';
        btn.textContent = text;
        btn.disabled = isDisabled;

        if (!isDisabled && !isActive) {
            btn.onclick = () => goToPage(targetPage, loadFn, options);
        }
        return btn;
    };

    const createDots = () => {
        const span = document.createElement('span');
        span.textContent = '...';
        span.className = 'page-btn disabled';
        return span;
    };

    paginationFooter.appendChild(createButton('«', page - 1, page === 1));

    const range = 2;
    for (let i = 1; i <= total_pages; i++) {
        if (i === 1 || i === total_pages || (i >= page - range && i <= page + range)) {
            paginationFooter.appendChild(createButton(i, i, false, i === page));
        }
        else if (i === 2 && page - range > 2) {
            paginationFooter.appendChild(createDots());
        }
        else if (i === total_pages - 1 && page + range < total_pages - 1) {
            paginationFooter.appendChild(createDots());
        }
    }

    paginationFooter.appendChild(createButton('»', page + 1, page === total_pages));

    if (options.showInfo !== false) {
        const info = document.createElement('div');
        info.className = 'pagination-info';
        info.style.cssText = "width: 100%; text-align: center; margin-top: 10px; color: #777; font-size: 0.9em;";
        info.textContent = `Strona ${page} z ${total_pages} (Łącznie: ${total})`;
        paginationFooter.appendChild(info);
    }
}

// ЭКСПОРТ ДЛЯ КОММЕНТАРИЕВ (чтобы CommentsCore видел этот модуль)
window.PaginationUtils = {
    render: renderPagination
};

export default {
    currentPage,
    getLimit,
    getCurrentPage,
    goToPage,
    handleLimitChange,
    initPaginationControls,
    renderPagination
};