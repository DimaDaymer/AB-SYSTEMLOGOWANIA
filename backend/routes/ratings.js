// backend/routes/ratings.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// === ФУНКЦИЯ ОБНОВЛЕНИЯ СТАТИСТИКИ И РАНГОВ ===
async function updateStatsAndRanks(targetAlbumId) {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Обновляем статистику ЦЕЛЕВОГО альбома (того, кому поставили оценку)
        // Используем ON DUPLICATE KEY, чтобы не упало, если строки еще нет (хотя триггер должен был создать)
        await connection.query(`
            UPDATE album_stats ast
            JOIN (
                SELECT COUNT(*) as cnt, AVG(score) as avg_sc 
                FROM ratings WHERE album_id = ?
            ) r_data
            SET 
                ast.ratings_count = COALESCE(r_data.cnt, 0), 
                ast.avg_score = COALESCE(r_data.avg_sc, 0)
            WHERE ast.album_id = ?
        `, [targetAlbumId, targetAlbumId]);

        // 2. Пересчитываем РАНГИ ГЛОБАЛЬНО (для всех)
        // ВАЖНО: Мы используем подзапрос для вычисления ранга.
        // RANK() OVER (ORDER BY avg_score DESC, ratings_count DESC)
        // Это обеспечит, что 4.75 будет выше 3.50.

        await connection.query(`
            UPDATE album_stats ast
            JOIN (
                SELECT album_id, 
                RANK() OVER (ORDER BY avg_score DESC, ratings_count DESC, album_id ASC) as new_rank
                FROM album_stats
                WHERE avg_score > 0
            ) as ranked ON ast.album_id = ranked.album_id
            SET 
                ast.current_rank = ranked.new_rank, 
                ast.chart_slug = 'all-time-top'
        `);

        // 3. Сбрасываем ранг у тех, у кого нет оценок (на всякий случай)
        await connection.query(`
            UPDATE album_stats SET current_rank = NULL, chart_slug = NULL WHERE avg_score = 0
        `);

        await connection.commit();
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Auto-rank update failed:", err);
    } finally {
        if (connection) connection.release();
    }
}
router.post('/:id/ratings', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const { score } = req.body;
        const userId = req.user.id;
        // ... валидация ...
        await pool.execute(`INSERT INTO ratings (user_id, album_id, score) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE score = VALUES(score)`, [userId, albumId, score]);

        updateStatsAndRanks(albumId); // ВЫЗОВ ОБНОВЛЕНИЯ

        res.json({ message: 'Rating saved' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/:id/ratings', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const userId = req.user.id;
        await pool.execute('DELETE FROM ratings WHERE user_id = ? AND album_id = ?', [userId, albumId]);

        updateStatsAndRanks(albumId); // ВЫЗОВ ОБНОВЛЕНИЯ

        res.json({ success: true, message: 'Rating deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
// GET User Rating
router.get('/:id/user-rating', authenticate, async (req, res) => {
    try {
        const [r] = await pool.execute('SELECT score FROM ratings WHERE album_id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ score: r[0]?.score || null });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// GET Stats
router.get('/album/:id/stats', async (req, res) => {
    try {
        const [s] = await pool.execute('SELECT avg_score as average_score, ratings_count as total_ratings FROM album_stats WHERE album_id = ?', [req.params.id]);
        res.json({ average_score: s[0]?.average_score || 0, total_ratings: s[0]?.total_ratings || 0 });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// GET Histogram
router.get('/album/:id/histogram', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT score, COUNT(*) as count FROM ratings WHERE album_id = ? GROUP BY score ORDER BY score DESC', [req.params.id]);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;