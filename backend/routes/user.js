//backend/routes/user.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const authenticate = require('../authMiddleware'); // Добавлен импорт

router.get('/profile', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    const username = req.query.username;

    if (!token || !username) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        const [rows] = await pool.execute(
            `SELECT 
                username, first_name, last_name, birth_date, gender,
                location, country, social, contact_email, description,
                music, movies
             FROM users
             WHERE username = ?`,
            [username]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = rows[0];

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

        res.json({
            ...user,
            nickname,
            age
        });
    } catch (err) {
        console.error(err);
        res.status(401).json({ error: 'Invalid token' });
    }
});

router.put('/profile/update', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const username = payload.username;

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

router.get('/rated-albums', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const username = payload.username;

        // В методе /rated-albums добавить slug в SELECT
        const [rows] = await pool.execute(`
            SELECT a.id, a.title, a.artist, a.cover_url, a.slug, r.score, r.created_at
            FROM ratings r
                     JOIN albums a ON r.album_id = a.id
            WHERE r.user_id = (SELECT id FROM users WHERE username = ?)
            ORDER BY r.created_at DESC
        `, [username]);

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});


router.get('/track-ratings', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        const [albums] = await pool.execute(`
            SELECT a.id, a.title, a.artist, a.cover_url, a.slug
            FROM albums a
                     JOIN tracks t ON a.id = t.album_id
                     JOIN track_ratings tr ON t.id = tr.track_id
            WHERE tr.user_id = ?
            GROUP BY a.id 
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