// backend/routes/ratings.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// Отправка оценки
router.post('/:id/ratings', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const { score } = req.body;
        const userId = req.user.id;

        // Исправленный запрос с правильным типом данных
        const [result] = await pool.execute(
            `INSERT INTO ratings (user_id, album_id, score)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score)`,
            [userId, albumId, score]
        );

        res.json({ message: 'Rating saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save rating: ' + err.message });
    }
});

// Получение оценки пользователя
router.get('/:id/user-rating', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const userId = req.user.id;

        const [rating] = await pool.execute(
            `SELECT score FROM ratings 
       WHERE album_id = ? AND user_id = ?`,
            [albumId, userId]
        );

        res.json({ score: rating[0]?.score || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get user rating' });
    }
});

module.exports = router;