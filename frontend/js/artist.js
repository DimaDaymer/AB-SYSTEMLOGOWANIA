// frontend/js/artist.js

// Вспомогательная функция для рендеринга карточки альбома
function createAlbumCard(album) {
    const rating = parseFloat(album.average_rating);

    // Форматирование рейтинга с цветом
    const ratingHtml = !isNaN(rating) && rating > 0 ?
        `<span class="album-rating">${rating.toFixed(2)}</span>` :
        `<span class="album-no-rating">N/A</span>`;

    const year = album.release_date ? new Date(album.release_date).getFullYear() : 'N/A';

    // Обновленная структура HTML для соответствия дизайну (Картинка + Подпись снизу)
    return `
        <div class="album-card-wrapper">
            <a href="album.html?slug=${album.slug}" class="album-link">
                <img src="${album.cover_url || '/public/placeholder.png'}" alt="${album.title} cover" class="album-cover">
                <div class="album-info-block">
                    <p class="album-title" title="${album.title}">${album.title}</p>
                    <div class="album-meta-row">
                        <span class="album-year">${year}</span>
                        ${ratingHtml}
                    </div>
                </div>
            </a>
        </div>
    `;
}

// Функция рендеринга дискографии
function renderDiscography(discography) {
    const listContainer = document.getElementById('discography-list');
    listContainer.innerHTML = '';

    // Порядок отображения типов альбомов
    const typeOrder = ['Studio Album', 'EP', 'Single', 'Live Album', 'Compilation', 'Other'];

    // Получаем и сортируем ключи, используя typeOrder
    const sortedTypes = Object.keys(discography).sort((a, b) => {
        const indexA = typeOrder.indexOf(a);
        const indexB = typeOrder.indexOf(b);
        // Если тип не найден, помещаем его в конец
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    sortedTypes.forEach(type => {
        const albums = discography[type];
        if (albums && albums.length > 0) {
            const section = document.createElement('section');
            section.className = 'discography-section';

            // Сортируем альбомы по году выпуска в обратном порядке
            albums.sort((a, b) => (b.release_date || '0').localeCompare(a.release_date || '0'));

            section.innerHTML = `
                <h3 class="discography-type-title">${type} (${albums.length})</h3>
                <div class="album-grid-container">
                    ${albums.map(createAlbumCard).join('')}
                </div>
            `;
            listContainer.appendChild(section);
        }
    });

    if (listContainer.innerHTML === '') {
        listContainer.innerHTML = '<p style="color: #888;">Дискография не найдена.</p>';
    }
}

// Главная функция загрузки данных исполнителя
async function loadArtistData() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');

    if (!slug) {
        // Предполагается, что window.showMessage определена в common.js
        if(window.showMessage) window.showMessage('Error: Artist slug not provided in URL.', true);
        document.getElementById('artist-name').textContent = 'Artist Not Found';
        return;
    }

    try {
        const response = await fetch(`/api/artists/${slug}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        const artist = data.artist;

        // 1. Рендеринг основной информации
        document.getElementById('artist-name').textContent = artist.name;
        document.getElementById('artist-picture').src = artist.picture_url || '/public/placeholder_artist.png';

        // Формируем строку Страна | Год основания
        const countryText = artist.origin_country || 'Unknown origin';
        const formedText = artist.formed_year ? `Formed: ${artist.formed_year}` : '';
        document.getElementById('artist-country').textContent = countryText;
        document.getElementById('artist-formed-year').textContent = artist.formed_year ? ` • ${formedText}` : '';


        document.getElementById('artist-albums-count').textContent = `${artist.albums_count || 0} Albums`;
        document.getElementById('artist-followers-count').textContent = `${artist.followers_count || 0} Followers`;

        document.getElementById('artist-description').textContent = artist.description || 'Описание пока отсутствует.';

        // Рендеринг жанров
        const genresContainer = document.getElementById('artist-genres');
        genresContainer.innerHTML = (artist.genres_main || '')
            .split(',')
            .map(g => g.trim())
            .filter(g => g)
            .map(g => `<span class="artist-genre-tag">${g}</span>`)
            .join('');

        // Рендеринг баннера
        const bannerOverlay = document.getElementById('artist-banner-overlay');
        if (artist.banner_url) {
            bannerOverlay.style.backgroundImage = `url('${artist.banner_url}')`;
        } else if (artist.picture_url) {
            // Используем основное фото, если нет баннера
            bannerOverlay.style.backgroundImage = `url('${artist.picture_url}')`;
        }

        // 2. Рендеринг дискографии
        renderDiscography(data.discography);

        // 3. Настройка переключения вкладок
        setupTabSwitching();

    } catch (error) {
        if(window.showMessage) window.showMessage(`Failed to load artist: ${error.message}`, true);
        document.getElementById('artist-name').textContent = 'Artist Not Found';
        console.error('Artist loading error:', error);
    }
}

function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Сброс активного состояния кнопок
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Переключение контента
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', loadArtistData);