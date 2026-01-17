// backend/routes/trackRatings.js
const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware');

module.exports = (pool) => {

    // Helper: Aktualizacja statystyk utworu wewnątrz transakcji
    const updateTrackStatsInTransaction = async (connection, trackId) => {
        await connection.execute(`
            INSERT INTO tracks_stats (track_id, ratings_count, avg_score)
            SELECT 
                ? as track_id,
                (SELECT COUNT(*) FROM track_ratings WHERE track_id = ?) as ratings_count,
                (SELECT COALESCE(AVG(score), 0) FROM track_ratings WHERE track_id = ?) as avg_score
            ON DUPLICATE KEY UPDATE 
                ratings_count = VALUES(ratings_count),
                avg_score = VALUES(avg_score)
        `, [trackId, trackId, trackId]);
    };

    // --- ROUTES ---

    // 1. Statystyki wszystkich utworów w albumie (Bulk Read)
    router.get('/album/:albumId/stats', async (req, res) => {
        try {
            const { albumId } = req.params;
            const [rows] = await pool.execute(`
                SELECT ts.track_id, ts.avg_score, ts.ratings_count
                FROM tracks_stats ts
                JOIN tracks t ON ts.track_id = t.id
                WHERE t.album_id = ?
            `, [albumId]);

            const statsMap = {};
            rows.forEach(row => {
                statsMap[row.track_id] = {
                    avg_score: row.avg_score ? parseFloat(row.avg_score).toFixed(2) : '0.00',
                    ratings_count: row.ratings_count || 0
                };
            });
            res.json(statsMap);
        } catch (err) {
            console.error("[Track Stats Error]:", err);
            res.status(500).json({ error: 'Nie udało się załadować ocen utworów' });
        }
    });

    // 2. Oceny użytkownika dla wszystkich utworów w albumie (Bulk Read)
    router.get('/album/:albumId/user-scores', authenticate, async (req, res) => {
        try {
            const { albumId } = req.params;
            const userId = req.user.id;

            const [rows] = await pool.execute(`
                SELECT tr.track_id, tr.score
                FROM track_ratings tr
                JOIN tracks t ON tr.track_id = t.id
                WHERE t.album_id = ? AND tr.user_id = ?
            `, [albumId, userId]);

            const userScores = {};
            rows.forEach(r => userScores[r.track_id] = parseFloat(r.score));
            res.json(userScores);
        } catch (err) {
            console.error("[User Track Scores Error]:", err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 3. Statystyki pojedynczego utworu
    router.get('/:trackId/stats', async (req, res) => {
        try {
            const { trackId } = req.params;
            const [rows] = await pool.execute('SELECT avg_score, ratings_count FROM tracks_stats WHERE track_id = ?', [trackId]);

            const s = rows[0] || { avg_score: 0, ratings_count: 0 };
            res.json({
                avg_score: s.avg_score ? parseFloat(s.avg_score).toFixed(2) : '0.00',
                ratings_count: s.ratings_count || 0
            });
        } catch (err) {
            res.status(500).json({ error: 'Nie udało się pobrać statystyk' });
        }
    });

    // 4. Ocena użytkownika dla jednego utworu
    router.get('/:trackId/user-rating', authenticate, async (req, res) => {
        try {
            const { trackId } = req.params;
            const userId = req.user.id;

            const [rows] = await pool.execute('SELECT score FROM track_ratings WHERE user_id = ? AND track_id = ?', [userId, trackId]);

            res.json({ score: rows[0] ? parseFloat(rows[0].score) : null });
        } catch (err) {
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 5. Wystaw ocenę (Zoptymalizowane transakcją)
    router.post('/:trackId', authenticate, async (req, res) => {
        let connection = null;
        try {
            const { trackId } = req.params;
            const userId = req.user.id;

            let rawScore = req.body.score !== undefined ? req.body.score : req.body.rating;
            const scoreVal = parseFloat(rawScore);

            if (isNaN(scoreVal) || scoreVal < 0.5 || scoreVal > 5.0) {
                return res.status(400).json({ error: 'Nieprawidłowa ocena' });
            }

            // Rozpoczynamy transakcję
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 1. Zapis oceny
            await connection.execute(`
                INSERT INTO track_ratings (user_id, track_id, score) VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE score = VALUES(score)
            `, [userId, trackId, scoreVal]);

            // 2. Aktualizacja statystyk
            await updateTrackStatsInTransaction(connection, trackId);

            await connection.commit();

            res.json({ message: 'Ocena została zapisana', score: scoreVal });
        } catch (err) {
            if (connection) await connection.rollback();
            console.error("[Track Rating Error]:", err);
            res.status(500).json({ error: 'Nie udało się zapisać oceny' });
        } finally {
            if (connection) connection.release();
        }
    });

    // 6. Usuń ocenę (Zoptymalizowane transakcją)
    router.delete('/:trackId', authenticate, async (req, res) => {
        let connection = null;
        try {
            const { trackId } = req.params;
            const userId = req.user.id;

            connection = await pool.getConnection();
            await connection.beginTransaction();

            await connection.execute('DELETE FROM track_ratings WHERE user_id = ? AND track_id = ?', [userId, trackId]);

            await updateTrackStatsInTransaction(connection, trackId);

            await connection.commit();
            res.json({ message: 'Ocena została usunięta' });
        } catch (err) {
            if (connection) await connection.rollback();
            console.error("[Track Delete Error]:", err);
            res.status(500).json({ error: 'Nie udało się usunąć oceny' });
        } finally {
            if (connection) connection.release();
        }
    });

    // 7. Histogram
    router.get('/:trackId/histogram', async (req, res) => {
        try {
            const { trackId } = req.params;
            const [rows] = await pool.execute(`
                SELECT score, COUNT(*) as count FROM track_ratings
                WHERE track_id = ? GROUP BY score ORDER BY score DESC
            `, [trackId]);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: 'Nie udało się załadować histogramu' });
        }
    });

    return router;
};