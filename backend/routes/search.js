const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // 1. Autouzupełnianie (sugestie) - limit 3-5 wyników dla każdego typu
    router.get('/suggestions', async (req, res) => {
        const query = req.query.q;
        if (!query || query.length < 2) return res.json([]);

        try {
            const searchTerm = `%${query}%`;

            // Artyści (picture_url)
            const [artists] = await pool.execute(
                'SELECT name as title, slug, picture_url, \'artist\' as type FROM artists WHERE name LIKE ? LIMIT 3',
                [searchTerm]
            );

            // Albumy (cover_url)
            const [albums] = await pool.execute(
                'SELECT title, slug, cover_url, \'album\' as type FROM albums WHERE title LIKE ? LIMIT 3',
                [searchTerm]
            );

            // Utwory (pobieramy cover_url z albumu)
            const [tracks] = await pool.execute(
                `SELECT t.title, t.slug, a.cover_url, 'track' as type
                 FROM tracks t
                          JOIN albums a ON t.album_id = a.id
                 WHERE t.title LIKE ? LIMIT 3`,
                [searchTerm]
            );

            // Listy (cover_url)
            const [lists] = await pool.execute(
                'SELECT name as title, slug, cover_url, \'list\' as type FROM lists WHERE name LIKE ? LIMIT 2',
                [searchTerm]
            );

            // Użytkownicy (profile_pic)
            const [users] = await pool.execute(
                `SELECT u.username as title, u.username as slug, up.profile_pic, 'user' as type
                 FROM users u
                          LEFT JOIN user_profiles up ON u.id = up.user_id
                 WHERE u.username LIKE ? LIMIT 2`,
                [searchTerm]
            );

            const results = [...artists, ...albums, ...tracks, ...lists, ...users];
            res.json(results);
        } catch (error) {
            console.error('Błąd sugestii wyszukiwania:', error);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 2. Pełne wyszukiwanie dla strony search.html
    router.get('/full', async (req, res) => {
        const query = req.query.q;
        if (!query) return res.json({ artists: [], albums: [], tracks: [], lists: [], users: [] });

        try {
            const searchTerm = `%${query}%`;

            const [artists] = await pool.execute('SELECT * FROM artists WHERE name LIKE ?', [searchTerm]);
            const [albums] = await pool.execute(`
                SELECT a.*, ar.name as artist_name
                FROM albums a
                         LEFT JOIN album_artists aa ON a.id = aa.album_id
                         LEFT JOIN artists ar ON aa.artist_id = ar.id
                WHERE a.title LIKE ?`, [searchTerm]);


            // Dla utworów pobieramy okładkę albumu
            const [tracks] = await pool.execute(`
                SELECT t.*, a.cover_url, a.title as album_title, ar.name as artist_name
                FROM tracks t
                         JOIN albums a ON t.album_id = a.id
                         JOIN album_artists aa ON a.id = aa.album_id
                         JOIN artists ar ON aa.artist_id = ar.id
                WHERE t.title LIKE ?`, [searchTerm]);
            const [lists] = await pool.execute(`
                SELECT l.*, u.username
                FROM lists l
                         JOIN users u ON l.user_id = u.id
                WHERE l.name LIKE ?`, [searchTerm]);

            const [users] = await pool.execute(`
                SELECT u.username, up.profile_pic
                FROM users u
                         LEFT JOIN user_profiles up ON u.id = up.user_id
                WHERE u.username LIKE ?`, [searchTerm]);

            res.json({ artists, albums, tracks, lists, users });
        } catch (error) {
            console.error('Błąd pełnego wyszukiwania:', error);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    return router;
};