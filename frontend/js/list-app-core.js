// frontend/js/list-app-core.js

const ListApp = {
    // === STAN GLOBALNY ===
    state: {
        currentEntityId: null, // ID encji, którą dodajemy
        currentEntityType: 'album', // Typ encji (album, utwór, artysta, użytkownik)
        currentListSlug: null,
        currentUser: null,
        listId: null,
        listType: null, // Typ aktualnie otwartej listy
        isOwner: false,
        isOrderModified: false,
        currentSortMethod: 'added_desc', // domyślnie: dodane malejąco
    },

    // === NARZĘDZIA ===
    utils: {
        getCurrentUser() {
            const token = localStorage.getItem('token');
            if (!token) return null;
            try {
                return JSON.parse(atob(token.split('.')[1]));
            } catch (e) {
                return null;
            }
        },

        async fetchAPI(url, options = {}) {
            const token = localStorage.getItem('token');
            const headers = { 'Content-Type': 'application/json', ...options.headers };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(url, { ...options, headers });

            if (!response.ok) {
                const isJson = response.headers.get('content-type')?.includes('application/json');
                let data;

                try {
                    data = await (isJson ? response.json() : response.text());
                } catch(e) {
                    data = `Błąd odczytu odpowiedzi z serwera. Status: ${response.status}`;
                }

                if (response.status === 401) localStorage.removeItem('token');

                const errorMessage = isJson
                    ? (data.error || data.message || `Błąd ${response.status}`)
                    : `Błąd API: ${response.status} ${response.statusText}`;

                throw new Error(errorMessage);
            }

            return response.json();
        },

        toast(msg, type = 'success') {
            const existing = document.querySelectorAll('.global-message');
            existing.forEach(el => el.remove());

            const div = document.createElement('div');
            div.textContent = msg;
            div.className = `global-message ${type === 'error' ? 'error' : 'success'}`;
            div.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                padding: 12px 24px; border-radius: 8px; 
                color: ${type === 'error' ? '#ff4d4d' : '#2ecc71'};
                background: ${type === 'error' ? '#330000' : '#002200'};
                border: 1px solid currentColor; font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 9999;
            `;
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 4000);
        }
    },

    // === KONTROLA MODALI (Wypełniane przez list-app-modal.js) ===
    modal: {}
};

window.ListApp = ListApp;