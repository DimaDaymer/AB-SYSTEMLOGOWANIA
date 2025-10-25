const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { slugify } = require('transliteration');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// POST /api/user-lists - Создать новый список
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;

        const slug = slugify(name);

        if (!name) {
            return res.status(400).json({ error: 'Название списка обязательно.' });
        }

        const [result] = await db.pool.query('INSERT INTO user_lists (name, description, user_id, slug) VALUES (?, ?, ?, ?)', [name, description, userId, slug]);

        res.status(201).json({ message: 'Список успешно создан!', listId: result.insertId, slug });
    } catch (error) {
        console.error('Ошибка при создании списка:', error);
        res.status(500).json({ error: 'Ошибка сервера при создании списка.' });
    }
});

// GET /api/user-lists/my-lists - Получить все списки текущего пользователя
router.get('/my-lists', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [lists] = await db.pool.query(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at, COUNT(ula.album_id) as albums_count, u.username
            FROM user_lists AS ul
                     LEFT JOIN user_list_albums AS ula ON ul.id = ula.list_id
                     JOIN users AS u ON ul.user_id = u.id
            WHERE ul.user_id = ?
            GROUP BY ul.id
            ORDER BY ul.created_at DESC
        `, [userId]);

        res.json(lists);
    } catch (error) {
        console.error('Ошибка при получении списков пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

// POST /api/user-lists/:listId/add - Добавить альбом в список
router.post('/:listId/add', authenticateToken, async (req, res) => {
    try {
        const { listId } = req.params;
        const { albumId } = req.body;
        const userId = req.user.id;

        const [list] = await db.pool.query('SELECT * FROM user_lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (list.length === 0) {
            return res.status(404).json({ error: 'Список не найден или не принадлежит вам.' });
        }

        const [maxSortOrderResult] = await db.pool.query('SELECT MAX(sort_order) AS max_order FROM user_list_albums WHERE list_id = ?', [listId]);
        const nextSortOrder = (maxSortOrderResult[0].max_order || 0) + 1;

        await db.pool.query('INSERT INTO user_list_albums (list_id, album_id, sort_order) VALUES (?, ?, ?)', [listId, albumId, nextSortOrder]);

        res.status(200).json({ message: 'Альбом успешно добавлен в список!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Этот альбом уже в списке.' });
        }
        console.error('Ошибка при добавлении альбома в список:', error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

// POST /api/user-lists/:listId/reorder - Изменить порядок альбомов в списке
router.post('/:listId/reorder', authenticateToken, async (req, res) => {
    try {
        const { listId } = req.params;
        const { newOrder } = req.body;
        const userId = req.user.id;

        const [list] = await db.pool.query('SELECT user_id FROM user_lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (list.length === 0) {
            return res.status(404).json({ error: 'Список не найден или не принадлежит вам.' });
        }

        await db.pool.getConnection(async conn => {
            try {
                await conn.beginTransaction();
                for (const item of newOrder) {
                    await conn.query('UPDATE user_list_albums SET sort_order = ? WHERE list_id = ? AND album_id = ?', [item.sortOrder, listId, item.albumId]);
                }
                await conn.commit();
                res.status(200).json({ message: 'Порядок альбомов успешно обновлен.' });
            } catch (error) {
                await conn.rollback();
                throw error;
            } finally {
                conn.release();
            }
        });
    } catch (error) {
        console.error('Ошибка при обновлении порядка альбомов:', error);
        res.status(500).json({ error: 'Ошибка сервера.' });
    }
});

// GET /api/user-lists/:slug - Получить детали списка с сортировкой
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { sortBy = 'added_desc' } = req.query;

        const [lists] = await db.pool.query('SELECT id, name, description, user_id, slug, created_at FROM user_lists WHERE slug = ?', [slug]);

        if (lists.length === 0) {
            return res.status(404).json({ error: 'Список не найден.' });
        }

        const list = lists[0];
        let orderByClause = '';

        switch (sortBy) {
            case 'title_asc':
                orderByClause = 'ORDER BY a.title ASC';
                break;
            case 'popularity_desc':
                orderByClause = 'ORDER BY a.popularity DESC';
                break;
            case 'rating_desc':
                orderByClause = 'ORDER BY a.avg_rating DESC, a.rating_count DESC';
                break;
            case 'sort_order_asc': // Для ручной сортировки
                orderByClause = 'ORDER BY ula.sort_order ASC';
                break;
            default: // added_desc
                orderByClause = 'ORDER BY ula.added_at DESC';
                break;
        }

        const [albums] = await db.pool.query(`
            SELECT
                a.id,
                a.title,
                a.artist,
                a.release_date,
                a.cover_url,
                a.slug,
                a.genres,
                a.description,
                a.likes,
                a.wishlist_count,
                a.in_lists_count,
                a.reviews_count,
                a.avg_rating AS rating,
                a.rating_count
            FROM user_list_albums AS ula
                     JOIN albums AS a ON ula.album_id = a.id
            WHERE ula.list_id = ?
                ${orderByClause}
        `, [list.id]);

        const [creator] = await db.pool.query('SELECT username FROM users WHERE id = ?', [list.user_id]);

        res.json({
            id: list.id,
            name: list.name,
            slug: list.slug,
            description: list.description,
            creator: creator.length > 0 ? creator[0].username : 'Неизвестно',
            created_at: list.created_at,
            albums: albums
        });
    } catch (error) {
        console.error('Ошибка при получении списка:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении списка.' });
    }
});

module.exports = router;