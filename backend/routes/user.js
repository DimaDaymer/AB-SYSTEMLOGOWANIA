// backend/routes/user.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const authorizeAdmin = require('../adminAuth');

const PUBLIC_PROFILE_FIELDS = `
    id, username, role, first_name, last_name, birth_date, gender,
    location, country, social, description,
    music, movies, profile_pic, created_at
`;

const PRIVATE_PROFILE_FIELDS = `${PUBLIC_PROFILE_FIELDS}, contact_email`;

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
        const [rows] = await pool.execute(
            `SELECT ${PRIVATE_PROFILE_FIELDS} FROM users WHERE id = ?`,
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
        if (typeof social === 'object') social = JSON.stringify(social);

        await pool.execute(
            `UPDATE users SET
                              first_name = ?, last_name = ?, birth_date = ?, gender = ?,
                              location = ?, country = ?, social = ?, contact_email = ?,
                              description = ?, music = ?, movies = ?
             WHERE id = ?`,
            [
                firstName, lastName, birthDate, gender,
                location, country, social, contactEmail,
                description, music, movies,
                userId
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// РОУТ: Оцененные альбомы (Свои)
router.get('/rated-albums', authenticate, async (req, res) => {
    return fetchRatedAlbums(req.user.id, res);
});

// РОУТ: Оценки треков (Свои)
router.get('/track-ratings', authenticate, async (req, res) => {
    return fetchTrackRatings(req.user.id, res);
});

router.get('/admin/all-users', authorizeAdmin, async (req, res) => {
    try {
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
                   u.username as sender_username, u.profile_pic as sender_pic
            FROM notifications n
                     LEFT JOIN users u ON n.sender_id = u.id
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
    const [rows] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    return rows.length > 0 ? rows[0].id : null;
}

// 1. Получение публичного профиля
router.get('/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const [rows] = await pool.execute(
            `SELECT ${PUBLIC_PROFILE_FIELDS} FROM users WHERE username = ?`,
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
        `, [followedId, followerId, `${myUsername} подписался на вас`]);

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
            SELECT u.username, u.profile_pic, u.first_name, u.last_name
            FROM user_relations r1
                     JOIN user_relations r2 ON r1.followed_id = r2.follower_id
                     JOIN users u ON u.id = r1.followed_id
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
router.get('/:username/rated-albums', async (req, res) => {
    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    return fetchRatedAlbums(userId, res);
});

router.get('/:username/track-ratings', async (req, res) => {
    const userId = await getUserIdByUsername(req.params.username);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    return fetchTrackRatings(userId, res);
});

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


// === ОБЩИЕ ФУНКЦИИ (Без изменений) ===

async function fetchRatedAlbums(userId, res) {
    try {
        const [rows] = await pool.execute(`
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
            GROUP BY a.id, a.title, a.cover_url, a.slug, r.score, r.created_at
            ORDER BY r.created_at DESC
        `, [userId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching rated albums:', err);
        res.status(500).json({ error: 'Database error' });
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

module.exports = router;