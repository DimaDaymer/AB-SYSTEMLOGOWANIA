// routes/artist.js
const express = require('express');
const router = express.Router();
const slugify = require('slugify');

const adminAuthChain = require('../adminAuth');
const authMiddleware = require('../authMiddleware');

// Функция-помощник для парсинга JSON-поля
const parseJsonField = (field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    try {
        return JSON.parse(field);
    } catch (e) {
        return [];
    }
};

const optionalAuthMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        return authMiddleware(req, res, next);
    }
    next();
};

module.exports = (pool) => {

    async function isFollowing(artistId, userId) {
        if (!userId) return false;
        const [rows] = await pool.execute(
            `SELECT 1 FROM user_album_actions WHERE user_id = ? AND artist_id = ? AND action_type = 'follow'`,
            [userId, artistId]
        );
        return rows.length > 0;
    }

    router.get('/:slug', optionalAuthMiddleware, async (req, res) => {
        try {
            const { slug } = req.params;
            const userId = req.user ? req.user.id : null;

            // 1. Get Artist Info
            const [artistRows] = await pool.execute(
                `SELECT id, name, picture_url, slug, formed_year, origin_country, bio, description, albums_count, followers_count, artist_type
                 FROM artists WHERE slug = ?`, [slug]
            );

            if (artistRows.length === 0) return res.status(404).json({ error: 'Artist not found' });
            const artist = artistRows[0];

            // 2. Get Genres
            const [genresRows] = await pool.execute(
                `SELECT DISTINCT g.name FROM albums a
                                                 JOIN album_artists aa ON a.id = aa.album_id
                                                 JOIN album_genres ag ON a.id = ag.album_id
                                                 JOIN genres g ON ag.genre_id = g.id
                 WHERE aa.artist_id = ? LIMIT 5`, [artist.id]
            );
            artist.genres = genresRows.map(row => row.name);


            // 3. Get Discography + Stats + User Actions
            let actionSelect = '';
            let queryParams = [artist.id]; // Базовый параметр

            if (userId) {
                // Добавляем поля для статуса действий пользователя
                actionSelect = `
                    (SELECT 1 FROM user_album_actions uaa WHERE uaa.user_id = ? AND uaa.album_id = a.id AND uaa.action_type = 'like') AS is_liked,
                    (SELECT 1 FROM user_album_actions uaa WHERE uaa.user_id = ? AND uaa.album_id = a.id AND uaa.action_type = 'listen') AS is_listened,
                    (SELECT 1 FROM user_album_actions uaa WHERE uaa.user_id = ? AND uaa.album_id = a.id AND uaa.action_type = 'wishlist') AS is_wishlisted,
                `;
                // Добавляем userId три раза в начало параметров (для трех подзапросов)
                queryParams = [userId, userId, userId, artist.id];
            } else {
                // Если пользователь не авторизован, ставим 0
                actionSelect = `0 AS is_liked, 0 AS is_listened, 0 AS is_wishlisted,`;
                // queryParams остается только с artist.id
            }

            const albumsQuery = `
                SELECT a.id, a.title, a.slug, a.cover_url, a.release_date, a.description, rf.name AS format_name,
                        COALESCE(ast.avg_score, 0) AS average_rating, ast.ratings_count,
                        ${actionSelect}
                        (SELECT JSON_ARRAYAGG(ra.name) FROM album_release_attributes ara JOIN release_attributes ra ON ara.album_id = a.id) AS attributes
                 FROM albums a
                 JOIN album_artists aa ON a.id = aa.album_id
                 LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                 LEFT JOIN album_stats ast ON a.id = ast.album_id
                 WHERE aa.artist_id = ?
                 ORDER BY a.release_date DESC
            `;

            // Выполняем запрос
            const [albumsRows] = await pool.execute(albumsQuery, queryParams);

            // Calculate Global Artist Score
            let totalScore = 0;
            let ratedAlbumsCount = 0;
            const parsedAlbumsRows = albumsRows.map(row => ({
                ...row,
                attributes: parseJsonField(row.attributes),
                // MySQL возвращает TINYINT (1 или NULL) как число 1 или 0 (или null, если не авторизован).
                // Явно преобразуем, чтобы убедиться, что это булево значение.
                is_liked: !!row.is_liked,
                is_listened: !!row.is_listened,
                is_wishlisted: !!row.is_wishlisted
            }));

            parsedAlbumsRows.forEach(alb => {
                const score = parseFloat(alb.average_rating);
                if (score > 0) {
                    totalScore += score;
                    ratedAlbumsCount++;
                }
            });
            artist.globalScore = ratedAlbumsCount > 0 ? (totalScore / ratedAlbumsCount).toFixed(1) : "N/A";

            artist.isFollowing = await isFollowing(artist.id, userId);

            // Group Discography
            const discography = parsedAlbumsRows.reduce((acc, album) => {
                const primaryFormat = album.format_name;
                const primaryAttribute = album.attributes.length > 0 ? album.attributes[0] : null;

                let groupKey;
                if (primaryFormat && primaryAttribute) {
                    groupKey = `${primaryAttribute} ${primaryFormat}`;
                } else if (primaryFormat) {
                    groupKey = primaryFormat;
                } else if (primaryAttribute) {
                    groupKey = primaryAttribute;
                } else {
                    groupKey = 'Other';
                }

                if (!acc[groupKey]) acc[groupKey] = [];
                acc[groupKey].push({
                    ...album,
                    release_year: album.release_date ? new Date(album.release_date).getFullYear() : 'N/A'
                });
                return acc;
            }, {});

            res.json({ artist, discography });

        } catch (err) {
            console.error('Error:', err);
            res.status(500).json({ error: 'Server Error' });
        }
    });

    // ... (остальные маршруты: PATCH /:artistId и POST /:artistId/follow остаются без изменений) ...

    router.patch('/:artistId', adminAuthChain, async (req, res) => {
        const { name, picture_url, formed_year, origin_country, bio, description, artist_type } = req.body;
        const { artistId } = req.params;

        if (!artistId || !name) return res.status(400).json({ error: 'Missing artist ID or Name' });

        try {
            const newSlug = slugify(name, { lower: true, strict: true });

            await pool.execute(
                `UPDATE artists
                 SET name = ?, picture_url = ?, formed_year = ?, origin_country = ?, bio = ?, description = ?, slug = ?, artist_type = ?
                 WHERE id = ?`,
                [name, picture_url, formed_year, origin_country, bio, description, newSlug, artist_type || 'solo', artistId]
            );

            res.json({ success: true, message: 'Artist details updated successfully', slug: newSlug });
        } catch (err) {
            console.error('Error updating artist details:', err);
            res.status(500).json({ error: 'Failed to update details', details: err.message });
        }
    });

    router.post('/:artistId/follow', authMiddleware, async (req, res) => {
        const userId = req.user.id;
        const { artistId } = req.params;
        if (!userId) return res.status(401).json({ error: 'Auth required' });

        try {
            const artistID = parseInt(artistId);
            const isCurrentlyFollowing = await isFollowing(artistID, userId);
            let status;
            if (isCurrentlyFollowing) {
                await pool.execute(`DELETE FROM user_album_actions WHERE user_id = ? AND artist_id = ? AND action_type = 'follow'`, [userId, artistID]);
                await pool.execute(`UPDATE artists SET followers_count = followers_count - 1 WHERE id = ? AND followers_count > 0`, [artistID]);
                status = 'unfollowed';
            } else {
                await pool.execute(`INSERT INTO user_album_actions (user_id, artist_id, action_type) VALUES (?, ?, 'follow')`, [userId, artistID]);
                await pool.execute(`UPDATE artists SET followers_count = followers_count + 1 WHERE id = ?`, [artistID]);
                status = 'followed';
            }
            const [countRows] = await pool.execute(`SELECT followers_count FROM artists WHERE id = ?`, [artistID]);
            res.json({ status: status, followers_count: countRows[0].followers_count });
        } catch (err) {
            console.error('Follow failed:', err);
            res.status(500).json({ error: 'Follow failed' });
        }
    });

    return router;
};