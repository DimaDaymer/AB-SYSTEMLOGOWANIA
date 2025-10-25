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

router.post('/track/:trackId', authenticate, async (req, res) => {
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

router.get('/album/:albumId/track-ratings', authenticate, async (req, res) => {
    try {
        const { albumId } = req.params;
        const userId = req.user.id;

        const [ratings] = await pool.execute(`
            SELECT t.id AS track_id, tr.rating
            FROM tracks t
                     LEFT JOIN track_ratings tr ON t.id = tr.track_id AND tr.user_id = ?
            WHERE t.album_id = ?
        `, [userId, albumId]);

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