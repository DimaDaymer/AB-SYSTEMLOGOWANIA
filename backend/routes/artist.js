// routes/artist.js
const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    // Маршрут для получения всей информации об исполнителе и его дискографии
    router.get('/:slug', async (req, res) => {
        try {
            const { slug } = req.params;

            // 1. Получение основной информации об исполнителе
            // ИСПРАВЛЕНИЕ: Удалено 'banner_url', так как его нет в вашей БД
            const [artistRows] = await pool.execute(
                `SELECT
                     id, name, picture_url, formed_year, origin_country,
                     genres_main, description, albums_count, followers_count
                 FROM artists
                 WHERE slug = ?`,
                [slug]
            );

            if (artistRows.length === 0) {
                return res.status(404).json({ error: 'Artist not found' });
            }

            const artist = artistRows[0];

            // 2. Получение дискографии
            const [albumsRows] = await pool.execute(
                `SELECT
                     a.title, a.slug, a.cover_url, a.release_date, a.type AS album_type,
                     COALESCE(AVG(r.score), 0) AS average_rating
                 FROM albums a
                          JOIN album_artists aa ON a.id = aa.album_id
                          LEFT JOIN ratings r ON a.id = r.album_id
                 WHERE aa.artist_id = ?
                 GROUP BY a.id, a.title, a.slug, a.cover_url, a.release_date, a.type
                 ORDER BY a.release_date DESC`,
                [artist.id]
            );

            // Группировка альбомов по типу
            const discography = albumsRows.reduce((acc, album) => {
                // Используем a.type из БД, переименованный в album_type
                const type = album.album_type || 'Other';
                if (!acc[type]) {
                    acc[type] = [];
                }
                acc[type].push({
                    ...album,
                    // Добавляем год выпуска для удобства фронтенда
                    release_year: album.release_date ? new Date(album.release_date).getFullYear() : 'N/A'
                });
                return acc;
            }, {});

            res.json({
                artist: artist,
                discography: discography
            });

        } catch (err) {
            console.error('Error fetching artist data:', err);
            res.status(500).json({ error: 'Failed to fetch artist data', message: err.message });
        }
    });

    return router;
};