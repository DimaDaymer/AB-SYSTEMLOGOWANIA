// frontend/js/tracks-chart/handleTrackAction.js

export async function handleTrackAction(event) {
    const button = event.currentTarget;
    const trackId = button.dataset.id;
    const token = localStorage.getItem('token');

    if (!token) {
        alert('Please login to perform this action.');
        return;
    }

    // Пример логики для лайка (адаптировать под реальный API endpoint)
    // Предполагаем, что есть endpoint /api/actions/track/like
    try {
        const response = await fetch('/api/actions/track/like', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ trackId })
        });

        if (response.ok) {
            button.classList.toggle('active');
            // Опционально: обновить счетчик лайков
            alert('Track liked!');
        } else {
            console.error('Action failed');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}