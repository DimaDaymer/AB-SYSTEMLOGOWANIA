// backend/routes/ratings.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// === ЕДИНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ СТАТИСТИКИ ===
async function updateStats(targetAlbumId) {
    let connection = null;
    try {
        connection = await pool.getConnection();
        await connection.query(`
            UPDATE album_stats ast
            SET
                ratings_count = (SELECT COUNT(*) FROM ratings WHERE album_id = ?),
                avg_score = (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE album_id = ?),
                reviews_count = (SELECT COUNT(*) FROM reviews WHERE album_id = ?),
                last_updated = CURRENT_TIMESTAMP
            WHERE ast.album_id = ?
        `, [targetAlbumId, targetAlbumId, targetAlbumId, targetAlbumId]);

    } catch (err) {
        console.error("Stats update failed:", err);
    } finally {
        if (connection) connection.release();
    }
}

router.post('/:id/ratings', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const { score } = req.body;
        const userId = req.user.id;

        await pool.execute(
            `INSERT INTO ratings (user_id, album_id, score) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE score = VALUES(score)`,
            [userId, albumId, score]
        );
        await updateStats(albumId);
        res.json({ message: 'Rating saved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save rating' });
    }
});

router.delete('/:id/ratings', authenticate, async (req, res) => {
    try {
        const { id: albumId } = req.params;
        const userId = req.user.id;

        await pool.execute('DELETE FROM ratings WHERE user_id = ? AND album_id = ?', [userId, albumId]);
        await updateStats(albumId);
        res.json({ success: true, message: 'Rating deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete rating' });
    }
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