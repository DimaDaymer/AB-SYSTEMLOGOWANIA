// frontend/js/autocomplete.js - Универсальный класс для автодополнения

class Autocomplete {
    constructor(inputElement, suggestionsContainer, apiEndpoint, debounceDelay = 300) {
        this.input = inputElement;
        this.suggestions = suggestionsContainer;
        this.apiEndpoint = apiEndpoint;
        this.debounceDelay = debounceDelay;
        this.debounceTimer = null;
        this.setupListeners();
    }

    setupListeners() {
        this.input.addEventListener('input', this.handleInput.bind(this));
        this.suggestions.addEventListener('click', this.handleSelection.bind(this));

        // Скрытие при клике вне области
        document.addEventListener('click', (e) => {
            if (e.target !== this.input && !this.suggestions.contains(e.target)) {
                this.suggestions.style.display = 'none';
            }
        });

        // Показываем предложения при фокусе, если есть результаты
        this.input.addEventListener('focus', () => {
            if (this.suggestions.children.length > 0) {
                this.suggestions.style.display = 'block';
            }
        });
    }

    handleInput() {
        clearTimeout(this.debounceTimer);
        const query = this.input.value.trim();

        if (query.length < 2) {
            this.suggestions.innerHTML = '';
            this.suggestions.style.display = 'none';
            return;
        }

        this.debounceTimer = setTimeout(() => this.fetchSuggestions(query), this.debounceDelay);
    }

    async fetchSuggestions(query) {
        try {
            // Используем Fetch API для получения предложений
            const res = await fetch(`${this.apiEndpoint}?q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error('Network response was not ok');

            const data = await res.json();
            this.renderSuggestions(data);

        } catch (error) {
            console.error('Autocomplete fetch error:', error);
            this.suggestions.innerHTML = '';
            this.suggestions.style.display = 'none';
        }
    }

    renderSuggestions(data) {
        this.suggestions.innerHTML = '';
        if (data.length > 0) {
            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.textContent = item;
                // Стилизацию лучше перенести в CSS
                div.style.padding = '5px 8px';
                div.style.cursor = 'pointer';
                div.onmouseover = () => { div.style.backgroundColor = '#444'; }; // Dark theme hover
                div.onmouseout = () => { div.style.backgroundColor = 'transparent'; };

                this.suggestions.appendChild(div);
            });
            this.suggestions.style.display = 'block';
        } else {
            this.suggestions.style.display = 'none';
        }
    }

    handleSelection(e) {
        if (e.target.classList.contains('suggestion-item')) {
            this.input.value = e.target.textContent;
            this.suggestions.style.display = 'none';
        }
    }
}

// Экспортируем для использования в других модулях (например, members.js)
window.Autocomplete = Autocomplete;