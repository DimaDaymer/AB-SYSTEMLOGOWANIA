// backend/routes/artist.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { stringToArray } = require('../utils'); // Предполагается, что у вас есть утилита для преобразования строк в массивы

// Роут для получения данных исполнителя по его SLUG
router.get('/:artistSlug', async (req, res) => {
    let connection;
    try {
        const { artistSlug } = req.params;
        connection = await pool.getConnection();

        // 1. Получение основной информации об исполнителе
        const [artistRows] = await connection.execute(
            `SELECT * FROM artists WHERE slug = ?`,
            [artistSlug]
        );

        if (artistRows.length === 0) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        const artistData = artistRows[0];

        // 2. Преобразование полей из строки в массив (если они хранятся так)
        // Пример: genres, members, related_artists, also_known_as
        artistData.genres = stringToArray(artistData.genres);
        artistData.members = stringToArray(artistData.members);
        artistData.related_artists = stringToArray(artistData.related_artists);
        artistData.also_known_as = stringToArray(artistData.also_known_as);

        // 3. Получение дискографии (альбомы)
        const [discography] = await connection.execute(
            `SELECT 
                a.id, a.title, a.release_date, a.type, a.slug, a.cover_url,
                AVG(r.score) AS average_rating,
                COUNT(r.score) AS total_ratings
             FROM albums a
             LEFT JOIN ratings r ON a.id = r.album_id
             WHERE a.artist_id = ?
             GROUP BY a.id, a.title, a.release_date, a.type, a.slug, a.cover_url
             ORDER BY a.release_date DESC, a.title ASC`,
            [artistData.id]
        );

        // 4. Формирование окончательного ответа
        res.json({
            ...artistData,
            discography: discography
        });

    } catch (err) {
        console.error('Artist fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;