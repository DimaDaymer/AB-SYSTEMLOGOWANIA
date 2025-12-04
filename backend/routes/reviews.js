// backend/routes/reviews.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// Получить комментарии (корневые) для сущности (альбома)
router.get('/album/:albumId', async (req, res) => {
    const { albumId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const sort = req.query.sort || 'popular'; // popular | newest
    const offset = (page - 1) * limit;

    // Определяем сортировку
    let orderBy = 'likes_count DESC, r.created_at DESC';
    if (sort === 'newest') orderBy = 'r.created_at DESC';

    try {
        const query = `
            SELECT
                r.id, r.user_id, r.content, r.created_at, r.updated_at, r.parent_id, -- Добавлено r.user_id и r.updated_at
                u.username, p.profile_pic,
                IFNULL(rt.score, 0) as user_album_rating,
                (SELECT COUNT(*) FROM review_votes rv WHERE rv.review_id = r.id AND rv.vote_type = 'like') as likes_count,
                (SELECT COUNT(*) FROM reviews rep WHERE rep.parent_id = r.id) as replies_count
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            LEFT JOIN user_profiles p ON u.id = p.user_id
            LEFT JOIN ratings rt ON rt.user_id = r.user_id AND rt.album_id = r.album_id
            WHERE r.album_id = ? AND r.parent_id IS NULL
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;

        const [rows] = await pool.execute(query, [albumId, limit.toString(), offset.toString()]);

        // Получаем общее кол-во для пагинации
        const [countResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM reviews WHERE album_id = ? AND parent_id IS NULL',
            [albumId]
        );

        res.json({
            comments: rows,
            total: countResult[0].total,
            page,
            totalPages: Math.ceil(countResult[0].total / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Db error' });
    }
});

// Получить ветку ответов (Replies)
router.get('/thread/:parentId', async (req, res) => {
    try {
        const query = `
            SELECT 
                r.id, r.content, r.created_at, r.parent_id,
                u.username, p.profile_pic,
                IFNULL(rt.score, 0) as user_album_rating,
                (SELECT COUNT(*) FROM review_votes rv WHERE rv.review_id = r.id AND rv.vote_type = 'like') as likes_count
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            LEFT JOIN user_profiles p ON u.id = p.user_id
            LEFT JOIN ratings rt ON rt.user_id = r.user_id AND rt.album_id = r.album_id
            WHERE r.parent_id = ?
            ORDER BY r.created_at ASC
        `;
        const [rows] = await pool.execute(query, [req.params.parentId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Db error' });
    }
});

// Добавить комментарий
router.post('/', authenticate, async (req, res) => {
    const { albumId, content, parentId } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Empty content' });

    try {
        await pool.execute(
            'INSERT INTO reviews (user_id, album_id, content, parent_id) VALUES (?, ?, ?, ?)',
            [req.user.id, albumId, content, parentId || null]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Db error' });
    }
});

// Лайк/Дизлайк комментария
router.post('/:id/vote', authenticate, async (req, res) => {
    const reviewId = req.params.id;
    const userId = req.user.id;

    try {
        // Проверяем, голосовал ли уже
        const [exists] = await pool.execute(
            'SELECT id FROM review_votes WHERE user_id = ? AND review_id = ?',
            [userId, reviewId]
        );

        if (exists.length > 0) {
            // Если есть лайк - удаляем (toggle)
            await pool.execute('DELETE FROM review_votes WHERE id = ?', [exists[0].id]);
            return res.json({ action: 'removed' });
        } else {
            // Если нет - ставим
            await pool.execute(
                'INSERT INTO review_votes (user_id, review_id, vote_type) VALUES (?, ?, "like")',
                [userId, reviewId]
            );
            return res.json({ action: 'added' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Db error' });
    }
});

// 2. ДОБАВЬТЕ ЭТОТ НОВЫЙ МАРШРУТ перед module.exports
// Редактирование комментария
router.put('/:id', authenticate, async (req, res) => {
    const reviewId = req.params.id;
    const { content } = req.body;
    const userId = req.user.id; // ID из токена авторизации

    if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Content cannot be empty' });
    }

    try {
        // Проверяем, принадлежит ли комментарий пользователю
        const [rows] = await pool.execute('SELECT user_id FROM reviews WHERE id = ?', [reviewId]);

        if (rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
        if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

        // Обновляем
        await pool.execute(
            'UPDATE reviews SET content = ? WHERE id = ?',
            [content, reviewId]
        );

        res.json({ success: true, content: content });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Db error' });
    }
});

module.exports = router;