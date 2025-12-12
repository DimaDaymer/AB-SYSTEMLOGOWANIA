// frontend/js/charts/handleAlbumAction.js

/**
 * Показывает временное сообщение об успехе или ошибке.
 * @param {string} msg - Сообщение.
 * @param {boolean} [isError=false] - Флаг ошибки.
 */
function showMessage(msg, isError = false) {
    const msgEl = document.createElement('div');
    msgEl.textContent = msg;
    msgEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        background: ${isError ? '#ffdddd' : '#ddffdd'};
        color: ${isError ? '#ff0000' : '#008800'};
        border: 1px solid ${isError ? '#ff0000' : '#008800'};
        border-radius: 5px;
        z-index: 2000;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(msgEl);
    setTimeout(() => msgEl.remove(), 3000);
}

/**
 * Обрабатывает клик по кнопке действия (Like, Listen, Wishlist).
 * @param {Event} e - Объект события клика.
 */
export async function handleAlbumAction(e) {
    e.stopPropagation();

    const button = e.target.closest('.action-button');
    if (!button) return;

    const albumId = button.dataset.albumId;
    const actionType = button.dataset.action;

    // ВАЖНОЕ ИСПРАВЛЕНИЕ: Проверка на пустой ID или строковое 'undefined'
    if (!albumId || albumId === 'undefined') {
        console.error("Action failed: Album ID is missing or invalid.");
        showMessage('Error: Album ID missing. Cannot perform action.', true);
        return;
    }

    button.disabled = true;

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage('Please log in first', true);
            button.disabled = false;
            return;
        }

        const url = '/api/actions';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ albumId, actionType })
        });

        if (!res.ok) throw new Error('Action failed');
        const data = await res.json();

        // 1. СИНХРОНИЗАЦИЯ КНОПКИ (Active State)
        if (data.active !== undefined) {
            if (data.active) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        } else {
            button.classList.toggle('active');
        }

        // 2. ОБНОВЛЕНИЕ СЧЕТЧИКА В ИНТЕРФЕЙСЕ (если применимо)
        // Логика обновления счетчиков, как в чартах, сохранена для унификации
        const card = button.closest('.album-card');
        if (card) {
            let titleAttr = '';
            let iconChar = '';

            if (actionType === 'like') { titleAttr = 'Likes'; iconChar = '❤️'; }
            else if (actionType === 'wishlist') { titleAttr = 'Wishlist'; iconChar = '⭐'; }
            else if (actionType === 'listen') { titleAttr = 'Listens'; iconChar = '🎧'; }

            if (titleAttr) {
                const countSpan = card.querySelector(`.rating-info span[title="${titleAttr}"]`);

                if (countSpan) {
                    const currentText = countSpan.textContent;
                    const match = currentText.match(/(\d+)/);
                    let count = match ? parseInt(match[0].replace(/,/g, '')) : 0;

                    if (data.active) {
                        count++;
                    } else {
                        count = Math.max(0, count - 1);
                    }

                    countSpan.textContent = `${iconChar} ${count.toLocaleString()} ${titleAttr}`;
                }
            }
        }

        showMessage(data.message);

    } catch (error) {
        console.error('Action error:', error);
        showMessage(error.message || 'An unknown error occurred', true);
    } finally {
        button.disabled = false;
    }
}