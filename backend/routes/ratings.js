// backend/routes/ratings.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

router.post('/:id/ratings', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const { score } = req.body;
        const userId = req.user.id;

        // Валидация: Допускаются только конкретные баллы от 0.5 до 5.0
        const validScores = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
        if (!validScores.includes(parseFloat(score))) {
            return res.status(400).json({ error: 'Invalid rating value' });
        }

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

// *** УДАЛЕННЫЙ РОУТ: /track/:trackId (перенесен в trackRatings.js) ***

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

// *** УДАЛЕННЫЙ РОУТ: /album/:albumId/track-ratings (дублируется в trackRatings.js) ***

router.get('/album/:id/stats', async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const [stats] = await pool.execute(
            `SELECT AVG(score) as average_score, COUNT(score) as total_ratings
             FROM ratings
             WHERE album_id = ?`,
            [albumId]
        );
        res.json({
            average_score: stats[0]?.average_score || null,
            total_ratings: stats[0]?.total_ratings || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get album stats' });
    }
});

module.exports = router;