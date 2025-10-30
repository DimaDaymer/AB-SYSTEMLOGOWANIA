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
        console.error('Ошибка создания списка:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/user-lists/my-lists - Получить все списки текущего пользователя
router.get('/my-lists', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [lists] = await db.pool.query(`
            SELECT
                ul.id,
                ul.name,
                ul.slug,
                ul.description,
                ul.created_at,
                (SELECT COUNT(*) FROM user_list_albums WHERE list_id = ul.id) AS albums_count,
                u.username
            FROM user_lists ul
                     JOIN users u ON ul.user_id = u.id
            WHERE ul.user_id = ?
            ORDER BY ul.created_at DESC
        `, [userId]);

        res.json(lists);
    } catch (error) {
        console.error('Ошибка получения списков пользователя:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/user-lists/:slug - Получить детали отдельного списка
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { sortBy = 'added_desc' } = req.query; // Сортировка по умолчанию

        const [lists] = await db.pool.query('SELECT * FROM user_lists WHERE slug = ?', [slug]);

        if (lists.length === 0) {
            return res.status(404).json({ error: 'Список не найден' });
        }

        const list = lists[0];
        let orderByClause = '';

        switch (sortBy) {
            case 'title_asc':
                orderByClause = 'ORDER BY a.title ASC';
                break;
            case 'title_desc':
                orderByClause = 'ORDER BY a.title DESC';
                break;
            case 'rating_desc':
                orderByClause = 'ORDER BY a.avg_rating DESC';
                break;
            case 'added_asc':
                orderByClause = 'ORDER BY ula.added_at ASC';
                break;
            case 'sort_order_asc': // Ручная сортировка
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
        console.error('Ошибка получения деталей списка:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/user-lists/:listId/add - Добавить альбом в список
router.post('/:listId/add', authenticateToken, async (req, res) => {
    try {
        const { listId } = req.params;
        const { albumId } = req.body;
        const userId = req.user.id;

        const [listCheck] = await db.pool.query('SELECT user_id FROM user_lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (listCheck.length === 0) {
            return res.status(403).json({ error: 'У вас нет прав на редактирование этого списка.' });
        }

        // Проверить, есть ли уже альбом в списке
        const [existing] = await db.pool.query('SELECT 1 FROM user_list_albums WHERE list_id = ? AND album_id = ?', [listId, albumId]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Альбом уже есть в списке.' });
        }

        // Получить максимальный sort_order для нового элемента
        const [maxSortOrder] = await db.pool.query('SELECT MAX(sort_order) AS max_order FROM user_list_albums WHERE list_id = ?', [listId]);
        const newSortOrder = (maxSortOrder[0].max_order || 0) + 1;

        await db.pool.query('INSERT INTO user_list_albums (list_id, album_id, sort_order) VALUES (?, ?, ?)', [listId, albumId, newSortOrder]);

        // Обновить счетчик списков в таблице albums
        await db.pool.query('UPDATE albums SET in_lists_count = in_lists_count + 1 WHERE id = ?', [albumId]);

        res.json({ message: 'Альбом успешно добавлен в список.', sortOrder: newSortOrder });
    } catch (error) {
        console.error('Ошибка добавления альбома в список:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/user-lists/:listId/reorder - Изменить порядок альбомов
router.post('/:listId/reorder', authenticateToken, async (req, res) => {
    try {
        const { listId } = req.params;
        const { newOrder } = req.body;
        const userId = req.user.id;

        const [listCheck] = await db.pool.query('SELECT user_id FROM user_lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (listCheck.length === 0) {
            return res.status(403).json({ error: 'У вас нет прав на редактирование этого списка.' });
        }

        // Обновленная проверка формата: массив, не пустой, и каждый элемент имеет albumId и sortOrder
        if (!Array.isArray(newOrder) || newOrder.length === 0 || !newOrder.every(item => item.albumId && item.sortOrder)) {
            return res.status(400).json({ error: 'Неверный или неполный формат нового порядка. Ожидается массив объектов {albumId, sortOrder}.' });
        }

        // Начать транзакцию
        await db.pool.query('START TRANSACTION');

        for (const item of newOrder) {
            const albumId = parseInt(item.albumId);
            const sortOrder = parseInt(item.sortOrder);

            if (isNaN(albumId) || isNaN(sortOrder)) {
                throw new Error('Некорректные значения albumId или sortOrder.');
            }

            await db.pool.query(
                'UPDATE user_list_albums SET sort_order = ? WHERE list_id = ? AND album_id = ?',
                [sortOrder, listId, albumId]
            );
        }

        // Завершить транзакцию
        await db.pool.query('COMMIT');

        res.json({ message: 'Порядок списка успешно обновлен.' });
    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Ошибка изменения порядка списка:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;