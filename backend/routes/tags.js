// routes/tags.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// 1. Pobierz tagi dla albumu (dla okna modalnego)
router.get('/album/:albumId', authenticate, async (req, res) => {
    try {
        const { albumId } = req.params;
        const userId = req.user.id;

        const [rows] = await pool.execute(
            `SELECT id, tag_name FROM user_album_tags WHERE user_id = ? AND album_id = ? ORDER BY created_at ASC`,
            [userId, albumId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

// 2. Dodaj tag
router.post('/', authenticate, async (req, res) => {
    try {
        const { albumId, tagName } = req.body;
        const userId = req.user.id;

        if (!tagName || tagName.trim() === '') {
            return res.status(400).json({ error: 'Nazwa tagu jest wymagana' });
        }

        // Sprawdzenie duplikatów
        const [exists] = await pool.execute(
            `SELECT id FROM user_album_tags WHERE user_id = ? AND album_id = ? AND tag_name = ?`,
            [userId, albumId, tagName.trim()]
        );

        if (exists.length > 0) {
            return res.status(400).json({ error: 'Ten tag już istnieje' });
        }

        await pool.execute(
            `INSERT INTO user_album_tags (user_id, album_id, tag_name) VALUES (?, ?, ?)`,
            [userId, albumId, tagName.trim()]
        );

        res.json({ success: true, message: 'Tag został dodany' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Nie udało się dodać tagu' });
    }
});

// 3. Usuń tag
router.delete('/:tagId', authenticate, async (req, res) => {
    try {
        const { tagId } = req.params;
        const userId = req.user.id;

        await pool.execute(
            `DELETE FROM user_album_tags WHERE id = ? AND user_id = ?`,
            [tagId, userId]
        );

        res.json({ success: true, message: 'Tag został usunięty' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Nie udało się usunąć tagu' });
    }
});

// 4. Pobierz WSZYSTKIE tagi dla profilu
router.get('/my-tags', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT
                t.tag_name,
                a.title,
                a.slug,
                a.cover_url,
                a.release_date,
                (SELECT name FROM artists WHERE id = (SELECT artist_id FROM album_artists WHERE album_id = a.id AND is_main=1 LIMIT 1)) as artist_name
            FROM user_album_tags t
                     JOIN albums a ON t.album_id = a.id
            WHERE t.user_id = ?
            ORDER BY t.tag_name ASC, a.release_date DESC
        `;

        const [rows] = await pool.execute(query, [userId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Nie udało się pobrać tagów użytkownika' });
    }
});

// 5. (NOWE) Pobierz UNIKALNE tagi użytkownika (dla podpowiedzi)
router.get('/my-unique-tags', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            `SELECT DISTINCT tag_name FROM user_album_tags WHERE user_id = ? ORDER BY tag_name ASC`,
            [userId]
        );
        // Zwracamy prostą tablicę ciągów znaków
        res.json(rows.map(row => row.tag_name));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Nie udało się pobrać unikalnych tagów' });
    }
});

// Pobierz wszystkie unikalne tagi dla konkretnego albumu (widok publiczny)
router.get('/album-public/:albumId', async (req, res) => {
    try {
        const { albumId } = req.params;
        const [rows] = await pool.execute(
            `SELECT tag_name, COUNT(*) as usage_count
             FROM user_album_tags
             WHERE album_id = ?
             GROUP BY tag_name
             ORDER BY usage_count DESC`,
            [albumId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

module.exports = router;