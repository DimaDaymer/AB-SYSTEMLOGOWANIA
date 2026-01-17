// frontend/js/autocomplete.js

export function initAutocomplete() {
    const autocompleteResults = document.getElementById('autocomplete-results');
    const searchInput = document.getElementById('filter-search-input');

    if (!searchInput || !autocompleteResults) {
        return;
    }

    const applyFiltersAndRefreshUrl = () => {
        if (typeof window.updateUrl === 'function') {
            window.updateUrl();
        } else if (typeof window.applyFilters === 'function') {
            window.applyFilters();
        } else {
            console.error("Funkcje nawigacji (updateUrl/applyFilters) nie są zdefiniowane.");
        }
    };

    function handleTagSelection(tag, type, action = 'include') {
        let selectedArray = null;
        let excludedArray = null;

        if (type === 'genre') {
            selectedArray = window.selectedGenreArray;
            excludedArray = window.excludedGenreArray;
        } else if (type === 'language') {
            selectedArray = window.selectedLanguageArray;
            excludedArray = window.excludedLanguageArray;
        } else if (type === 'descriptor' || type === 'description') {
            selectedArray = window.selectedDescriptionArray;
            excludedArray = window.excludedDescriptionArray;
        } else if (type === 'location' || type === 'locations') {
            selectedArray = window.selectedLocationArray;
            excludedArray = window.excludedLocationArray;
        }

        if (type === 'artist' || type === 'title' || type === 'search') {
            searchInput.value = tag;
            autocompleteResults.innerHTML = '';
            autocompleteResults.style.display = 'none';
            applyFiltersAndRefreshUrl();
            return;
        }

        if (selectedArray && excludedArray) {
            const idxS = selectedArray.indexOf(tag);
            if (idxS > -1) selectedArray.splice(idxS, 1);

            const idxE = excludedArray.indexOf(tag);
            if (idxE > -1) excludedArray.splice(idxE, 1);

            if (action === 'include') {
                selectedArray.push(tag);
            } else if (action === 'exclude') {
                excludedArray.push(tag);
            }

            searchInput.value = '';
        } else {
            searchInput.value = tag;
        }

        autocompleteResults.innerHTML = '';
        autocompleteResults.style.display = 'none';

        applyFiltersAndRefreshUrl();

        if (typeof window.updateSelectedCountsUI === 'function') {
            window.updateSelectedCountsUI();
        }
    }

    function highlightMatch(text, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<b style="color: #3b82f6;">$1</b>');
    }

    async function fetchAutocomplete(query) {
        if (query.length < 2) {
            autocompleteResults.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/filters/autocomplete?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Nie udało się pobrać wyników autouzupełniania');

            const results = await response.json();
            autocompleteResults.innerHTML = '';

            if (results && results.length > 0) {
                results.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'autocomplete-item';

                    let typeColor = '#888';
                    let typeLabel = item.type;
                    if (item.type === 'genre') { typeColor = '#e91e63'; typeLabel = 'Gatunek'; }
                    if (item.type === 'language') { typeColor = '#2196f3'; typeLabel = 'Język'; }
                    if (item.type === 'descriptor' || item.type === 'description') { typeColor = '#4caf50'; typeLabel = 'Deskryptor'; }
                    if (item.type === 'location' || item.type === 'locations') { typeColor = '#ff9800'; typeLabel = 'Lokalizacja'; }

                    const highlightedText = highlightMatch(item.value, query);

                    itemEl.innerHTML = `
                        <div class="autocomplete-info">
                            <span class="autocomplete-text">${highlightedText}</span>
                            <span class="autocomplete-type-tag" style="color: ${typeColor};">${typeLabel}</span>
                        </div>
                        <div class="autocomplete-actions">
                            <button class="auto-btn auto-include" title="Uwzględnij">✔</button>
                            <button class="auto-btn auto-exclude" title="Wyklucz">✖</button>
                        </div>
                    `;

                    const includeBtn = itemEl.querySelector('.auto-include');
                    const excludeBtn = itemEl.querySelector('.auto-exclude');

                    includeBtn.onclick = (e) => {
                        e.stopPropagation();
                        handleTagSelection(item.value, item.type, 'include');
                    };

                    excludeBtn.onclick = (e) => {
                        e.stopPropagation();
                        handleTagSelection(item.value, item.type, 'exclude');
                    };

                    itemEl.onclick = () => handleTagSelection(item.value, item.type, 'include');

                    autocompleteResults.appendChild(itemEl);
                });
                autocompleteResults.style.display = 'block';

            } else {
                const fallbackEl = document.createElement('div');
                fallbackEl.className = 'autocomplete-item';
                fallbackEl.style.padding = '10px';
                fallbackEl.innerHTML = `Szukaj "<b>${query}</b>"`;
                fallbackEl.onclick = () => handleTagSelection(query, 'search');
                autocompleteResults.appendChild(fallbackEl);
            }

        } catch (error) {
            console.error('Błąd autouzupełniania:', error);
            autocompleteResults.innerHTML = '';
        }
    }

    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length >= 2) {
            debounceTimer = setTimeout(() => fetchAutocomplete(query), 300);
        } else {
            autocompleteResults.innerHTML = '';
            autocompleteResults.style.display = 'none';
        }
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (query) {
                handleTagSelection(query, 'search');
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !autocompleteResults.contains(e.target)) {
            autocompleteResults.innerHTML = '';
            autocompleteResults.style.display = 'none';
        }
    });
}