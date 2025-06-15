//backend/routes/ratings.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Деструктуризация pool
const authenticate = require('../authMiddleware');

// Отправка оценки
router.post('/:id/ratings', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const { score } = req.body;
        const userId = req.user.id;

        const [result] = await db.execute(
            `INSERT INTO ratings (user_id, album_id, score)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score)`,
            [userId, albumId, score]
        );

        res.json({ message: 'Оценка сохранена' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сохранения оценки' });
    }
});

// Получение средней оценки
router.get('/:id/ratings', async (req, res) => {
    try {
        const { id: albumId } = req.params;

        const [avg] = await db.execute(
            `SELECT 
        AVG(score) as average, 
        COUNT(*) as count 
       FROM ratings 
       WHERE album_id = ?`,
            [albumId]
        );

        res.json({
            average: Number(avg[0].average).toFixed(1),
            count: avg[0].count
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения оценок' });
    }
});
// Получение распределения оценок
router.get('/:id/distribution', async (req, res) => {
    try {
        const { id: albumId } = req.params;

        const [distribution] = await db.execute(
            `SELECT score, COUNT(*) as count 
             FROM ratings 
             WHERE album_id = ?
             GROUP BY score
             ORDER BY score DESC`,
            [albumId]
        );

        res.json(distribution);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения распределения оценок' });
    }
});

// Получение оценки пользователя
router.get('/:id/user-rating', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const userId = req.user.id;

        const [rating] = await db.execute(
            `SELECT score 
             FROM ratings 
             WHERE album_id = ? AND user_id = ?`,
            [albumId, userId]
        );

        res.json({ score: rating[0]?.score || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения оценки пользователя' });
    }
});
module.exports = router;