// frontend/js/autocomplete.js

// --- КОНСТАНТЫ И ПЕРЕМЕННЫЕ ---
let debounceTimer;

/**
 * Инициализирует логику автодополнения.
 */
export function initAutocomplete() {
    const autocompleteResults = document.getElementById('autocomplete-results');
    const searchInput = document.getElementById('filter-search-input');

    if (!searchInput || !autocompleteResults) {
        return;
    }

    // Ссылка на обновление URL из sidebar
    const applyFiltersAndRefreshUrl = () => {
        if (typeof window.updateUrl === 'function') {
            window.updateUrl();
        } else {
            console.error("Function window.updateUrl is not defined.");
        }
    };

    /**
     * Обработка выбора тегов.
     * Добавляет тег в глобальный массив и запускает обновление.
     */
    function handleTagSelection(tag, type) {
        let array;

        // Определяем, в какой массив добавлять
        if (type === 'genre') {
            array = window.selectedGenresArray;
        } else if (type === 'language') {
            array = window.selectedLanguageArray;
        } else if (type === 'description') {
            array = window.selectedDescriptionArray;
        } else if (type === 'artist' || type === 'title' || type === 'search') {
            // Для обычного поиска или артиста просто вставляем в инпут
            searchInput.value = tag;
            autocompleteResults.innerHTML = '';
            applyFiltersAndRefreshUrl();
            return;
        }

        // Если массив найден и тега там еще нет
        if (array && !array.includes(tag)) {
            array.push(tag);
        }

        // Очищаем поле ввода для следующего тега
        searchInput.value = '';
        autocompleteResults.innerHTML = '';

        // Применяем фильтры
        applyFiltersAndRefreshUrl();
    }

    /**
     * Подсветка совпадающей части текста.
     * Пример: query="hip", text="Abstract Hip-Hop" -> "Abstract <b>Hip</b>-Hop"
     */
    function highlightMatch(text, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<b style="color: #3b82f6;">$1</b>');
    }

    /**
     * Асинхронно получает результаты автодополнения.
     */
    async function fetchAutocomplete(query) {
        // Минимальная длина запроса
        if (query.length < 2) {
            autocompleteResults.innerHTML = '';
            return;
        }

        try {
            // Вызываем наш умный API
            const response = await fetch(`/api/filters/autocomplete?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Failed to fetch autocomplete results');

            const results = await response.json();

            autocompleteResults.innerHTML = '';

            if (results && results.length > 0) {
                results.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'autocomplete-item';

                    // Стилизация (вы можете перенести это в CSS)
                    itemEl.style.padding = '8px 12px';
                    itemEl.style.cursor = 'pointer';
                    itemEl.style.borderBottom = '1px solid #eee';
                    itemEl.style.display = 'flex';
                    itemEl.style.justifyContent = 'space-between';
                    itemEl.style.alignItems = 'center';

                    // Определяем красивое название типа
                    let typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);

                    // Цветовая кодировка типов (опционально)
                    let typeColor = '#888';
                    if (item.type === 'genre') typeColor = '#e91e63'; // Розовый для жанров
                    if (item.type === 'language') typeColor = '#2196f3'; // Синий для языков
                    if (item.type === 'description') typeColor = '#4caf50'; // Зеленый для дескрипторов

                    // Формируем HTML с подсветкой
                    const highlightedText = highlightMatch(item.value, query);

                    itemEl.innerHTML = `
                        <span>${highlightedText}</span>
                        <span style="font-size: 0.8em; color: ${typeColor}; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">
                            ${typeLabel}
                        </span>
                    `;

                    // Добавляем эффект наведения (hover) через JS или лучше в CSS
                    itemEl.onmouseover = () => { itemEl.style.backgroundColor = '#f9f9f9'; };
                    itemEl.onmouseout = () => { itemEl.style.backgroundColor = 'white'; };

                    itemEl.onclick = () => handleTagSelection(item.value, item.type);

                    autocompleteResults.appendChild(itemEl);
                });

                // Показываем контейнер
                autocompleteResults.style.display = 'block';

            } else {
                // Если ничего не найдено, предлагаем просто текстовый поиск
                const fallbackEl = document.createElement('div');
                fallbackEl.className = 'autocomplete-item';
                fallbackEl.style.padding = '8px 12px';
                fallbackEl.style.cursor = 'pointer';
                fallbackEl.innerHTML = `Search for "<b>${query}</b>"`;
                fallbackEl.onclick = () => handleTagSelection(query, 'search');
                autocompleteResults.appendChild(fallbackEl);
            }

        } catch (error) {
            console.error('Autocomplete error:', error);
            // Тихо скрываем ошибки, чтобы не пугать пользователя
            autocompleteResults.innerHTML = '';
        }
    }

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length >= 2) {
            // Задержка 300мс перед отправкой запроса
            debounceTimer = setTimeout(() => fetchAutocomplete(query), 300);
        } else {
            autocompleteResults.innerHTML = '';
            autocompleteResults.style.display = 'none';
        }
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            autocompleteResults.innerHTML = '';
            autocompleteResults.style.display = 'none';
            applyFiltersAndRefreshUrl();
        }
    });

    // Скрытие при клике вне области
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !autocompleteResults.contains(e.target)) {
            autocompleteResults.innerHTML = '';
            autocompleteResults.style.display = 'none';
        }
    });
}