const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// Сохранение оценки трека
router.post('/:trackId', authenticate, async (req, res) => {
    try {
        const { trackId } = req.params;
        const { rating } = req.body;
        const userId = req.user.id;

        await pool.execute(
            `INSERT INTO track_ratings (user_id, track_id, rating)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
            [userId, trackId, rating]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save track rating' });
    }
});

// Получение оценок треков для альбома
router.get('/album/:albumId', authenticate, async (req, res) => {
    try {
        const albumId = parseInt(req.params.albumId);
        const userId = req.user.id;

        // Проверка корректности albumId
        if (isNaN(albumId)) {
            return res.status(400).json({ error: 'Invalid album ID' });
        }

        const [ratings] = await pool.execute(`
            SELECT t.id AS track_id, tr.rating
            FROM tracks t
            LEFT JOIN track_ratings tr ON t.id = tr.track_id AND tr.user_id = ?
            WHERE t.album_id = ?
        `, [userId, albumId]);

        // Преобразуем в объект для быстрого доступа
        const ratingsMap = {};
        ratings.forEach(r => {
            ratingsMap[r.track_id] = r.rating;
        });

        res.json(ratingsMap);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get track ratings' });
    }
});

module.exports = router;