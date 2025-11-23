// backend/routes/user.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Убедитесь, что путь к db правильный относительно этого файла
const authenticate = require('../authMiddleware');
const authorizeAdmin = require('../adminAuth');

// ВАЖНО: Добавил profile_pic, id и created_at в список полей
const PUBLIC_PROFILE_FIELDS = `
    id, username, role, first_name, last_name, birth_date, gender,
    location, country, social, description,
    music, movies, profile_pic, created_at
`;

// Поля, видимые только владельцу профиля
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


// РОУТ: Получение профиля
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

// РОУТ: Оцененные альбомы
router.get('/rated-albums', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
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
});

// РОУТ: Оценки треков
router.get('/track-ratings', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        // Получаем список альбомов, где есть оценки треков пользователя
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
});

router.get('/admin/all-users', authorizeAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, username, email, role, created_at FROM users');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;