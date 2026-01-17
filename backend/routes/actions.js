// backend/routes/actions.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

async function updateActionStats(connection, albumId) {
    if (!albumId) return;
    try {
        await connection.execute(`
            INSERT INTO album_stats (album_id, likes_count, listens_count, wishlist_count)
            SELECT ?,
                   (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'like'),
                   (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'listen'),
                   (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'wishlist')
            ON DUPLICATE KEY UPDATE
                                 likes_count = VALUES(likes_count),
                                 listens_count = VALUES(listens_count),
                                 wishlist_count = VALUES(wishlist_count)
        `, [albumId, albumId, albumId, albumId]);
    } catch (err) {
        console.error("Ошибка обновления статистики альбома:", err);
        throw err;
    }
}

// === 1. ПОЛУЧЕНИЕ ПОСЛЕДНИХ ДЕЙСТВИЙ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ ===
router.get('/user-actions', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [actions] = await pool.execute(
            `SELECT a.id, a.title, a.cover_url, a.slug, uaa.action_type, uaa.created_at,
                    GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist
             FROM user_album_actions uaa
                      JOIN albums a ON uaa.album_id = a.id
                      LEFT JOIN album_artists aa ON a.id = aa.album_id
                      LEFT JOIN artists art ON aa.artist_id = art.id
             WHERE uaa.user_id = ?
             GROUP BY a.id, uaa.action_type, uaa.created_at
             ORDER BY uaa.created_at DESC LIMIT 50`,
            [userId]
        );
        res.json(actions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Не удалось получить действия пользователя' });
    }
});

// === 2. ПРОВЕРКА ДЕЙСТВИЙ ДЛЯ КОНКРЕТНОГО АЛЬБОМА ===
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
        res.status(500).json({ error: 'Ошибка при проверке действий' });
    }
});

// === 3. ПОЛУЧЕНИЕ ДЕЙСТВИЙ ПО ТИПУ ===
router.get('/:actionType', authenticate, async (req, res) => {
    try {
        const { actionType } = req.params;
        const userId = req.user.id;

        if (!['like', 'listen', 'wishlist'].includes(actionType)) {
            return res.status(400).json({ error: 'Неверный тип действия' });
        }

        const [actions] = await pool.execute(
            `SELECT a.id, a.title, GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist,
                    a.cover_url, a.slug, uaa.created_at, a.release_date
             FROM user_album_actions uaa
                      JOIN albums a ON uaa.album_id = a.id
                      LEFT JOIN album_artists aa ON a.id = aa.album_id
                      LEFT JOIN artists art ON aa.artist_id = art.id
             WHERE uaa.user_id = ? AND uaa.action_type = ?
             GROUP BY a.id, uaa.created_at
             ORDER BY uaa.created_at DESC`,
            [userId, actionType]
        );
        res.json(actions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Не удалось получить список' });
    }
});

// === 4. ПЕРЕКЛЮЧЕНИЕ ДЕЙСТВИЯ ===
router.post('/', authenticate, async (req, res) => {
    const { albumId, actionType } = req.body;
    const userId = req.user.id;

    if (!['like', 'listen', 'wishlist'].includes(actionType)) {
        return res.status(400).json({ error: 'Неверный тип действия' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            `SELECT id FROM user_album_actions WHERE user_id = ? AND album_id = ? AND action_type = ?`,
            [userId, albumId, actionType]
        );

        let active = false;
        if (existing.length > 0) {
            await connection.execute(`DELETE FROM user_album_actions WHERE id = ?`, [existing[0].id]);
            active = false;
        } else {
            await connection.execute(
                `INSERT INTO user_album_actions (user_id, album_id, action_type) VALUES (?, ?, ?)`,
                [userId, albumId, actionType]
            );
            active = true;
        }

        await updateActionStats(connection, albumId);

        const [newStats] = await connection.execute(
            `SELECT likes_count, listens_count, wishlist_count FROM album_stats WHERE album_id = ?`,
            [albumId]
        );

        await connection.commit();

        const stats = newStats.length > 0 ? newStats[0] : { likes_count: 0, listens_count: 0, wishlist_count: 0 };
        res.json({ success: true, active, stats });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// === 5. ПРЯМОЕ УДАЛЕНИЕ ДЕЙСТВИЯ ===
router.delete('/', authenticate, async (req, res) => {
    const { albumId, actionType } = req.query;
    const userId = req.user.id;

    if (!albumId || !actionType) return res.status(400).json({ error: 'Отсутствуют параметры' });

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute(
            `DELETE FROM user_album_actions WHERE user_id = ? AND album_id = ? AND action_type = ?`,
            [userId, albumId, actionType]
        );

        await updateActionStats(connection, albumId);

        const [newStats] = await connection.execute(
            `SELECT likes_count, listens_count, wishlist_count FROM album_stats WHERE album_id = ?`,
            [albumId]
        );

        await connection.commit();

        const stats = newStats.length > 0 ? newStats[0] : { likes_count: 0, listens_count: 0, wishlist_count: 0 };
        res.json({ success: true, stats });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ error: 'Удаление не удалось' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;