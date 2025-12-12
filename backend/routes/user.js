// backend/routes/user.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const authorizeAdmin = require('../adminAuth');

// --- ОБНОВЛЕННЫЕ КОНСТАНТЫ ПОЛЕЙ ДЛЯ JOIN ---
// u - users (основные данные), p - user_profiles (данные профиля)
const PUBLIC_PROFILE_FIELDS = `
    u.id, u.username, u.role, u.created_at,
    p.first_name, p.last_name, p.birth_date, p.gender,
    p.location, p.country, p.social, p.description,
    p.music, p.movies, p.profile_pic
`;

const PRIVATE_PROFILE_FIELDS = `${PUBLIC_PROFILE_FIELDS}, u.email, p.contact_email`;
// u.email: Email теперь в таблице users и доступен владельцу

function processProfileData(user) {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const nickname = fullName || user.username;

    let age = null;
    if (user.birth_date) {
        const birth = new Date(user.birth_date);
        const now = new Date();
        age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
            age--;
        }
    }

    try {
        if (user.social && typeof user.social === 'string' && (user.social.startsWith('{') || user.social.startsWith('['))) {
            user.social = JSON.parse(user.social);
        }
    } catch (e) { /* ignore */ }

    return {
        ...user,
        nickname,
        age
    };
}


// === ПРИВАТНЫЕ РОУТЫ (Только для владельца) ===

// РОУТ: Получение СВОЕГО профиля
router.get('/me', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        // Используем JOIN для получения данных из обеих таблиц
        const [rows] = await pool.execute(
            `SELECT ${PRIVATE_PROFILE_FIELDS}
             FROM users u
                      LEFT JOIN user_profiles p ON u.id = p.user_id
             WHERE u.id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(processProfileData(rows[0]));
    } catch (err) {
        console.error('Error fetching user profile (/me):', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// РОУТ: Обновление профиля
router.put('/profile/update', authenticate, async (req, res) => {
    const userId = req.user.id;
    try {
        let {
            firstName, lastName, birthDate, gender,
            location, country, social, contactEmail,
            description, music, movies
        } = req.body;

        if (!birthDate || birthDate.trim() === '') birthDate = null;
        if (typeof social === 'object' && social !== null) social = JSON.stringify(social);
        // Используем INSERT...ON DUPLICATE KEY UPDATE для профиля (только user_profiles)
        await pool.execute(
            `INSERT INTO user_profiles (
                user_id, first_name, last_name, birth_date, gender,
                location, country, social, contact_email,
                description, music, movies
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                                  first_name = VALUES(first_name),
                                  last_name = VALUES(last_name),
                                  birth_date = VALUES(birth_date),
                                  gender = VALUES(gender),
                                  location = VALUES(location),
                                  country = VALUES(country),
                                  social = VALUES(social),
                                  contact_email = VALUES(contact_email),
                                  description = VALUES(description),
                                  music = VALUES(music),
                                  movies = VALUES(movies)`,
            [
                userId, firstName, lastName, birthDate, gender,
                location, country, social, contactEmail,
                description, music, movies
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// РОУТ: Оцененные альбомы (Свои)
// РОУТ: Оцененные альбомы (Свои)
router.get('/rated-albums', authenticate, async (req, res) => {
    return fetchRatedAlbums(req.user.id, res, req);
});

// РОУТ: Оценки треков (Свои)
router.get('/track-ratings', authenticate, async (req, res) => {
    return fetchTrackRatings(req.user.id, res);
});

// --- НОВЫЙ РОУТ: КОММЕНТАРИИ ПОЛЬЗОВАТЕЛЯ (Свои) ---
router.get('/reviews', authenticate, async (req, res) => {
    return fetchUserReviews(req.user.id, req, res);
});
// ----------------------------------------------------

// РОУТ: Получение всех пользователей (для Админа)
router.get('/admin/all-users', authorizeAdmin, async (req, res) => {
    try {
        // Запрос только к таблице users
        const [rows] = await pool.execute('SELECT id, username, email, role, created_at FROM users');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// === НОВЫЕ РОУТЫ: УВЕДОМЛЕНИЯ И ДРУЗЬЯ ===

// Получить уведомления текущего пользователя
router.get('/notifications/my', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT n.id, n.type, n.content, n.is_read, n.created_at,
                   u.username as sender_username, p.profile_pic as sender_pic
            FROM notifications n
                     LEFT JOIN users u ON n.sender_id = u.id
                     LEFT JOIN user_profiles p ON n.sender_id = p.user_id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC
            LIMIT 20
        `, [req.user.id]);
        res.json(rows);
    } catch (err) {
        console.error('Notifications error:', err);
        res.status(500).json({ error: 'Db error' });
    }
});

// Отметить уведомления как прочитанные
router.post('/notifications/read', authenticate, async (req, res) => {
    try {
        await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Db error' });
    }
});


// === ПУБЛИЧНЫЕ РОУТЫ (Для просмотра чужих профилей) ===

async function getUserIdByUsername(username) {
    // Ищем в таблице users
    const [rows] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    return rows.length > 0 ? rows[0].id : null;
}

// 1. Получение публичного профиля
router.get('/:username', async (req, res) => {
    try {
        const username = req.params.username;
        // Используем JOIN для получения данных из обеих таблиц
        const [rows] = await pool.execute(
            `SELECT ${PUBLIC_PROFILE_FIELDS}
             FROM users u
                      LEFT JOIN user_profiles p ON u.id = p.user_id
             WHERE u.username = ?`,
            [username]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(processProfileData(rows[0]));
    } catch (err) {
        console.error('Error fetching public profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// === ЛОГИКА ПОДПИСОК (FOLLOW) ===

// Подписаться на пользователя
router.post('/:username/follow', authenticate, async (req, res) => {
    const followerId = req.user.id;
    const targetUsername = req.params.username;

    try {
        const followedId = await getUserIdByUsername(targetUsername);
        if (!followedId) return res.status(404).json({ error: 'User not found' });
        if (followerId === followedId) return res.status(400).json({ error: 'Cannot follow yourself' });

        // 1. Добавляем запись в user_relations
        // IGNORE, чтобы не падать, если уже подписан
        await pool.execute(`
            INSERT IGNORE INTO user_relations (follower_id, followed_id, relation_type)
            VALUES (?, ?, 'follow')
        `, [followerId, followedId]);

        // 2. Получаем username того, КТО подписывается (для уведомления)
        const [me] = await pool.execute('SELECT username FROM users WHERE id = ?', [followerId]);
        const myUsername = me[0].username;

        // 3. Создаем уведомление для целевого юзера
        // Проверяем, нет ли уже недавнего уведомления такого же типа, чтобы не спамить
        await pool.execute(`
            INSERT INTO notifications (user_id, sender_id, type, content)
            VALUES (?, ?, 'new_follow', ?)
        `, [followedId, followerId, `${myUsername} subscribe on you`]);

        res.json({ success: true });
    } catch (err) {
        console.error('Follow error:', err);
        res.status(500).json({ error: 'Db error' });
    }
});

// Отписаться
router.delete('/:username/follow', authenticate, async (req, res) => {
    const followerId = req.user.id;
    try {
        const followedId = await getUserIdByUsername(req.params.username);
        if (!followedId) return res.status(404).json({ error: 'User not found' });

        await pool.execute(`
            DELETE FROM user_relations
            WHERE follower_id = ? AND followed_id = ?
        `, [followerId, followedId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Unfollow error:', err);
        res.status(500).json({ error: 'Db error' });
    }
});

// Проверить статус подписки (подписан ли Я на НЕГО)
router.get('/:username/is-following', authenticate, async (req, res) => {
    const followerId = req.user.id;
    try {
        const followedId = await getUserIdByUsername(req.params.username);
        if (!followedId) return res.json({ isFollowing: false });

        const [rows] = await pool.execute(`
            SELECT 1 FROM user_relations
            WHERE follower_id = ? AND followed_id = ?
        `, [followerId, followedId]);

        res.json({ isFollowing: rows.length > 0 });
    } catch (err) {
        res.status(500).json({ error: 'Db error' });
    }
});

// Получить список "Друзей" (Взаимные подписки)
router.get('/:username/friends', async (req, res) => {
    try {
        const userId = await getUserIdByUsername(req.params.username);
        if (!userId) return res.status(404).json({ error: 'User not found' });

        // Логика: Друзья = те, на кого подписан юзер (r1) И кто подписан на юзера (r2)
        const query = `
            SELECT u.username, p.profile_pic, p.first_name, p.last_name
            FROM user_relations r1
                     JOIN user_relations r2 ON r1.followed_id = r2.follower_id
                     JOIN users u ON u.id = r1.followed_id
                     LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE r1.follower_id = ?
              AND r2.followed_id = ?
            LIMIT 10
        `;

        const [rows] = await pool.execute(query, [userId, userId]);
        res.json(rows);

    } catch (err) {
        console.error('Friends fetch error:', err);
        res.status(500).json({ error: 'Db error' });
    }
});


// Остальные роуты (rated-albums и т.д.)
// Остальные роуты (rated-albums и т.д.)
router.get('/:username/rated-albums', async (req, res) => {
    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    return fetchRatedAlbums(userId, res, req);
});

router.get('/:username/track-ratings', async (req, res) => {
    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    return fetchTrackRatings(userId, res);
});

// --- НОВЫЙ РОУТ: КОММЕНТАРИИ ПОЛЬЗОВАТЕЛЯ (Публичные) ---
router.get('/:username/reviews', async (req, res) => {
    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    return fetchUserReviews(userId, req, res);
});
// --------------------------------------------------------

router.get('/:username/tags', async (req, res) => {
    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });

    try {
        const [rows] = await pool.execute(`
            SELECT uat.tag_name, a.title, a.cover_url, a.slug, a.release_date, ar.name as artist_name
            FROM user_album_tags uat
                     JOIN albums a ON uat.album_id = a.id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                     LEFT JOIN artists ar ON aa.artist_id = ar.id
            WHERE uat.user_id = ?
            ORDER BY uat.tag_name, a.title
        `, [userId]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching tags:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/:username/lists', async (req, res) => {
    try {
        const { username } = req.params;

        // 1. Найти ID пользователя по username
        const [userRows] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (userRows.length === 0) {
            // Важно: возвращаем JSON и статус 404
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        const userId = userRows[0].id;

        // 2. Получить списки этого пользователя
        const [lists] = await pool.execute(
            `SELECT
                 l.id, l.name, l.slug, l.description, l.created_at, l.cover_url,
                 COUNT(li.album_id) AS albums_count
             FROM lists l
                      LEFT JOIN list_items li ON l.id = li.list_id
             WHERE l.user_id = ?
             GROUP BY l.id, l.name, l.slug, l.description, l.created_at, l.cover_url
             ORDER BY l.created_at DESC`,
            [userId]
        );

        // ВАЖНО: Возвращаем данные в формате JSON
        res.json(lists);

    } catch (error) {
        console.error('Ошибка загрузки публичных списков:', error);
        // Возвращаем ошибку в формате JSON
        res.status(500).json({ error: 'Ошибка сервера при загрузке списков' });
    }
});

router.get('/:username/actions/:type', async (req, res) => {
    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    const type = req.params.type;

    try {
        const allowedTypes = ['listen', 'wishlist', 'like', 'add-to-list'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid action type' });
        }

        const [rows] = await pool.execute(`
            SELECT
                a.id,
                a.title,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist,
                a.cover_url,
                a.slug
            FROM user_album_actions uaa
                     JOIN albums a ON uaa.album_id = a.id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id
                     LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE uaa.user_id = ? AND uaa.action_type = ?
            GROUP BY a.id, a.title, a.cover_url, a.slug
            ORDER BY MAX(uaa.created_at) DESC /* <--- ИСПРАВЛЕНИЕ SQL: Используем MAX() */
        `, [userId, type]);
        res.json(rows);
    } catch (err) {
        console.error(`Error fetching actions ${type}:`, err);
        res.status(500).json({ error: 'Database error' });
    }
});


// === ОБЩИЕ ФУНКЦИИ ===

// --- НОВАЯ ОБЩАЯ ФУНКЦИЯ ДЛЯ КОММЕНТАРИЕВ ---
async function fetchUserReviews(userId, req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Query: Reviews + Album Info + Artist Name + User's Numeric Rating (if exists)
        const query = `
            SELECT
                r.id,
                r.title AS review_title,
                r.content,
                r.created_at,
                a.title AS album_title,
                a.slug,
                a.cover_url,
                rt.score AS user_score,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist
            FROM reviews r
            JOIN albums a ON r.album_id = a.id
            LEFT JOIN album_artists aa ON a.id = aa.album_id
            LEFT JOIN artists art ON aa.artist_id = art.id
            LEFT JOIN ratings rt ON r.user_id = rt.user_id AND r.album_id = rt.album_id
            WHERE r.user_id = ?
            GROUP BY r.id, r.title, r.content, r.created_at, a.title, a.slug, a.cover_url, rt.score
            ORDER BY r.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [reviews] = await pool.execute(query, [userId]);

        // Get total count for pagination
        const [countRows] = await pool.execute(
            'SELECT COUNT(*) as total FROM reviews WHERE user_id = ?',
            [userId]
        );

        res.json({
            items: reviews,
            total_count: countRows[0].total,
            page,
            limit
        });

    } catch (err) {
        console.error('Error fetching user reviews:', err);
        res.status(500).json({ error: 'Database error' });
    }
}
// ---------------------------------------------
// === НОВЫЙ ВСПОМОГАТЕЛЬНЫЙ БЛОК: Статистика оценок ===

// Вспомогательная функция для получения статистики оценок
async function getUserRatingStats(userId, res) {
    try {
        // Считаем количество альбомов для каждой оценки (от 0.5 до 5.0)
        const [rows] = await pool.execute(`
            SELECT score, COUNT(*) as count
            FROM ratings
            WHERE user_id = ?
            GROUP BY score
            ORDER BY score DESC
        `, [userId]);

        // Преобразуем в удобный объект, заполняя пропуски нулями
        const stats = {};
        for (let i = 5.0; i >= 0.5; i -= 0.5) {
            stats[i.toFixed(1)] = 0;
        }

        let totalRatings = 0;
        rows.forEach(row => {
            const scoreKey = parseFloat(row.score).toFixed(1);
            stats[scoreKey] = row.count;
            totalRatings += row.count;
        });

        res.json({ stats, totalRatings });
    } catch (err) {
        console.error('Error fetching rating stats:', err);
        res.status(500).json({ error: 'Db error' });
    }
}

// === РОУТ 1: Статистика ДЛЯ СЕБЯ (Обрабатывает /api/users/me/stats/ratings) ===
// ВАЖНО: Этот роут должен быть ОБЪЯВЛЕН РАНЬШЕ, чем /:username/stats/ratings
router.get('/me/stats/ratings', authenticate, async (req, res) => {
    // req.user.id берется из токена
    await getUserRatingStats(req.user.id, res);
});

// === РОУТ 2: Статистика ДЛЯ ЛЮБОГО ПОЛЬЗОВАТЕЛЯ (Обрабатывает /api/users/:username/stats/ratings) ===
router.get('/:username/stats/ratings', async (req, res) => {
    // Дополнительная проверка, чтобы /me не проскочил сюда без токена
    if (req.params.username === 'me') {
        return res.status(401).json({ error: 'Please log in' });
    }

    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });

    await getUserRatingStats(userId, res);
});
// -----------------------------------------------------------------------------------

// === РОУТ 1: Статистика ДЛЯ СЕБЯ (Токен обязателен) ===
// ВАЖНО: Этот роут должен быть ОБЪЯВЛЕН РАНЬШЕ, чем /:username/stats/ratings
router.get('/me/stats/ratings', authenticate, async (req, res) => {
    // req.user.id берется из токена middleware authenticate
    await getUserRatingStats(req.user.id, res);
});

// === РОУТ 2: Статистика ДЛЯ ЛЮБОГО ПОЛЬЗОВАТЕЛЯ (Публичный) ===
router.get('/:username/stats/ratings', async (req, res) => {
    // Если по какой-то причине запрос 'me' проскочил сюда без токена
    if (req.params.username === 'me') {
        return res.status(401).json({ error: 'Please log in' });
    }

    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });

    await getUserRatingStats(userId, res);
});
// === ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕЙ ФУНКЦИИ ===
// Замените старую функцию fetchRatedAlbums на эту обновленную версию
async function fetchRatedAlbums(userId, res, req) { // <-- Обратите внимание: добавлен req
    try {
        // Получаем параметры из query (если вызывается через API)
        const page = req ? (parseInt(req.query.page) || 1) : 1;
        const limit = req ? (parseInt(req.query.limit) || 10) : 10;
        const offset = (page - 1) * limit;
        const filterScore = req ? req.query.score : null; // Фильтр по оценке

        let query = `
            SELECT
                a.id,
                a.title,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist,
                a.cover_url,
                a.slug,
                r.score,
                r.created_at
            FROM ratings r
                     JOIN albums a ON r.album_id = a.id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id
                     LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE r.user_id = ?
        `;

        const params = [userId];

        // Если передан score, добавляем фильтрацию
        if (filterScore) {
            query += ` AND r.score = ?`;
            params.push(filterScore);
        }

        query += `
            GROUP BY a.id, a.title, a.cover_url, a.slug, r.score, r.created_at
            ORDER BY r.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [rows] = await pool.execute(query, params);

        // Получаем общее количество для пагинации
        let countQuery = 'SELECT COUNT(*) as total FROM ratings WHERE user_id = ?';
        const countParams = [userId];
        if (filterScore) {
            countQuery += ' AND score = ?';
            countParams.push(filterScore);
        }
        const [countRows] = await pool.execute(countQuery, countParams);

        // Если это вызов из роута, возвращаем JSON с пагинацией
        // (Проверка на то, является ли res объектом Express response)
        if (res.json) {
            res.json({
                items: rows,
                total_count: countRows[0].total,
                page,
                limit
            });
        } else {
            return rows; // Для внутреннего использования, если нужно
        }
    } catch (err) {
        console.error('Error fetching rated albums:', err);
        if (res.status) res.status(500).json({ error: 'Database error' });
    }
}

async function fetchTrackRatings(userId, res) {
    try {
        const [albums] = await pool.execute(`
            SELECT
                a.id,
                a.title,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist,
                a.cover_url,
                a.slug
            FROM albums a
                     JOIN tracks t ON a.id = t.album_id
                     JOIN track_ratings tr ON t.id = tr.track_id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id
                     LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE tr.user_id = ?
            GROUP BY a.id, a.title, a.cover_url, a.slug
            ORDER BY MAX(tr.created_at) DESC
        `, [userId]);

        for (const album of albums) {
            const [tracks] = await pool.execute(`
                SELECT t.id, t.track_number, t.title, t.duration, tr.score AS user_rating
                FROM tracks t
                         JOIN track_ratings tr ON t.id = tr.track_id
                WHERE t.album_id = ? AND tr.user_id = ?
                ORDER BY t.track_number
            `, [album.id, userId]);

            album.tracks = tracks;
        }

        res.json(albums);
    } catch (err) {
        console.error('Error fetching track ratings:', err);
        res.status(500).json({ error: 'Failed to load track ratings' });
    }
}

// === КОММЕНТАРИИ ПРОФИЛЯ (WALL) ===

// 1. Получить комментарии профиля (с пагинацией)
router.get('/:username/comments', async (req, res) => {
    try {
        const { username } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sort = req.query.sort || 'newest';

        // Вычисляем offset
        const offset = (page - 1) * limit;

        const profileId = await getUserIdByUsername(username);
        if (!profileId) return res.status(404).json({ error: 'User not found' });

        let orderBy = 'c.created_at DESC';
        if (sort === 'popular') orderBy = 'c.likes_count DESC, c.created_at DESC';

        // ИСПРАВЛЕНИЕ: Вставляем limit и offset прямо в строку,
        // убираем их из массива параметров [profileId]
        const [comments] = await pool.execute(`
            SELECT c.*,
                   u.username, u.role,
                   p.profile_pic,
                   (SELECT COUNT(*) FROM user_comments WHERE parent_id = c.id) as replies_count
            FROM user_comments c
                     JOIN users u ON c.author_id = u.id
                     LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE c.profile_user_id = ? AND c.parent_id IS NULL
            ORDER BY ${orderBy}
            LIMIT ${limit} OFFSET ${offset}
        `, [profileId]);

        // Считаем общее кол-во
        const [countRows] = await pool.execute(
            'SELECT COUNT(*) as total FROM user_comments WHERE profile_user_id = ? AND parent_id IS NULL',
            [profileId]
        );
        const total = countRows[0].total;

        res.json({
            comments,
            page,
            totalPages: Math.ceil(total / limit)
        });

    } catch (err) {
        console.error('Error fetching profile comments:', err);
        res.status(500).json({ error: 'Db error' });
    }
});

// 2. Получить ветку ответов (Thread)
router.get('/comments/thread/:parentId', async (req, res) => {
    try {
        const { parentId } = req.params;
        const [replies] = await pool.execute(`
            SELECT c.*,
                   u.username, u.role,
                   p.profile_pic
            FROM user_comments c
                     JOIN users u ON c.author_id = u.id
                     LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE c.parent_id = ?
            ORDER BY c.created_at ASC
        `, [parentId]);
        res.json(replies);
    } catch (err) {
        res.status(500).json({ error: 'Db error' });
    }
});

// 3. Оставить комментарий (или ответ)
router.post('/:username/comments', authenticate, async (req, res) => {
    try {
        const { username } = req.params;
        const { content, parentId } = req.body;
        const authorId = req.user.id;

        const profileId = await getUserIdByUsername(username);
        if (!profileId) return res.status(404).json({ error: 'User not found' });

        if (!content || !content.trim()) return res.status(400).json({ error: 'Empty content' });

        await pool.execute(`
            INSERT INTO user_comments (profile_user_id, author_id, content, parent_id)
            VALUES (?, ?, ?, ?)
        `, [profileId, authorId, content, parentId || null]);

        // Уведомление владельцу профиля (если пишет не он сам)
        if (profileId !== authorId) {
            const [me] = await pool.execute('SELECT username FROM users WHERE id = ?', [authorId]);
            const senderName = me[0].username;
            const type = parentId ? 'new_reply' : 'new_comment'; // new_reply нет в ENUM init.sql, используйте new_comment

            // Проверка на спам уведомлениями
            await pool.execute(`
                INSERT INTO notifications (user_id, sender_id, type, content, related_slug)
                VALUES (?, ?, 'new_comment', ?, ?)
            `, [profileId, authorId, `User ${senderName} commented on your profile`, username]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Db error' });
    }
});

// 4. Редактировать комментарий
router.put('/comments/:id', authenticate, async (req, res) => {
    try {
        const commentId = req.params.id;
        const authorId = req.user.id;
        const { content } = req.body;

        // Проверяем права (только автор может редактировать)
        const [check] = await pool.execute('SELECT author_id FROM user_comments WHERE id = ?', [commentId]);
        if (check.length === 0) return res.status(404).json({ error: 'Not found' });
        if (check[0].author_id !== authorId) return res.status(403).json({ error: 'Forbidden' });

        await pool.execute('UPDATE user_comments SET content = ? WHERE id = ?', [content, commentId]);

        // Возвращаем обновленный контент
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: 'Db error' });
    }
});

// 5. Лайкнуть комментарий
router.post('/comments/:id/vote', authenticate, async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user.id;

        // Проверяем, лайкнул ли уже
        const [existing] = await pool.execute(
            'SELECT 1 FROM user_comment_votes WHERE comment_id = ? AND user_id = ?',
            [commentId, userId]
        );

        let action;
        if (existing.length > 0) {
            // Убираем лайк
            await pool.execute('DELETE FROM user_comment_votes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
            await pool.execute('UPDATE user_comments SET likes_count = likes_count - 1 WHERE id = ?', [commentId]);
            action = 'removed';
        } else {
            // Ставим лайк
            await pool.execute('INSERT INTO user_comment_votes (comment_id, user_id) VALUES (?, ?)', [commentId, userId]);
            await pool.execute('UPDATE user_comments SET likes_count = likes_count + 1 WHERE id = ?', [commentId]);
            action = 'added';
        }

        res.json({ action });
    } catch (err) {
        res.status(500).json({ error: 'Db error' });
    }
});

module.exports = router;