// /js/ratedAlbumsHistogram.js

/**
 * Загружает и отображает гистограмму оценок для Rated Albums.
 * @param {string} tabId - ID вкладки ('recent' в данном случае).
 */
window.loadRatedAlbumsHistogram = async (tabId) => {
    const container = document.getElementById('rating-histogram');
    if (!container) return;

    // 1. Получение данных гистограммы (предполагаем, что нужен новый API роут)
    // --- ДОБАВЬТЕ ЭТОТ API РОУТ НА БЭКЕНДЕ ---
    const apiUrl = profileContext.getApiUrl('ratings-histogram');

    try {
        const response = await fetch(apiUrl, {
            headers: { 'Authorization': `Bearer ${profileContext.token}` }
        });

        if (!response.ok) {
            container.innerHTML = `<div style="color:red;padding:10px;">Error loading histogram data.</div>`;
            return;
        }

        const data = await response.json();

        // Ожидаемый формат data: { '5.0': 15, '4.5': 20, '4.0': 35, ... }

        // 2. Очистка и подготовка
        container.innerHTML = '';
        const ratings = Object.keys(data).filter(r => r !== 'total').sort((a, b) => parseFloat(a) - parseFloat(b));
        const maxCount = ratings.reduce((max, rating) => Math.max(max, data[rating]), 0);

        // 3. Рендеринг баров гистограммы
        for (const rating of ratings) {
            const count = data[rating];
            const widthPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;

            const barWrapper = document.createElement('div');
            barWrapper.className = 'rating-bar-wrapper';
            barWrapper.dataset.rating = rating;

            barWrapper.innerHTML = `
                <span class="rating-label">${rating}</span>
                <div class="rating-bar" title="${count} albums">
                    <div class="bar-fill" style="width: ${widthPercent}%;">
                        <span class="bar-count">${count}</span>
                    </div>
                </div>
            `;

            // 4. Добавление обработчика клика
            barWrapper.addEventListener('click', () => {
                // Вызываем функцию для загрузки отфильтрованного списка альбомов
                // Предполагаем, что функция loadRatedAlbums теперь может принимать параметр ratingFilter
                loadRatedAlbums(1, rating);

                // Снимаем активность со всех баров и устанавливаем на текущий
                document.querySelectorAll('.rating-bar-wrapper').forEach(b => b.classList.remove('active'));
                barWrapper.classList.add('active');
            });

            container.prepend(barWrapper); // Добавляем в начало, т.к. flex-direction: column-reverse
        }

        // Если нужно, добавить логику сброса фильтра, если нет активного бара

    } catch (err) {
        console.error("Error in loadRatedAlbumsHistogram:", err);
        container.innerHTML = `<div style="color:red;padding:10px;">Failed to load ratings data.</div>`;
    }
};

