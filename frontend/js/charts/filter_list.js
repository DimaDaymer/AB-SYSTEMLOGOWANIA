// frontend/js/charts/filter_list.js

window.initFilterList = async function (filterType, urlParam, excludeUrlParam, apiEndpoint, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const backToFiltersButton = document.getElementById('back-to-filters');
    if (backToFiltersButton) {
        backToFiltersButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.loadFilterSidebar === 'function') {
                window.loadFilterSidebar();
            } else {
                console.error('Błąd: window.loadFilterSidebar nie jest zdefiniowana.');
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);

    const selectedItems = urlParams.get(urlParam);
    const excludedItems = urlParams.get(excludeUrlParam);

    const selectedArrayName = `selected${filterType.charAt(0).toUpperCase() + filterType.slice(1)}Array`;
    const excludedArrayName = `excluded${filterType.charAt(0).toUpperCase() + filterType.slice(1)}Array`;

    window[selectedArrayName] = selectedItems ? selectedItems.split(',').map(g => g.trim()).filter(g => g) : [];
    window[excludedArrayName] = excludedItems ? excludedItems.split(',').map(g => g.trim()).filter(g => g) : [];

    let currentSelectedArray = window[selectedArrayName];
    let currentExcludedArray = window[excludedArrayName];

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
        if (window.applyFilters) window.applyFilters();
        if (window.updateSelectedCountsUI) window.updateSelectedCountsUI();
    };

    try {
        const response = await fetch(apiEndpoint);
        if (!response.ok) throw new Error(`Nie udało się pobrać ${filterType}`);
        const data = await response.json();

        container.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(item => {
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

                const checkState = () => {
                    wrapper.classList.remove('included', 'excluded');
                    if (currentSelectedArray.includes(item)) {
                        wrapper.classList.add('included');
                    } else if (currentExcludedArray.includes(item)) {
                        wrapper.classList.add('excluded');
                    }
                };

                checkState();

                wrapper.addEventListener('click', (e) => {
                    const target = e.target.closest('.control-area');
                    if (!target) return;

                    const action = target.dataset.action;
                    const isIncluded = currentSelectedArray.includes(item);
                    const isExcluded = currentExcludedArray.includes(item);

                    const neutralize = () => {
                        window[selectedArrayName] = currentSelectedArray.filter(i => i !== item);
                        window[excludedArrayName] = currentExcludedArray.filter(i => i !== item);
                        currentSelectedArray = window[selectedArrayName];
                        currentExcludedArray = window[excludedArrayName];
                    };

                    if (action === 'include') {
                        if (isIncluded) {
                            neutralize();
                        } else {
                            neutralize();
                            currentSelectedArray.push(item);
                        }
                    } else if (action === 'exclude') {
                        if (isExcluded) {
                            neutralize();
                        } else {
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
            container.innerHTML = `<p>Nie znaleziono danych dla: ${filterType}.</p>`;
        }
    } catch (error) {
        console.error(`Błąd pobierania ${filterType}:`, error);
        container.innerHTML = '<p>Błąd ładowania.</p>';
    }
};