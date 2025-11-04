// backend/routes/userLists.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const { slugify } = require('transliteration');

// Утилита для преобразования строки исполнителей в массив
const stringToArray = (str) => (typeof str === 'string' ? str.split(',').map(s => s.trim()).filter(Boolean) : (str || []));


// POST /api/user-lists - Создать новый список
router.post('/', authenticate, async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;

        const slug = slugify(name);

        if (!name) {
            return res.status(400).json({ error: 'Название списка обязательно.' });
        }

        const [result] = await pool.execute('INSERT INTO user_lists (name, description, user_id, slug) VALUES (?, ?, ?, ?)', [name, description, userId, slug]);

        res.status(201).json({ message: 'Список успешно создан!', listId: result.insertId, slug });
    } catch (error) {
        console.error('Ошибка создания списка:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/user-lists/my-lists - Получить все списки текущего пользователя
router.get('/my-lists', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [lists] = await pool.execute(`
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

        const [lists] = await pool.execute('SELECT * FROM user_lists WHERE slug = ?', [slug]);

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

        // ИЗМЕНЕНИЕ SQL-ЗАПРОСА: Добавление ula.sort_order и ula.added_at в SELECT и GROUP BY
        const [albums] = await pool.execute(`
            SELECT
                a.id,
                a.title,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC) AS artists_list,
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
                a.rating_count,
                ula.sort_order,  -- ДОБАВЛЕНО: Для сортировки
                ula.added_at     -- ДОБАВЛЕНО: Для сортировки
            FROM user_list_albums AS ula
                     JOIN albums AS a ON ula.album_id = a.id
                     JOIN album_artists AS aa ON a.id = aa.album_id
                     JOIN artists AS art ON aa.artist_id = art.id
            WHERE ula.list_id = ?
            GROUP BY a.id, ula.sort_order, ula.added_at -- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Группируем по ID альбома И порядку в списке
                ${orderByClause}
        `, [list.id]);

        // ИЗМЕНЕНИЕ: Обработка результатов для клиента
        const finalAlbums = albums.map(album => ({
            ...album,
            artist: stringToArray(album.artists_list), // Маппинг нового поля к старому
            artists_list: undefined // Удаление промежуточного поля
        }));

        const [creator] = await pool.execute('SELECT username FROM users WHERE id = ?', [list.user_id]);

        res.json({
            id: list.id,
            name: list.name,
            slug: list.slug,
            description: list.description,
            creator: creator.length > 0 ? creator[0].username : 'Неизвестно',
            created_at: list.created_at,
            albums: finalAlbums // Отправляем finalAlbums
        });
    } catch (error) {
        console.error('Ошибка получения деталей списка:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/user-lists/:listId/add - Добавить альбом в список
router.post('/:listId/add', authenticate, async (req, res) => {
    try {
        const { listId } = req.params;
        const { albumId } = req.body;
        const userId = req.user.id;

        const [listCheck] = await pool.execute('SELECT user_id FROM user_lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (listCheck.length === 0) {
            return res.status(403).json({ error: 'У вас нет прав на редактирование этого списка.' });
        }

        // Проверить, есть ли уже альбом в списке
        const [existing] = await pool.execute('SELECT 1 FROM user_list_albums WHERE list_id = ? AND album_id = ?', [listId, albumId]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Альбом уже есть в списке.' });
        }

        // Получить максимальный sort_order для нового элемента
        const [maxSortOrder] = await pool.execute('SELECT MAX(sort_order) AS max_order FROM user_list_albums WHERE list_id = ?', [listId]);
        const newSortOrder = (maxSortOrder[0].max_order || 0) + 1;

        await pool.execute('INSERT INTO user_list_albums (list_id, album_id, sort_order) VALUES (?, ?, ?)', [listId, albumId, newSortOrder]);

        // Обновить счетчик списков в таблице albums
        await pool.execute('UPDATE albums SET in_lists_count = in_lists_count + 1 WHERE id = ?', [albumId]);

        res.json({ message: 'Альбом успешно добавлен в список.', sortOrder: newSortOrder });
    } catch (error) {
        console.error('Ошибка добавления альбома в список:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/user-lists/:listId/reorder - Изменить порядок альбомов
router.post('/:listId/reorder', authenticate, async (req, res) => {
    let connection;
    try {
        const { listId } = req.params;
        const { newOrder } = req.body;
        const userId = req.user.id;

        // Получить соединение и начать транзакцию
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Проверка прав
        const [listCheck] = await connection.execute('SELECT user_id FROM user_lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (listCheck.length === 0) {
            await connection.rollback();
            return res.status(403).json({ error: 'У вас нет прав на редактирование этого списка.' });
        }

        // Обновленная проверка формата
        if (!Array.isArray(newOrder) || newOrder.length === 0 || !newOrder.every(item => item.albumId && item.sortOrder)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Неверный или неполный формат нового порядка. Ожидается массив объектов {albumId, sortOrder}.' });
        }


        for (const item of newOrder) {
            const albumId = parseInt(item.albumId);
            const sortOrder = parseInt(item.sortOrder);

            if (isNaN(albumId) || isNaN(sortOrder)) {
                throw new Error('Некорректные значения albumId или sortOrder.');
            }

            // Обновление в рамках транзакции
            await connection.execute(
                'UPDATE user_list_albums SET sort_order = ? WHERE list_id = ? AND album_id = ?',
                [sortOrder, listId, albumId]
            );
        }

        // Завершить транзакцию
        await connection.commit();
        res.json({ message: 'Порядок списка успешно обновлен.' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Ошибка изменения порядка списка:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

module.exports = router;