// backend/routes/userLists.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const { slugify } = require('transliteration');
const jwt = require('jsonwebtoken');
const { getPagination, getMeta } = require('../paginationHelper');

// Narzędzie: Sprawdzanie własności listy
async function checkListOwnership(listId, userId) {
    const [rows] = await pool.execute('SELECT id FROM lists WHERE id = ? AND user_id = ? LIMIT 1', [listId, userId]);
    return rows.length > 0;
}

// Pomocnik do parsowania pól JSON z bazy danych
const parseJsonField = (field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    try {
        return typeof field === 'string' ? JSON.parse(field) : field;
    } catch (e) {
        return [];
    }
};

// 1. Utwórz listę (Zabezpieczone transakcją)
router.post('/', authenticate, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { name, description, type = 'album' } = req.body;
        const userId = req.user.id;

        if (!name) {
            await connection.rollback();
            return res.status(400).json({ error: 'Nazwa jest wymagana' });
        }

        const validTypes = ['album', 'track', 'artist', 'user'];
        if (!validTypes.includes(type)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Nieprawidłowy typ listy' });
        }

        const baseSlug = slugify(name);
        const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

        // 1. Insert List
        const [result] = await connection.execute(
            'INSERT INTO lists (name, description, user_id, slug, type, cover_url) VALUES (?, ?, ?, ?, ?, ?)',
            [name, description, userId, slug, type, null]
        );

        const newListId = result.insertId;

        // 2. Insert Stats (Używamy INSERT IGNORE lub ON DUPLICATE KEY dla bezpieczeństwa)
        await connection.execute(
            'INSERT INTO list_stats (list_id) VALUES (?) ON DUPLICATE KEY UPDATE list_id = list_id',
            [newListId]
        );

        await connection.commit();
        res.status(201).json({ message: 'Lista została utworzona', listId: newListId, slug, type });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Błąd tworzenia listy:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    } finally {
        if (connection) connection.release();
    }
});

// 2. Pobierz moje listy (Użytkownik zalogowany)
router.get('/my-lists', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [lists] = await pool.execute(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at, ul.cover_url, ul.type,
                   (SELECT COUNT(*) FROM list_items WHERE list_id = ul.id) as items_count,
                   u.username
            FROM lists ul
                     JOIN users u ON ul.user_id = u.id
            WHERE ul.user_id = ?
            ORDER BY ul.created_at DESC
        `, [userId]);

        const listsWithCovers = lists.map(list => ({
            ...list,
            cover_url: list.cover_url || '/img/default-artist.png'
        }));

        res.json(listsWithCovers);
    } catch (error) {
        console.error('Błąd pobierania moich list:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// 3. Pobierz listy konkretnego użytkownika (Profil publiczny)
router.get('/user/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;

        let targetUserId = parseInt(identifier);
        if (isNaN(targetUserId)) {
            const [uRows] = await pool.execute('SELECT id FROM users WHERE username = ?', [identifier]);
            if (uRows.length === 0) return res.status(404).json({ error: 'Użytkownik nie został znaleziony' });
            targetUserId = uRows[0].id;
        }

        const [lists] = await pool.execute(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at, ul.cover_url, ul.type,
                   (SELECT COUNT(*) FROM list_items WHERE list_id = ul.id) as items_count,
                   u.username
            FROM lists ul
                     JOIN users u ON ul.user_id = u.id
            WHERE ul.user_id = ?
            ORDER BY ul.created_at DESC
        `, [targetUserId]);

        const listsWithCovers = lists.map(list => ({
            ...list,
            cover_url: list.cover_url || '/img/default-artist.png'
        }));

        res.json(listsWithCovers);
    } catch (error) {
        console.error('Błąd bazy danych w listach użytkownika:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// 4. Pobierz listy globalne
router.get('/global', async (req, res) => {
    try {
        const { page, limit, offset } = getPagination(req, 50);
        const { type, sortBy } = req.query;

        let whereClause = 'WHERE 1=1';
        let orderClause = 'ORDER BY ul.created_at DESC';
        let params = [];

        if (type && type !== 'all') {
            whereClause += ' AND ul.type = ?';
            params.push(type);
        }

        if (sortBy === 'items_count_desc') {
            orderClause = 'ORDER BY items_count DESC';
        } else if (sortBy === 'reviews_desc') {
            orderClause = 'ORDER BY IFNULL(ls.reviews_count, 0) DESC';
        }

        // Optymalizacja: Count tylko na indeksach jeśli to możliwe
        const [countRows] = await pool.execute(`SELECT COUNT(*) as total FROM lists ul ${whereClause}`, params);
        const total = countRows[0].total;

        const [lists] = await pool.query(`
            SELECT ul.id, ul.name, ul.slug, ul.description, ul.created_at, ul.cover_url, ul.type,
                   (SELECT COUNT(*) FROM list_items WHERE list_id = ul.id) as items_count,
                   u.username, u.id as author_id,
                   IFNULL(ls.reviews_count, 0) as reviews_count
            FROM lists ul
                     JOIN users u ON ul.user_id = u.id
                     LEFT JOIN list_stats ls ON ul.id = ls.list_id
                ${whereClause}
                ${orderClause}
            LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `, params);

        res.json({
            lists: lists.map(l => ({ ...l, cover_url: l.cover_url || '/img/default-artist.png' })),
            meta: getMeta(total, page, limit)
        });
    } catch (error) {
        console.error('Błąd globalnych list:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// 5. Szczegóły listy
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        let { sortBy } = req.query;

        const { page, limit, offset } = getPagination(req, 50);
        const safeLimit = Number(limit);
        const safeOffset = Number(offset);

        let currentUserId = 0;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            try {
                if (process.env.JWT_SECRET) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    currentUserId = decoded.id;
                }
            } catch (e) {}
        }

        const [lists] = await pool.execute(`
            SELECT l.*, u.username as creator_name, u.id as creator_id
            FROM lists l
                     JOIN users u ON l.user_id = u.id
            WHERE l.slug = ?
        `, [slug]);

        if (lists.length === 0) return res.status(404).json({ error: 'Lista nie została znaleziona' });
        const list = lists[0];

        const [countRows] = await pool.execute(
            'SELECT COUNT(*) as total FROM list_items WHERE list_id = ?',
            [list.id]
        );
        const totalItems = countRows[0].total;

        if (!sortBy) sortBy = 'sort_order_asc';

        let itemsQuery = '';
        let params = [];
        let orderByClause = 'ORDER BY li.sort_order ASC';

        // Logika sortowania
        if (sortBy === 'title_asc') orderByClause = list.type === 'album' ? 'ORDER BY a.title ASC' : (list.type === 'track' ? 'ORDER BY t.title ASC' : (list.type === 'artist' ? 'ORDER BY art.name ASC' : 'ORDER BY u.username ASC'));
        if (sortBy === 'rating_desc') {
            if (list.type === 'album') orderByClause = 'ORDER BY s.avg_score DESC';
            if (list.type === 'track') orderByClause = 'ORDER BY ts.avg_score DESC';
            if (list.type === 'artist') orderByClause = 'ORDER BY global_score DESC';
        }
        if (sortBy === 'added_asc') orderByClause = 'ORDER BY li.id ASC';
        if (sortBy === 'added_desc') orderByClause = 'ORDER BY li.id DESC';


        if (list.type === 'album') {
            params = [currentUserId, currentUserId, currentUserId, list.id];
            itemsQuery = `
                SELECT
                    a.id, a.title, a.cover_url, a.slug, a.release_date, 'album' as type,
                    s.avg_score,
                    s.ratings_count as listens_count,
                    s.ratings_count,
                    s.reviews_count, s.likes_count, s.wishlist_count, s.in_lists_count,
                    rf.name as format_name,
                    (SELECT GROUP_CONCAT(art.name SEPARATOR ', ') FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id AND aa.is_main = 1) as artist_name,
                    (SELECT JSON_ARRAYAGG(g.name) FROM album_genres ag JOIN genres g ON ag.genre_id = g.id WHERE ag.album_id = a.id) as genres,
                    (SELECT JSON_ARRAYAGG(d.name) FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id WHERE ad.album_id = a.id) as descriptors,
                    (SELECT JSON_ARRAYAGG(ra.name) FROM album_release_attributes ara JOIN release_attributes ra ON ara.attribute_id = ra.id WHERE ara.album_id = a.id) as album_attributes,
                    li.sort_order,
                    (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'like') as is_liked,
                    (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'listen') as is_listened,
                    (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'wishlist') as is_wishlisted
                FROM list_items li
                         JOIN albums a ON li.entity_id = a.id
                         LEFT JOIN album_stats s ON a.id = s.album_id
                         LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                WHERE li.list_id = ?
                GROUP BY a.id, li.sort_order, li.id
                    ${orderByClause}
                LIMIT ${safeLimit} OFFSET ${safeOffset}
            `;
        } else if (list.type === 'track') {
            params = [list.id];
            itemsQuery = `
                SELECT
                    t.id, t.title, t.slug, t.duration, 'track' as type,
                    a.title as album_title, a.slug as album_slug, a.cover_url, a.release_date as release_date,
                    (SELECT GROUP_CONCAT(art.name SEPARATOR ', ') FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id AND aa.is_main = 1) as artist_name,
                    ts.avg_score, ts.ratings_count, ts.reviews_count, ts.in_lists_count,
                    ast.likes_count as album_likes, ast.ratings_count as album_listens, ast.wishlist_count as album_wishlist,
                    (SELECT JSON_ARRAYAGG(g.name) FROM album_genres ag JOIN genres g ON ag.genre_id = g.id WHERE ag.album_id = a.id) as genres,
                    (SELECT JSON_ARRAYAGG(d.name) FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id WHERE ad.album_id = a.id) as descriptors,
                    li.sort_order
                FROM list_items li
                         JOIN tracks t ON li.entity_id = t.id
                         JOIN albums a ON t.album_id = a.id
                         LEFT JOIN tracks_stats ts ON t.id = ts.track_id
                         LEFT JOIN album_stats ast ON a.id = ast.album_id
                WHERE li.list_id = ?
                GROUP BY t.id, li.sort_order, li.id
                    ${orderByClause}
                LIMIT ${safeLimit} OFFSET ${safeOffset}
            `;
        } else if (list.type === 'artist') {
            params = [currentUserId, list.id];
            itemsQuery = `
                SELECT
                    art.id, art.name, art.slug, art.picture_url, art.artist_type,
                    (SELECT JSON_ARRAY(loc.name) FROM locations loc JOIN artist_locations al ON loc.id = al.location_id WHERE al.artist_id = art.id LIMIT 1) as locations,
                    'artist' as type,
                    stats.followers_count, stats.in_lists_count, stats.reviews_count,
                    
                    (SELECT AVG(ast.avg_score) FROM album_stats ast JOIN album_artists aa ON ast.album_id = aa.album_id WHERE aa.artist_id = art.id AND ast.avg_score > 0) as avg_score,
                    (SELECT AVG(ast.avg_score) FROM album_stats ast JOIN album_artists aa ON ast.album_id = aa.album_id WHERE aa.artist_id = art.id AND ast.avg_score > 0) as global_score,
                    
                    (SELECT COUNT(*) FROM user_album_actions uaa WHERE uaa.artist_id = art.id AND uaa.action_type = 'follow' AND uaa.user_id = ?) as is_following,
                    (SELECT JSON_ARRAYAGG(g.name) FROM (SELECT DISTINCT g2.name FROM genres g2 JOIN album_genres ag ON g2.id = ag.genre_id JOIN album_artists aa ON ag.album_id = aa.album_id WHERE aa.artist_id = art.id LIMIT 5) as g) as genres,
                    (SELECT JSON_ARRAYAGG(d.name) FROM (SELECT DISTINCT d2.name FROM descriptors d2 JOIN album_descriptors ad ON d2.id = ad.descriptor_id JOIN album_artists aa ON ad.album_id = aa.album_id WHERE aa.artist_id = art.id LIMIT 5) as d) as descriptors,
                    li.sort_order
                FROM list_items li
                         JOIN artists art ON li.entity_id = art.id
                         LEFT JOIN artist_stats stats ON art.id = stats.artist_id
                WHERE li.list_id = ?
                GROUP BY art.id, li.sort_order, li.id
                    ${orderByClause}
                LIMIT ${safeLimit} OFFSET ${safeOffset}
            `;
        } else if (list.type === 'user') {
            params = [currentUserId, list.id];
            itemsQuery = `
                SELECT
                    u.id, u.username, 'user' as type,
                    up.profile_pic, up.first_name, up.last_name,
                    (SELECT COUNT(*) FROM user_relations ur WHERE ur.follower_id = ? AND ur.followed_id = u.id) as is_following,
                    li.sort_order
                FROM list_items li
                         JOIN users u ON li.entity_id = u.id
                         LEFT JOIN user_profiles up ON u.id = up.user_id
                WHERE li.list_id = ?
                    ${orderByClause}
                LIMIT ${safeLimit} OFFSET ${safeOffset}
            `;
        }

        const [items] = await pool.query(itemsQuery, params);

        res.json({
            id: list.id,
            name: list.name,
            description: list.description,
            cover_url: list.cover_url,
            type: list.type,
            user_id: list.creator_id,
            creator: list.creator_name,
            created_at: list.created_at,
            saved_sort_by: 'sort_order_asc',
            applied_sort_by: sortBy,
            meta: getMeta(totalItems, page, safeLimit),
            items: items.map(item => ({
                ...item,
                avg_score: item.avg_score ? parseFloat(item.avg_score) : 0,
                genres: parseJsonField(item.genres),
                descriptors: parseJsonField(item.descriptors),
                is_liked: !!item.is_liked,
                is_listened: !!item.is_listened,
                is_wishlisted: !!item.is_wishlisted,
                is_following: !!item.is_following
            }))
        });
    } catch (error) {
        console.error('Błąd szczegółów listy:', error);
        res.status(500).json({ error: 'Błąd bazy danych: ' + error.message });
    }
});

// 6. Dodaj element
router.post('/:listId/add', authenticate, async (req, res) => {
    try {
        const { listId } = req.params;
        const { entityId } = req.body;
        const userId = req.user.id;

        const isOwner = await checkListOwnership(listId, userId);
        if (!isOwner) return res.status(403).json({ error: 'Nie masz uprawnień właściciela' });

        const [listRows] = await pool.execute('SELECT type FROM lists WHERE id = ?', [listId]);
        const listType = listRows[0].type;

        const [existing] = await pool.execute('SELECT 1 FROM list_items WHERE list_id = ? AND entity_id = ?', [listId, entityId]);
        if (existing.length > 0) return res.status(409).json({ message: 'Element już znajduje się na liście' });

        const [maxOrder] = await pool.execute('SELECT MAX(sort_order) as max_val FROM list_items WHERE list_id = ?', [listId]);
        const nextOrder = (maxOrder[0].max_val || 0) + 1;

        await pool.execute('INSERT INTO list_items (list_id, entity_id, sort_order) VALUES (?, ?, ?)', [listId, entityId, nextOrder]);

        // Aktualizacja liczników (optymalizacja: bez czekania na await, jeśli nie jest krytyczne, ale tu dla pewności zostawiamy await)
        if (listType === 'album') {
            await pool.execute('INSERT INTO album_stats (album_id, in_lists_count) VALUES (?, 1) ON DUPLICATE KEY UPDATE in_lists_count = in_lists_count + 1', [entityId]);
        } else if (listType === 'track') {
            await pool.execute('INSERT INTO tracks_stats (track_id, in_lists_count) VALUES (?, 1) ON DUPLICATE KEY UPDATE in_lists_count = in_lists_count + 1', [entityId]);
        } else if (listType === 'artist') {
            await pool.execute('INSERT INTO artist_stats (artist_id, in_lists_count) VALUES (?, 1) ON DUPLICATE KEY UPDATE in_lists_count = in_lists_count + 1', [entityId]);
        }

        res.json({ message: 'Dodano' });
    } catch (error) {
        console.error('Błąd dodawania elementu:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// 7. Usuń element
router.delete('/:listId/items/:entityId', authenticate, async (req, res) => {
    try {
        const { listId, entityId } = req.params;
        const userId = req.user.id;

        const isOwner = await checkListOwnership(listId, userId);
        if (!isOwner) return res.status(403).json({ error: 'Brak uprawnień' });

        const [listRows] = await pool.execute('SELECT type FROM lists WHERE id = ?', [listId]);
        const listType = listRows[0].type;

        await pool.execute('DELETE FROM list_items WHERE list_id = ? AND entity_id = ?', [listId, entityId]);

        if (listType === 'album') {
            await pool.execute('UPDATE album_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE album_id = ?', [entityId]);
        } else if (listType === 'track') {
            await pool.execute('UPDATE tracks_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE track_id = ?', [entityId]);
        } else if (listType === 'artist') {
            await pool.execute('UPDATE artist_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE artist_id = ?', [entityId]);
        }

        res.json({ message: 'Usunięto' });
    } catch (error) {
        console.error('Błąd usuwania elementu:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// 8. Zmień kolejność
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
            return res.status(403).json({ error: 'Brak uprawnień' });
        }

        for (const item of newOrder) {
            await connection.execute(
                'UPDATE list_items SET sort_order = ? WHERE list_id = ? AND entity_id = ?',
                [item.sortOrder, listId, item.entityId]
            );
        }

        await connection.commit();
        res.json({ message: 'Kolejność została zapisana' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Błąd zmiany kolejności:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    } finally {
        if (connection) connection.release();
    }
});

// 9. Aktualizuj metadane
router.put('/:listId', authenticate, async (req, res) => {
    try {
        const { listId } = req.params;
        const { name, description, cover_url } = req.body;
        const userId = req.user.id;

        const isOwner = await checkListOwnership(listId, userId);
        if (!isOwner) return res.status(403).json({ error: 'Nie jesteś właścicielem' });

        let updates = [];
        let params = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (cover_url !== undefined) { updates.push('cover_url = ?'); params.push(cover_url); }

        if (updates.length === 0) return res.status(400).json({ error: 'Brak danych do aktualizacji' });

        const sql = `UPDATE lists SET ${updates.join(', ')} WHERE id = ?`;
        params.push(listId);

        await pool.execute(sql, params);
        res.json({ message: 'Lista została zaktualizowana' });
    } catch (error) {
        console.error('Błąd aktualizacji listy:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// 10. Usuń listę
router.delete('/:listId', authenticate, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { listId } = req.params;
        const userId = req.user.id;

        const [check] = await connection.execute('SELECT id, type FROM lists WHERE id = ? AND user_id = ?', [listId, userId]);
        if (check.length === 0) {
            await connection.rollback();
            return res.status(403).json({ error: 'Brak uprawnień' });
        }
        const listType = check[0].type;

        const [items] = await connection.execute('SELECT entity_id FROM list_items WHERE list_id = ?', [listId]);

        for (const item of items) {
            if (listType === 'album') {
                await connection.execute('UPDATE album_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE album_id = ?', [item.entity_id]);
            } else if (listType === 'track') {
                await connection.execute('UPDATE tracks_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE track_id = ?', [item.entity_id]);
            } else if (listType === 'artist') {
                await connection.execute('UPDATE artist_stats SET in_lists_count = GREATEST(in_lists_count - 1, 0) WHERE artist_id = ?', [item.entity_id]);
            }
        }

        await connection.execute('DELETE FROM list_items WHERE list_id = ?', [listId]);
        await connection.execute('DELETE FROM list_stats WHERE list_id = ?', [listId]);
        await connection.execute('DELETE FROM lists WHERE id = ?', [listId]);

        await connection.commit();
        res.json({ message: 'Lista została usunięta' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Błąd usuwania listy:', error);
        res.status(500).json({ error: 'Błąd serwera' });
    } finally {
        if (connection) connection.release();
    }
});

// 11-13. Listy dla konkretnych encji
router.get('/for-album/:albumId', async (req, res) => {
    try {
        const { albumId } = req.params;
        const limit = parseInt(req.query.limit) || 5;
        const offset = parseInt(req.query.offset) || 0;
        const [countRows] = await pool.execute(`SELECT COUNT(DISTINCT l.id) AS total FROM lists l JOIN list_items li ON l.id = li.list_id WHERE li.entity_id = ? AND l.type = 'album'`, [albumId]);
        const [lists] = await pool.query(`SELECT DISTINCT l.id, l.name, l.slug, l.description, l.created_at, l.cover_url, u.username, (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS items_count FROM lists l JOIN list_items li ON l.id = li.list_id JOIN users u ON l.user_id = u.id WHERE li.entity_id = ? AND l.type = 'album' ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [albumId]);
        res.json({ lists: lists.map(l => ({ ...l, cover_url: l.cover_url || '/img/default-artist.png' })), total: countRows[0].total, limit, offset });
    } catch (e) { res.status(500).json({ error: 'Błąd serwera' }); }
});

router.get('/for-artist/:artistId', async (req, res) => {
    try {
        const { artistId } = req.params;
        const limit = parseInt(req.query.limit) || 5;
        const offset = parseInt(req.query.offset) || 0;
        const [countRows] = await pool.execute(`SELECT COUNT(DISTINCT l.id) AS total FROM lists l JOIN list_items li ON l.id = li.list_id WHERE li.entity_id = ? AND l.type = 'artist'`, [artistId]);
        const [lists] = await pool.query(`SELECT DISTINCT l.id, l.name, l.slug, l.description, l.created_at, l.cover_url, u.username, (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS items_count FROM lists l JOIN list_items li ON l.id = li.list_id JOIN users u ON l.user_id = u.id WHERE li.entity_id = ? AND l.type = 'artist' ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [artistId]);
        res.json({ lists: lists.map(l => ({ ...l, cover_url: l.cover_url || '/img/default-artist.png' })), total: countRows[0].total, limit, offset });
    } catch (e) { res.status(500).json({ error: 'Błąd serwera' }); }
});

router.get('/for-track/:trackId', async (req, res) => {
    try {
        const { trackId } = req.params;
        const limit = parseInt(req.query.limit) || 5;
        const offset = parseInt(req.query.offset) || 0;
        const [countRows] = await pool.execute(`SELECT COUNT(DISTINCT l.id) AS total FROM lists l JOIN list_items li ON l.id = li.list_id WHERE li.entity_id = ? AND l.type = 'track'`, [trackId]);
        const [lists] = await pool.query(`SELECT DISTINCT l.id, l.name, l.slug, l.description, l.created_at, l.cover_url, u.username, (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS items_count FROM lists l JOIN list_items li ON l.id = li.list_id JOIN users u ON l.user_id = u.id WHERE li.entity_id = ? AND l.type = 'track' ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [trackId]);
        res.json({ lists: lists.map(l => ({ ...l, cover_url: l.cover_url || '/img/default-artist.png' })), total: countRows[0].total, limit, offset });
    } catch (e) { res.status(500).json({ error: 'Błąd serwera' }); }
});

module.exports = router;