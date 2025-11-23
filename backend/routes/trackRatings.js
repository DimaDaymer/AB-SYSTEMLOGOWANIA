// routes/trackRatings.js
const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware');

module.exports = (pool) => {

    // POST (Создание / Обновление)
    router.post('/:trackId', authenticate, async (req, res) => {
        try {
            const { trackId } = req.params;
            const { rating } = req.body;
            const userId = req.user.id;

            const scoreValue = parseFloat(rating);

            if (isNaN(scoreValue) || scoreValue < 0.5 || scoreValue > 5.0) {
                return res.status(400).json({ error: 'Score must be between 0.5 and 5.0.' });
            }

            await pool.execute(
                `INSERT INTO track_ratings (user_id, track_id, score)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE score = VALUES(score)`,
                [userId, trackId, scoreValue]
            );

            res.json({ success: true });
        } catch (err) {
            console.error('POST /track-ratings error:', err);
            res.status(500).json({ error: 'Failed to save track rating' });
        }
    });

    // DELETE (Удаление)
    router.delete('/:trackId', authenticate, async (req, res) => {
        try {
            const { trackId } = req.params;
            const userId = req.user.id;

            await pool.execute(
                `DELETE FROM track_ratings WHERE user_id = ? AND track_id = ?`,
                [userId, trackId]
            );

            res.json({ success: true, message: 'Rating deleted' });
        } catch (err) {
            console.error('DELETE /track-ratings error:', err);
            res.status(500).json({ error: 'Failed to delete track rating' });
        }
    });


    // GET (Получение оценок для альбома)
    router.get('/album/:albumId', authenticate, async (req, res) => {
        try {
            const albumId = parseInt(req.params.albumId);
            const userId = req.user.id;

            if (isNaN(albumId)) {
                return res.status(400).json({ error: 'Invalid album ID' });
            }

            const [ratings] = await pool.execute(`
                SELECT t.id AS track_id, tr.score
                FROM tracks t
                         LEFT JOIN track_ratings tr ON t.id = tr.track_id AND tr.user_id = ?
                WHERE t.album_id = ?
            `, [userId, albumId]);

            const ratingsMap = {};
            ratings.forEach(r => {
                if (r.score !== null) {
                    ratingsMap[r.track_id] = parseFloat(r.score);
                }
            });

            res.json(ratingsMap);
        } catch (err) {
            console.error('GET /track-ratings error:', err);
            res.status(500).json({ error: 'Failed to get track ratings' });
        }
    });

    return router;
};