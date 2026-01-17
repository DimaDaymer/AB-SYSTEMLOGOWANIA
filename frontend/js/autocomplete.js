// frontend/js/autocomplete.js - Uniwersalna klasa do autouzupełniania

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

        // Ukrywanie po kliknięciu poza obszarem
        document.addEventListener('click', (e) => {
            if (e.target !== this.input && !this.suggestions.contains(e.target)) {
                this.suggestions.style.display = 'none';
            }
        });

        // Pokazywanie sugestii przy ustawieniu fokusu, jeśli są wyniki
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
            // Używamy Fetch API do pobierania sugestii
            const res = await fetch(`${this.apiEndpoint}?q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error('Odpowiedź sieciowa nie była poprawna');

            const data = await res.json();
            this.renderSuggestions(data);

        } catch (error) {
            console.error('Błąd pobierania autouzupełniania:', error);
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
                // Stylizację najlepiej przenieść do pliku CSS
                div.style.padding = '5px 8px';
                div.style.cursor = 'pointer';
                div.onmouseover = () => { div.style.backgroundColor = '#444'; }; // Najechanie kursorem (ciemny motyw)
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

// Eksportujemy do użytku w innych modułach (np. members.js)
window.Autocomplete = Autocomplete;