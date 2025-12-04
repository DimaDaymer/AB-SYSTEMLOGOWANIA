/**
 * Инициализирует функциональность списка фильтров (жанры, описания, языки).
 * @param {string} filterType - Тип фильтра ('genre', 'description', 'language').
 * @param {string} urlParam - Параметр URL для включенных элементов ('genres', 'description', 'language').
 * @param {string} excludeUrlParam - Параметр URL для исключенных элементов ('exclude_genres', 'exclude_description', 'exclude_language').
 * @param {string} apiEndpoint - URL для получения списка элементов (e.g., '/api/filters/all-genres').
 * @param {string} containerId - ID контейнера сетки для тегов (e.g., 'genres-list-grid').
 */
window.initFilterList = async function (filterType, urlParam, excludeUrlParam, apiEndpoint, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // --- ИСПРАВЛЕНИЕ: Инициализация кнопки "Назад к фильтрам" при загрузке фрагмента ---
    const backToFiltersButton = document.getElementById('back-to-filters');
    if (backToFiltersButton) {
        backToFiltersButton.addEventListener('click', (e) => {
            e.preventDefault();
            // Вызов глобальной функции window.loadFilterSidebar, определенной в main.js
            if (typeof window.loadFilterSidebar === 'function') {
                window.loadFilterSidebar();
            } else {
                console.error('Error: window.loadFilterSidebar is not defined.');
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);

    // Читаем оба списка из URL
    const selectedItems = urlParams.get(urlParam);
    const excludedItems = urlParams.get(excludeUrlParam);

    // Инициализируем глобальные массивы в объекте window
    const selectedArrayName = `selected${filterType.charAt(0).toUpperCase() + filterType.slice(1)}Array`;
    const excludedArrayName = `excluded${filterType.charAt(0).toUpperCase() + filterType.slice(1)}Array`;

    window[selectedArrayName] = selectedItems ? selectedItems.split(',').map(g => g.trim()).filter(g => g) : [];
    window[excludedArrayName] = excludedItems ? excludedItems.split(',').map(g => g.trim()).filter(g => g) : [];

    // Ссылки на текущие массивы
    let currentSelectedArray = window[selectedArrayName];
    let currentExcludedArray = window[excludedArrayName];

    // Функция для обновления URL и запуска фильтрации
    const updateFilters = () => {
        const newUrl = new URL(window.location);

        if (currentSelectedArray.length > 0) {
            newUrl.searchParams.set(urlParam, currentSelectedArray.join(','));
        } else {
            newUrl.searchParams.delete(urlParam);
        }

        if (currentExcludedArray.length > 0) {
            newUrl.searchParams.set(excludeUrlParam, currentExcludedArray.join(','));
        } else {
            newUrl.searchParams.delete(excludeUrlParam);
        }

        window.history.pushState({}, '', newUrl);
        // Предполагается, что window.applyFilters определена в main.js
        if (window.applyFilters) window.applyFilters();

        // Обновляем счетчики на сайдбаре после применения фильтров (если такая функция существует)
        if (window.updateSelectedCountsUI) window.updateSelectedCountsUI();
    };

    try {
        const response = await fetch(apiEndpoint);
        if (!response.ok) throw new Error(`Failed to fetch ${filterType}`);
        const data = await response.json();

        container.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(item => {
                // --- СОЗДАНИЕ НОВОЙ СТРУКТУРЫ ТЕГА ---
                const wrapper = document.createElement('div');
                wrapper.className = 'tag-item-wrapper';
                wrapper.dataset.tag = item;

                const nameLabel = document.createElement('div');
                nameLabel.className = 'tag-name-label';
                nameLabel.textContent = item;

                const controls = document.createElement('div');
                controls.className = 'tag-controls';

                const includeBtn = document.createElement('div');
                includeBtn.className = 'control-area control-include';
                includeBtn.textContent = '✔';
                includeBtn.dataset.action = 'include';

                const excludeBtn = document.createElement('div');
                excludeBtn.className = 'control-area control-exclude';
                excludeBtn.textContent = '✖';
                excludeBtn.dataset.action = 'exclude';

                controls.appendChild(includeBtn);
                controls.appendChild(excludeBtn);
                wrapper.appendChild(nameLabel);
                wrapper.appendChild(controls);

                // --- ИНИЦИАЛИЗАЦИЯ СОСТОЯНИЯ ---
                const checkState = () => {
                    wrapper.classList.remove('included', 'excluded');
                    if (currentSelectedArray.includes(item)) {
                        wrapper.classList.add('included');
                    } else if (currentExcludedArray.includes(item)) {
                        wrapper.classList.add('excluded');
                    }
                };

                checkState(); // Устанавливаем начальное состояние

                // --- ОБРАБОТКА КЛИКА ---
                wrapper.addEventListener('click', (e) => {
                    const target = e.target.closest('.control-area');
                    if (!target) return;

                    const action = target.dataset.action;
                    const isIncluded = currentSelectedArray.includes(item);
                    const isExcluded = currentExcludedArray.includes(item);

                    // Удаление тега из обоих списков (нейтрализация)
                    const neutralize = () => {
                        window[selectedArrayName] = currentSelectedArray.filter(i => i !== item);
                        window[excludedArrayName] = currentExcludedArray.filter(i => i !== item);
                        currentSelectedArray = window[selectedArrayName];
                        currentExcludedArray = window[excludedArrayName];
                    };

                    if (action === 'include') {
                        if (isIncluded) {
                            // Был включен -> Нейтрально
                            neutralize();
                        } else {
                            // Был исключен/нейтрально -> Включен
                            neutralize();
                            currentSelectedArray.push(item);
                        }
                    } else if (action === 'exclude') {
                        if (isExcluded) {
                            // Был исключен -> Нейтрально
                            neutralize();
                        } else {
                            // Был включен/нейтрально -> Исключен
                            neutralize();
                            currentExcludedArray.push(item);
                        }
                    }

                    checkState();
                    updateFilters();
                });

                container.appendChild(wrapper);
            });
        } else {
            container.innerHTML = `<p>No ${filterType} found.</p>`;
        }
    } catch (error) {
        console.error(`Error fetching ${filterType}:`, error);
        container.innerHTML = '<p>Failed to load.</p>';
    }
};