// backend/routes/userLists.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const { slugify } = require('transliteration');
const jwt = require('jsonwebtoken');

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

        const baseSlug = slugify(name);
        const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

        const [result] = await pool.execute(
            'INSERT INTO lists (name, description, user_id, slug, saved_sort_by) VALUES (?, ?, ?, ?, ?)',
            [name, description, userId, slug, 'added_desc']
        );

        res.status(201).json({ message: 'Список создан', listId: result.insertId, slug });
    } catch (error) {
        console.error('Create list error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 2. Получить списки ТЕКУЩЕГО пользователя
router.get('/my-lists', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [lists] = await pool.execute(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at, ul.cover_url,
                   (SELECT COUNT(*) FROM list_items WHERE list_id = ul.id) as albums_count,
                   (SELECT a.cover_url FROM list_items li JOIN albums a ON li.album_id = a.id WHERE li.list_id = ul.id ORDER BY li.sort_order ASC LIMIT 1) as first_album_cover,
                   u.username
            FROM lists ul
                     JOIN users u ON ul.user_id = u.id
            WHERE ul.user_id = ?
            ORDER BY ul.created_at DESC
        `, [userId]);

        const listsWithCovers = lists.map(list => ({
            ...list,
            cover_url: list.cover_url || list.first_album_cover || '/img/no_cover.jpg'
        }));

        res.json(listsWithCovers);
    } catch (error) {
        console.error('My lists error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 3. Глобальные списки
router.get('/global', async (req, res) => {
    try {
        const limit = 50;
        const [lists] = await pool.execute(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at, ul.cover_url,
                   (SELECT COUNT(*) FROM list_items WHERE list_id = ul.id) as albums_count,
                   (SELECT a.cover_url FROM list_items li JOIN albums a ON li.album_id = a.id WHERE li.list_id = ul.id ORDER BY li.sort_order ASC LIMIT 1) as first_album_cover,
                   u.username, u.id as author_id
            FROM lists ul
                     JOIN users u ON ul.user_id = u.id
            ORDER BY ul.created_at DESC
            LIMIT ?
        `, [limit.toString()]);

        const listsWithCovers = lists.map(list => ({
            ...list,
            cover_url: list.cover_url || list.first_album_cover || '/img/no_cover.jpg'
        }));

        res.json(listsWithCovers);
    } catch (error) {
        console.error('Global lists error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 4. Получить детали списка
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        let { sortBy } = req.query;

        // --- ЛОГИКА ОПРЕДЕЛЕНИЯ ПОЛЬЗОВАТЕЛЯ ---
        let currentUserId = null;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            try {
                if (process.env.JWT_SECRET) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    currentUserId = decoded.id;
                }
            } catch (e) {
                // Игнорируем ошибку токена
            }
        }

        const [lists] = await pool.execute(`
            SELECT l.*, u.username as creator_name, u.id as creator_id
            FROM lists l
                     JOIN users u ON l.user_id = u.id
            WHERE l.slug = ?
        `, [slug]);

        if (lists.length === 0) return res.status(404).json({ error: 'Список не найден' });
        const list = lists[0];

        if (!sortBy) {
            sortBy = list.saved_sort_by || 'added_desc';
        }

        let orderByClause = 'ORDER BY li.created_at DESC';
        if (sortBy === 'title_asc') orderByClause = 'ORDER BY a.title ASC';
        if (sortBy === 'title_desc') orderByClause = 'ORDER BY a.title DESC';
        if (sortBy === 'rating_desc') orderByClause = 'ORDER BY s.avg_score DESC';
        if (sortBy === 'added_asc') orderByClause = 'ORDER BY li.created_at ASC';
        if (sortBy === 'sort_order_asc') orderByClause = 'ORDER BY li.sort_order ASC';

        const [albums] = await pool.execute(`
            SELECT
                a.id, a.title, a.cover_url, a.slug, a.release_date, a.description,

                -- Статистика
                s.avg_score,
                s.ratings_count,
                s.reviews_count,
                s.likes_count,
                s.wishlist_count,
                s.in_lists_count,

                -- ДОБАВЛЕНО: Подсчет прослушиваний (как в albums.js), чтобы карточки были одинаковыми
                (SELECT COUNT(*) FROM user_album_actions uaa WHERE uaa.album_id = a.id AND uaa.action_type = 'listen') as listens_count,

                -- Исполнитель
                GROUP_CONCAT(DISTINCT art.name SEPARATOR ', ') as artist_name,

                -- Жанры
                (
                    SELECT GROUP_CONCAT(g.name SEPARATOR ', ')
                    FROM album_genres ag
                             JOIN genres g ON ag.genre_id = g.id
                    WHERE ag.album_id = a.id
                ) as genres,

                li.sort_order, li.created_at as added_at,

                -- Статусы действий
                (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'like') as is_liked,
                (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'listen') as is_listened,
                (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'wishlist') as is_wishlisted

            FROM list_items li
                     JOIN albums a ON li.album_id = a.id
                     LEFT JOIN album_stats s ON a.id = s.album_id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                     LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE li.list_id = ?
            GROUP BY a.id, li.sort_order, li.created_at
                ${orderByClause}
        `, [currentUserId, currentUserId, currentUserId, list.id]);

        res.json({
            id: list.id,
            name: list.name,
            description: list.description,
            cover_url: list.cover_url,
            user_id: list.creator_id,
            creator: list.creator_name,
            created_at: list.created_at,
            saved_sort_by: list.saved_sort_by,
            applied_sort_by: sortBy,
            albums: albums.map(alb => ({
                ...alb,
                is_liked: !!alb.is_liked,
                is_listened: !!alb.is_listened,
                is_wishlisted: !!alb.is_wishlisted
            }))
        });

    } catch (error) {
        console.error('List details error:', error);
        res.status(500).json({ error: 'Ошибка БД: ' + error.message });
    }
});

// 5. Добавить альбом в список
router.post('/:listId/add', authenticate, async (req, res) => {
    try {
        const { listId } = req.params;
        const { albumId } = req.body;
        const userId = req.user.id;

        const isOwner = await checkListOwnership(listId, userId);
        if (!isOwner) return res.status(403).json({ error: 'Вы не автор этого списка' });

        const [existing] = await pool.execute('SELECT 1 FROM list_items WHERE list_id = ? AND album_id = ?', [listId, albumId]);
        if (existing.length > 0) return res.status(409).json({ message: 'Альбом уже в списке' });

        const [maxOrder] = await pool.execute('SELECT MAX(sort_order) as max_val FROM list_items WHERE list_id = ?', [listId]);
        const nextOrder = (maxOrder[0].max_val || 0) + 1;

        await pool.execute('INSERT INTO list_items (list_id, album_id, sort_order) VALUES (?, ?, ?)', [listId, albumId, nextOrder]);
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
        const { newOrder } = req.body;
        const userId = req.user.id;

        const [check] = await connection.execute('SELECT id FROM lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (check.length === 0) {
            await connection.rollback();
            return res.status(403).json({ error: 'Нет прав' });
        }

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

// 8. Обновить метаданные списка
router.put('/:listId', authenticate, async (req, res) => {
    try {
        const { listId } = req.params;
        const { name, description, saved_sort_by, cover_url } = req.body;
        const userId = req.user.id;

        const isOwner = await checkListOwnership(listId, userId);
        if (!isOwner) return res.status(403).json({ error: 'Вы не автор этого списка' });

        let updates = [];
        let params = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (cover_url !== undefined) { updates.push('cover_url = ?'); params.push(cover_url); }
        if (saved_sort_by) { updates.push('saved_sort_by = ?'); params.push(saved_sort_by); }

        if (updates.length === 0) return res.status(400).json({ error: 'Нет данных для обновления' });

        const sql = `UPDATE lists SET ${updates.join(', ')} WHERE id = ?`;
        params.push(listId);

        await pool.execute(sql, params);
        res.json({ message: 'Список обновлен' });
    } catch (error) {
        console.error('Update list error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 9. Удаление списка
router.delete('/:listId', authenticate, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { listId } = req.params;
        const userId = req.user.id;

        const [check] = await connection.execute('SELECT id FROM lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (check.length === 0) {
            await connection.rollback();
            return res.status(403).json({ error: 'Нет прав' });
        }

        const [items] = await connection.execute('SELECT album_id FROM list_items WHERE list_id = ?', [listId]);
        for (const item of items) {
            await connection.execute('UPDATE album_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE album_id = ?', [item.album_id]);
        }

        await connection.execute('DELETE FROM list_items WHERE list_id = ?', [listId]);
        await connection.execute('DELETE FROM lists WHERE id = ?', [listId]);

        await connection.commit();
        res.json({ message: 'Список удален' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Delete list error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    } finally {
        if (connection) connection.release();
    }
});

// 10. Списки, в которых есть альбом
router.get('/for-album/:albumId', async (req, res) => {
    try {
        const { albumId } = req.params;
        const limit = parseInt(req.query.limit) || 5;
        const offset = parseInt(req.query.offset) || 0;

        // --- 1. ЗАПРОС НА ОБЩЕЕ КОЛИЧЕСТВО ---
        const [countRows] = await pool.execute(`
            SELECT COUNT(DISTINCT l.id) AS total
            FROM lists l
                     JOIN list_items li ON l.id = li.list_id
            WHERE li.album_id = ?
        `, [albumId]);
        const totalLists = countRows[0].total; // Получаем общее количество

        // --- 2. ЗАПРОС НА ТЕКУЩУЮ СТРАНИЦУ ---
        const [lists] = await pool.execute(`
            SELECT DISTINCT
                l.id, l.name, l.slug, l.description, l.created_at, l.cover_url,
                u.username,
                (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS albums_count,
                (SELECT a.cover_url FROM list_items li2 JOIN albums a ON li2.album_id = a.id WHERE li2.list_id = l.id ORDER BY li2.sort_order ASC LIMIT 1) AS first_album_cover
            FROM lists l
                     JOIN list_items li ON l.id = li.list_id
                     JOIN users u ON l.user_id = u.id
            WHERE li.album_id = ?
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `, [albumId, limit.toString(), offset.toString()]);

        const listsWithCovers = lists.map(list => ({
            ...list,
            cover_url: list.cover_url || list.first_album_cover || '/img/no_cover.jpg'
        }));

        // 💡 НОВАЯ СТРУКТУРА ОТВЕТА для фронтенда
        res.json({
            lists: listsWithCovers,
            total: totalLists,
            limit: limit,
            offset: offset
        });

    } catch (error) {
        console.error('Lists for album error:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

module.exports = router;