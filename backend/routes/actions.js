const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// === НОВАЯ ФУНКЦИЯ: Обновляем счетчики лайков/прослушиваний ===
async function updateActionStats(albumId) {
    try {
        await pool.query(`
            UPDATE album_stats ast
            SET
                likes_count = (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'like'),
                listens_count = (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'listen'),
                wishlist_count = (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'wishlist')
            WHERE ast.album_id = ?
        `, [albumId, albumId, albumId, albumId]);
    } catch (err) {
        console.error("Action stats update failed:", err);
    }
}

router.post('/', authenticate, async (req, res) => {
    try {
        const { albumId, actionType } = req.body;
        const userId = req.user.id;

        if (!['listen', 'wishlist', 'like', 'add-to-list', 'tags'].includes(actionType)) {
            return res.status(400).json({ error: 'Invalid action type' });
        }

        const [existingAction] = await pool.execute(
            `SELECT id FROM user_album_actions
             WHERE user_id = ? AND album_id = ? AND action_type = ?`,
            [userId, albumId, actionType]
        );

        let active = false;

        if (existingAction.length > 0) {
            await pool.execute(
                `DELETE FROM user_album_actions
                 WHERE user_id = ? AND album_id = ? AND action_type = ?`,
                [userId, albumId, actionType]
            );
            active = false;
        } else {
            // При добавлении IGNORE защищает от дублей, если вдруг возникнет гонка запросов
            await pool.execute(
                `INSERT IGNORE INTO user_album_actions (user_id, album_id, action_type)
                 VALUES (?, ?, ?)`,
                [userId, albumId, actionType]
            );
            active = true;
        }

        // Обновляем статистику в фоне (без await, чтобы не тормозить ответ клиенту)
        updateActionStats(albumId);

        res.json({ success: true, message: active ? 'Action added' : 'Action removed', active });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add/remove action' });
    }
});

router.get('/:actionType', authenticate, async (req, res) => {
    try {
        const { actionType } = req.params;
        const userId = req.user.id;

        const [actions] = await pool.execute(
            `SELECT a.id, a.title, GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist, a.cover_url, a.slug, uaa.created_at, a.release_date
             FROM user_album_actions uaa
                      JOIN albums a ON uaa.album_id = a.id
                      LEFT JOIN album_artists aa ON a.id = aa.album_id
                      LEFT JOIN artists art ON aa.artist_id = art.id
             WHERE uaa.user_id = ? AND uaa.action_type = ?
             GROUP BY a.id, a.title, a.cover_url, a.slug, uaa.created_at, a.release_date
             ORDER BY uaa.created_at DESC`,
            [userId, actionType]
        );
        res.json(actions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get actions' });
    }
});

router.get('/album/:albumId', authenticate, async (req, res) => {
    try {
        const { albumId } = req.params;
        const userId = req.user.id;
        const [actions] = await pool.execute(
            `SELECT action_type FROM user_album_actions WHERE user_id = ? AND album_id = ?`,
            [userId, albumId]
        );
        res.json(actions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get action' });
    }
});

router.get('/all', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [actions] = await pool.execute(
            `SELECT a.id, a.title, GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist, a.cover_url, a.slug, uaa.action_type, uaa.created_at
             FROM user_album_actions uaa
                      JOIN albums a ON uaa.album_id = a.id
                      LEFT JOIN album_artists aa ON a.id = aa.album_id
                      LEFT JOIN artists art ON aa.artist_id = art.id
             WHERE uaa.user_id = ?
             GROUP BY a.id, a.title, a.cover_url, a.slug, uaa.action_type, uaa.created_at
             ORDER BY uaa.created_at DESC LIMIT 50`,
            [userId]
        );
        res.json(actions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get actions' });
    }
});

router.delete('/', authenticate, async (req, res) => {
    try {
        const { albumId, actionType } = req.query;
        const userId = req.user.id;
        if (!albumId || !actionType) return res.status(400).json({ error: 'Missing parameters' });

        await pool.execute(
            `DELETE FROM user_album_actions WHERE user_id = ? AND album_id = ? AND action_type = ?`,
            [userId, albumId, actionType]
        );

        // Обновляем статистику после удаления
        updateActionStats(albumId);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove action' });
    }
});

module.exports = router;