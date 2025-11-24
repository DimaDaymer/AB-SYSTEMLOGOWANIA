// backend/routes/userLists.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const { slugify } = require('transliteration');

// Утилита: проверка, является ли пользователь владельцем списка
async function checkListOwnership(listId, userId) {
    const [rows] = await pool.execute('SELECT id FROM lists WHERE id = ? AND user_id = ?', [listId, userId]);
    return rows.length > 0;
}

// 1. Создать список
router.post('/', authenticate, async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;

        if (!name) return res.status(400).json({ error: 'Название обязательно' });

        // Генерируем уникальный slug (добавляем timestamp, чтобы избежать дублей имен)
        const baseSlug = slugify(name);
        const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

        const [result] = await pool.execute(
            'INSERT INTO lists (name, description, user_id, slug) VALUES (?, ?, ?, ?)',
            [name, description, userId, slug]
        );

        res.status(201).json({ message: 'Список создан', listId: result.insertId, slug });
    } catch (error) {
        console.error('Create list error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 2. Получить списки ТЕКУЩЕГО пользователя (Мои списки)
router.get('/my-lists', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [lists] = await pool.execute(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at,
                   (SELECT COUNT(*) FROM list_items WHERE list_id = ul.id) as albums_count,
                   u.username
            FROM lists ul
                     JOIN users u ON ul.user_id = u.id
            WHERE ul.user_id = ?
            ORDER BY ul.created_at DESC
        `, [userId]);

        res.json(lists);
    } catch (error) {
        console.error('My lists error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 3. Глобальные списки (Все списки на сайте)
router.get('/global', async (req, res) => {
    try {
        const limit = 50; // Лимит выдачи
        const [lists] = await pool.execute(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at,
                   (SELECT COUNT(*) FROM list_items WHERE list_id = ul.id) as albums_count,
                   u.username, u.id as author_id
            FROM lists ul
            JOIN users u ON ul.user_id = u.id
            ORDER BY ul.created_at DESC
            LIMIT ?
        `, [limit.toString()]); // limit иногда требует строки или числа в зависимости от версии mysql2, здесь безопасно

        res.json(lists);
    } catch (error) {
        console.error('Global lists error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 4. Получить детали конкретного списка (по slug)
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { sortBy = 'added_desc' } = req.query;

        // Получаем информацию о списке и авторе
        const [lists] = await pool.execute(`
            SELECT l.*, u.username as creator_name, u.id as creator_id
            FROM lists l
            JOIN users u ON l.user_id = u.id
            WHERE l.slug = ?
        `, [slug]);

        if (lists.length === 0) return res.status(404).json({ error: 'Список не найден' });
        const list = lists[0];

        // Определяем сортировку
        let orderByClause = 'ORDER BY li.created_at DESC'; // Default
        if (sortBy === 'title_asc') orderByClause = 'ORDER BY a.title ASC';
        if (sortBy === 'title_desc') orderByClause = 'ORDER BY a.title DESC';
        if (sortBy === 'rating_desc') orderByClause = 'ORDER BY s.avg_score DESC';
        if (sortBy === 'added_asc') orderByClause = 'ORDER BY li.created_at ASC';
        if (sortBy === 'sort_order_asc') orderByClause = 'ORDER BY li.sort_order ASC';

        // Получаем альбомы
        const [albums] = await pool.execute(`
            SELECT
                a.id, a.title, a.cover_url, a.slug,
                s.avg_score as rating, s.likes_count as likes,
                GROUP_CONCAT(DISTINCT art.name SEPARATOR ', ') as artist_name,
                li.sort_order, li.created_at as added_at
            FROM list_items li
            JOIN albums a ON li.album_id = a.id
            LEFT JOIN album_stats s ON a.id = s.album_id
            LEFT JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
            LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE li.list_id = ?
            GROUP BY a.id, li.sort_order, li.created_at
            ${orderByClause}
        `, [list.id]);

        res.json({
            id: list.id,
            name: list.name,
            description: list.description,
            user_id: list.creator_id, // Важно для проверки прав на фронте
            creator: list.creator_name,
            created_at: list.created_at,
            albums: albums
        });

    } catch (error) {
        console.error('List details error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 5. Добавить альбом в список
router.post('/:listId/add', authenticate, async (req, res) => {
    try {
        const { listId } = req.params;
        const { albumId } = req.body;
        const userId = req.user.id;

        // Проверка прав
        const isOwner = await checkListOwnership(listId, userId);
        if (!isOwner) return res.status(403).json({ error: 'Вы не автор этого списка' });

        // Проверка дубликатов
        const [existing] = await pool.execute('SELECT 1 FROM list_items WHERE list_id = ? AND album_id = ?', [listId, albumId]);
        if (existing.length > 0) return res.status(409).json({ message: 'Альбом уже в списке' });

        // Вычисляем порядок сортировки
        const [maxOrder] = await pool.execute('SELECT MAX(sort_order) as max_val FROM list_items WHERE list_id = ?', [listId]);
        const nextOrder = (maxOrder[0].max_val || 0) + 1;

        await pool.execute('INSERT INTO list_items (list_id, album_id, sort_order) VALUES (?, ?, ?)', [listId, albumId, nextOrder]);

        // Обновляем статистику альбома
        await pool.execute('UPDATE album_stats SET in_lists_count = in_lists_count + 1 WHERE album_id = ?', [albumId]);

        res.json({ message: 'Добавлено' });
    } catch (error) {
        console.error('Add album error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 6. Удалить альбом из списка
router.delete('/:listId/items/:albumId', authenticate, async (req, res) => {
    try {
        const { listId, albumId } = req.params;
        const userId = req.user.id;

        const isOwner = await checkListOwnership(listId, userId);
        if (!isOwner) return res.status(403).json({ error: 'Нет прав' });

        await pool.execute('DELETE FROM list_items WHERE list_id = ? AND album_id = ?', [listId, albumId]);
        // Уменьшаем счетчик
        await pool.execute('UPDATE album_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE album_id = ?', [albumId]);

        res.json({ message: 'Удалено' });
    } catch (error) {
        console.error('Remove album error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 7. Изменить порядок (Drag & Drop)
router.post('/:listId/reorder', authenticate, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { listId } = req.params;
        const { newOrder } = req.body; // Array [{albumId, sortOrder}]
        const userId = req.user.id;

        // Проверка прав внутри транзакции
        const [check] = await connection.execute('SELECT id FROM lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (check.length === 0) {
            await connection.rollback();
            return res.status(403).json({ error: 'Нет прав' });
        }

        // Обновляем порядок
        for (const item of newOrder) {
            await connection.execute(
                'UPDATE list_items SET sort_order = ? WHERE list_id = ? AND album_id = ?',
                [item.sortOrder, listId, item.albumId]
            );
        }

        await connection.commit();
        res.json({ message: 'Порядок сохранен' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Reorder error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;