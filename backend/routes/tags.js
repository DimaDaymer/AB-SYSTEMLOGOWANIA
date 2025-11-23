// routes/tags.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// 1. Получить теги для альбома (для модального окна)
router.get('/album/:albumId', authenticate, async (req, res) => {
    try {
        const { albumId } = req.params;
        const userId = req.user.id;

        const [rows] = await pool.execute(
            `SELECT id, tag_name FROM user_album_tags WHERE user_id = ? AND album_id = ? ORDER BY created_at ASC`,
            [userId, albumId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 2. Добавить тег
router.post('/', authenticate, async (req, res) => {
    try {
        const { albumId, tagName } = req.body;
        const userId = req.user.id;

        if (!tagName || tagName.trim() === '') {
            return res.status(400).json({ error: 'Tag name is required' });
        }

        // Проверка дубликатов
        const [exists] = await pool.execute(
            `SELECT id FROM user_album_tags WHERE user_id = ? AND album_id = ? AND tag_name = ?`,
            [userId, albumId, tagName.trim()]
        );

        if (exists.length > 0) {
            return res.status(400).json({ error: 'Tag already exists' });
        }

        await pool.execute(
            `INSERT INTO user_album_tags (user_id, album_id, tag_name) VALUES (?, ?, ?)`,
            [userId, albumId, tagName.trim()]
        );

        res.json({ success: true, message: 'Tag added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add tag' });
    }
});

// 3. Удалить тег
router.delete('/:tagId', authenticate, async (req, res) => {
    try {
        const { tagId } = req.params;
        const userId = req.user.id;

        await pool.execute(
            `DELETE FROM user_album_tags WHERE id = ? AND user_id = ?`,
            [tagId, userId]
        );

        res.json({ success: true, message: 'Tag removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove tag' });
    }
});

// 4. Получить ВСЕ теги для профиля
router.get('/my-tags', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT
                t.tag_name,
                a.title,
                a.slug,
                a.cover_url,
                a.release_date,
                (SELECT name FROM artists WHERE id = (SELECT artist_id FROM album_artists WHERE album_id = a.id AND is_main=1 LIMIT 1)) as artist_name
            FROM user_album_tags t
                     JOIN albums a ON t.album_id = a.id
            WHERE t.user_id = ?
            ORDER BY t.tag_name ASC, a.release_date DESC
        `;

        const [rows] = await pool.execute(query, [userId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user tags' });
    }
});

// 5. (НОВЫЙ) Получить УНИКАЛЬНЫЕ теги пользователя (для подсказок)
router.get('/my-unique-tags', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            `SELECT DISTINCT tag_name FROM user_album_tags WHERE user_id = ? ORDER BY tag_name ASC`,
            [userId]
        );
        // Возвращаем простой массив строк
        res.json(rows.map(row => row.tag_name));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch unique tags' });
    }
});


module.exports = router;