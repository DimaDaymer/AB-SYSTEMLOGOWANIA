// backend/routes/user.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // Оставлен на случай, если где-то еще используется
const { pool } = require('../db');
const authenticate = require('../authMiddleware'); // Middleware для проверки токена и получения req.user
const authorizeAdmin = require('../adminAuth'); // <-- НОВИЙ ІМПОРТ

// Поля, общие для публичного и личного профиля
const PUBLIC_PROFILE_FIELDS = `
    username, role, first_name, last_name, birth_date, gender,
    location, country, social, description,
    music, movies
`; // <--- КРИТИЧНЕ ВИПРАВЛЕННЯ: role ДОДАНО

// Поля, видимые только владельцу профиля (/me)
const PRIVATE_PROFILE_FIELDS = `${PUBLIC_PROFILE_FIELDS}, contact_email`;


/**
 * Утилита для обработки необработанных данных пользователя из базы
 */
function processProfileData(user) {
    const nickname = `${user.first_name || ''} ${user.last_name || ''}`.trim();

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

    // Обработка JSON полей (если они хранятся как JSON-строки)
    try {
        user.social = user.social ? (typeof user.social === 'string' ? JSON.parse(user.social) : user.social) : {};
        // Добавьте сюда логику для music и movies, если они хранятся как JSON
    } catch (e) {
        console.error("Error parsing user data JSON:", e);
    }

    // Здесь можно добавить логику для получения profile_pic
    // user.profile_pic = ...

    return {
        ...user,
        nickname,
        age
    };
}


// --------------------------------------------------------------------------------------------------
// РОУТ 1: ПОЛУЧЕНИЕ ЛИЧНОГО ПРОФИЛЯ (/me) - Защищен токеном
// --------------------------------------------------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
    try {
        const userId = req.user.id; // ID пользователя из токена

        const [rows] = await pool.execute(
            `SELECT ${PRIVATE_PROFILE_FIELDS} FROM users WHERE id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // rows[0] теперь содержит поле role, которое будет возвращено клиенту
        res.json(processProfileData(rows[0]));
    } catch (err) {
        console.error('Error fetching user profile (/me):', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/admin/all-users', authorizeAdmin, async (req, res) => {
    try {
        // Запрос к базе данных для получения списка всех пользователей
        const [rows] = await pool.execute(
            'SELECT id, username, email, role, created_at FROM users'
        );

        res.json(rows);
    } catch (err) {
        console.error('Error fetching all users (Admin):', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --------------------------------------------------------------------------------------------------
// РОУТ 2: ОБНОВЛЕНИЕ ПРОФИЛЯ (/profile/update) - Защищен токеном
// --------------------------------------------------------------------------------------------------
router.put('/profile/update', authenticate, async (req, res) => {
    const username = req.user.username; // Имя пользователя из токена

    try {
        let {
            firstName, lastName, birthDate, gender,
            location, country, social, contactEmail,
            description, music, movies
        } = req.body;

        // Convert empty string birthDate to null
        if (!birthDate || birthDate.trim() === '') {
            birthDate = null;
        }

        const [result] = await pool.execute(
            `UPDATE users SET
                              first_name = ?, last_name = ?, birth_date = ?, gender = ?,
                              location = ?, country = ?, social = ?, contact_email = ?,
                              description = ?, music = ?, movies = ?
             WHERE username = ?`,
            [
                firstName, lastName, birthDate, gender,
                location, country, social, contactEmail,
                description, music, movies,
                username
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --------------------------------------------------------------------------------------------------
// РОУТ 3: ОЦЕНЕННЫЕ АЛЬБОМЫ (/rated-albums) - Защищен токеном
// --------------------------------------------------------------------------------------------------
router.get('/rated-albums', authenticate, async (req, res) => {
    try {
        const userId = req.user.id; // ID пользователя из токена

        const [rows] = await pool.execute(`
            SELECT
                a.id,
                a.title,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist, /* ИСПРАВЛЕНИЕ: Получение исполнителя через JOIN и GROUP_CONCAT */
                a.cover_url,
                a.slug,
                r.score,
                r.created_at
            FROM ratings r
                     JOIN albums a ON r.album_id = a.id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id
                     LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE r.user_id = ?
            GROUP BY a.id, a.title, a.cover_url, a.slug, r.score, r.created_at /* Добавление GROUP BY */
            ORDER BY r.created_at DESC
        `, [userId]);

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --------------------------------------------------------------------------------------------------
// РОУТ 4: ОЦЕНКИ ТРЕКОВ (/track-ratings) - Защищен токеном
// --------------------------------------------------------------------------------------------------
router.get('/track-ratings', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        const [albums] = await pool.execute(`
            SELECT
                a.id,
                a.title,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist, /* ИСПРАВЛЕНИЕ: Получение исполнителя через JOIN и GROUP_CONCAT */
                a.cover_url,
                a.slug
            FROM albums a
                     JOIN tracks t ON a.id = t.album_id
                     JOIN track_ratings tr ON t.id = tr.track_id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id
                     LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE tr.user_id = ?
            GROUP BY a.id, a.title, a.cover_url, a.slug /* Добавление GROUP BY */
            ORDER BY MAX(tr.created_at) DESC
        `, [userId]);

        for (const album of albums) {
            const [tracks] = await pool.execute(`
                SELECT t.id, t.track_number, t.title, t.duration, tr.rating AS user_rating
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

module.exports = router;