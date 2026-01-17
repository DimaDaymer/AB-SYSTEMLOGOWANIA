document.addEventListener('DOMContentLoaded', () => {
    const navbarContainer = document.getElementById('navbar-container') || document.getElementById('navbar-placeholder');
    if (!navbarContainer) return;

    fetch('/navbar.html')
        .then(res => res.text())
        .then(html => {
            navbarContainer.innerHTML = html;
            setupNavbarInteractions();
            initSearchLogic();
            highlightActiveLink();
        })
        .catch(err => console.error("Navbar loading error:", err));
});

function initSearchLogic() {
    const searchInput = document.getElementById('navbar-search');
    const searchDropdown = document.getElementById('search-dropdown');
    const searchBtn = document.querySelector('.search-toggle-button');
    let debounceTimer;

    if (!searchInput || !searchDropdown) return;

    // Функция выполнения перехода на страницу поиска
    const goToSearchPage = (query) => {
        if (query.trim()) {
            window.location.href = `/search.html?q=${encodeURIComponent(query.trim())}`;
        }
    };

    // 1. Ввод текста и автокомплит
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            searchDropdown.classList.remove('show');
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
                const items = await response.json();
                renderNavbarSuggestions(items, query, searchDropdown);
            } catch (err) {
                console.error("Autocomplete fetch error", err);
            }
        }, 300);
    });

    // 2. Нажатие Enter
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            goToSearchPage(searchInput.value);
        }
    });

    // 3. Клик по кнопке лупы (если поле уже активно - ищем)
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (searchInput.classList.contains('active') && searchInput.value.length > 0) {
                goToSearchPage(searchInput.value);
            }
        });
    }
}

function renderNavbarSuggestions(items, query, container) {
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `<div class="suggestion-item">No results for "${query}"</div>`;
    } else {
        items.forEach(item => {
            const div = document.createElement('a');
            div.className = 'suggestion-item';

            // 1. Ссылки
            let link = '#';
            if (item.type === 'artist') link = `/artist.html?slug=${item.slug}`;
            else if (item.type === 'album') link = `/release/album/${item.slug}`;
            else if (item.type === 'track') link = `/track/${item.slug}`;
            else if (item.type === 'user') link = `/user/${item.title}`; // Используем title (там username)
            else if (item.type === 'list') link = `/list.html?slug=${item.slug}`;
            div.href = link;

            // 2. Логика выбора картинки (согласно новым полям из API)
            let imgUrl = '/img/default-artist.png';
            if (item.type === 'artist') {
                imgUrl = item.picture_url || imgUrl;
            } else if (item.type === 'user') {
                imgUrl = item.profile_pic || imgUrl;
            } else {
                // Альбомы, Треки и Списки используют cover_url
                imgUrl = item.cover_url || imgUrl;
            }

            // 3. Класс для круглых аватарок
            const imgClass = (item.type === 'artist' || item.type === 'user')
                ? 'suggestion-img round'
                : 'suggestion-img';

            const displayName = item.title || 'Unknown';

            div.innerHTML = `
                <img src="${imgUrl}" class="${imgClass}" onerror="this.src='/img/default-artist.png'">
                <div class="suggestion-info">
                    <div class="suggestion-title">${highlightMatch(displayName, query)}</div>
                    <div class="suggestion-type">${item.type}</div>
                </div>
            `;
            container.appendChild(div);
        });

        const seeAll = document.createElement('a');
        seeAll.className = 'suggestion-item see-all';
        seeAll.href = `/search.html?q=${encodeURIComponent(query)}`;
        seeAll.innerHTML = `<strong>See all results for "${query}"</strong>`;
        container.appendChild(seeAll);
    }
    container.classList.add('show');
}

function highlightMatch(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, `<span class="highlight">$1</span>`);
}

function highlightActiveLink() {
    console.log("Highlighting active link...");
}

function setupNavbarInteractions() {
    // Код для открытия/закрытия выпадающих списков (профиль, поиск)
    const profileBtn = document.querySelector('.profile-toggle-button');
    const profileDropdown = document.querySelector('.dropdown-content');
    const searchBtn = document.querySelector('.search-toggle-button');
    const searchInput = document.getElementById('navbar-search');
    const searchDropdown = document.getElementById('search-dropdown');
    const profileLink = document.getElementById('nav-profile-link');
    const logoutBtn = document.getElementById('logout-button');
    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('show');
            if (searchDropdown) searchDropdown.classList.remove('show');
        });
    }

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchInput.classList.toggle('active');
            if (searchInput.classList.contains('active')) searchInput.focus();
        });
    }
// 1. Установка правильной ссылки на профиль
    if (profileLink) {
        // Предположим, вы сохраняете имя пользователя в localStorage при входе
        const username = localStorage.getItem('username');

        if (username) {
            profileLink.href = `/user/${username}`;
        } else {
            // Если пользователя нет (не залогинен), можно скрыть ссылку
            // или отправить на страницу логина
            profileLink.href = '/login.html';
            profileLink.textContent = 'Zaloguj się';
        }
    }

    // 2. Логика выхода (уже есть у вас, убедитесь, что чистите всё)
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('username'); // Не забудьте удалить и это
            localStorage.removeItem('role');
            window.location.href = '/login.html';
        });
    }

    document.addEventListener('click', () => {
        if (profileDropdown) profileDropdown.classList.remove('show');
        if (searchDropdown) searchDropdown.classList.remove('show');
    });

}