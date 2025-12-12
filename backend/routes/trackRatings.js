// routes/trackRatings.js
const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware');

module.exports = (pool) => {

    // === ФУНКЦИЯ ОБНОВЛЕНИЯ СТАТИСТИКИ ТРЕКА ===
    // ИСПРАВЛЕНО: Использование INSERT...SELECT для надежного расчета и обновления.
    async function updateTrackStats(targetTrackId) {
        let connection = null;
        try {
            connection = await pool.getConnection();
            await connection.query(`
                INSERT INTO track_stats (track_id, ratings_count, avg_score)
                SELECT
                    ? AS track_id,
                    COUNT(tr.score) AS ratings_count,
                    COALESCE(AVG(tr.score), 0) AS avg_score
                FROM tracks t
                         LEFT JOIN track_ratings tr ON t.id = tr.track_id
                WHERE t.id = ?
                GROUP BY t.id
                ON DUPLICATE KEY UPDATE
                                     ratings_count = VALUES(ratings_count),
                                     avg_score = VALUES(avg_score),
                                     last_updated = CURRENT_TIMESTAMP
            `, [targetTrackId, targetTrackId]);

        } catch (err) {
            console.error("Track Stats update failed:", err);
        } finally {
            if (connection) connection.release();
        }
    }


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

            // 1. Обновляем статистику трека
            await updateTrackStats(trackId);

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

            // 2. Обновляем статистику трека
            await updateTrackStats(trackId);

            res.json({ success: true, message: 'Rating deleted' });
        } catch (err) {
            console.error('DELETE /track-ratings error:', err);
            res.status(500).json({ error: 'Failed to delete track rating' });
        }
    });


    // GET (Получение оценок текущего пользователя для альбома)
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
            console.error('GET /track-ratings/album error:', err);
            res.status(500).json({ error: 'Failed to get user track ratings' });
        }
    });

    // НОВЫЙ МАРШРУТ: GET (Получение средней оценки для всех треков альбома)
    router.get('/album/:albumId/stats', async (req, res) => {
        try {
            const albumId = parseInt(req.params.albumId);

            if (isNaN(albumId)) {
                return res.status(400).json({ error: 'Invalid album ID' });
            }

            // Получаем статистику для всех треков в альбоме
            const [stats] = await pool.execute(`
                SELECT t.id AS track_id, ts.avg_score, ts.ratings_count
                FROM tracks t
                         LEFT JOIN track_stats ts ON t.id = ts.track_id
                WHERE t.album_id = ?
            `, [albumId]);

            const statsMap = {};
            stats.forEach(s => {
                statsMap[s.track_id] = {
                    avg_score: s.avg_score ? parseFloat(s.avg_score).toFixed(2) : '0.00',
                    ratings_count: s.ratings_count || 0
                };
            });

            res.json(statsMap);
        } catch (err) {
            console.error('GET /track-ratings/album/stats error:', err);
            res.status(500).json({ error: 'Failed to get track stats' });
        }
    });

    return router;
};