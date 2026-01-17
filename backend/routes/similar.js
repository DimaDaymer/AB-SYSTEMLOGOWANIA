const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    const isTop = (id) => id === 'top' || isNaN(id);

    const getPaginationParams = (req) => {
        const limit = parseInt(req.query.limit) || 6;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;
        return { limit, page, offset };
    };

    // --- ALBUMY ---
    // --- ALBUMY ---
    router.get('/albums/:id', async (req, res) => {
        try {
            const idParam = req.params.id;
            const { limit, page, offset } = getPaginationParams(req);
            let queryParams = [];
            let countQuery, dataQuery, countParams;

            if (isTop(idParam)) {
                countQuery = `SELECT COUNT(*) as total FROM albums`;
                dataQuery = `
                    SELECT a.id, a.title, a.cover_url, a.slug,
                           art.name as artist_name
                    FROM albums a
                             LEFT JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                             LEFT JOIN artists art ON aa.artist_id = art.id
                             LEFT JOIN album_stats s ON a.id = s.album_id
                    ORDER BY s.avg_score DESC, a.id DESC
                    LIMIT ? OFFSET ?`;
                queryParams = [limit, offset];
                countParams = [];
            } else {
                const albumId = parseInt(idParam);
                const excludeArtistQuery = `SELECT artist_id FROM album_artists WHERE album_id = ?`;

                // Liczymy unikalnych artystów, bo wyświetlamy po 1 albumie na artystę
                countQuery = `
                    SELECT COUNT(DISTINCT aa.artist_id) as total
                    FROM albums a
                             JOIN album_genres ag1 ON a.id = ag1.album_id
                             JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                    WHERE ag1.genre_id IN (SELECT genre_id FROM album_genres WHERE album_id = ?)
                      AND a.id != ?
                      AND aa.artist_id NOT IN (${excludeArtistQuery})`;

                // Używamy CTE i ROW_NUMBER() aby pobrać tylko najlepszy album dla każdego artysty
                dataQuery = `
                    WITH RankedAlbums AS (
                        SELECT a.id, a.title, a.cover_url, a.slug, art.name as artist_name,
                               COUNT(ag1.genre_id) as similarity_score,
                               ROW_NUMBER() OVER (PARTITION BY art.id ORDER BY COUNT(ag1.genre_id) DESC, a.id DESC) as rn
                        FROM albums a
                                 JOIN album_genres ag1 ON a.id = ag1.album_id
                                 LEFT JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                                 LEFT JOIN artists art ON aa.artist_id = art.id
                        WHERE ag1.genre_id IN (SELECT genre_id FROM album_genres WHERE album_id = ?)
                          AND a.id != ?
                          AND aa.artist_id NOT IN (${excludeArtistQuery})
                        GROUP BY a.id, art.id, art.name
                    )
                    SELECT id, title, cover_url, slug, artist_name, similarity_score
                    FROM RankedAlbums
                    WHERE rn = 1
                    ORDER BY similarity_score DESC, id DESC
                    LIMIT ? OFFSET ?`;

                queryParams = [albumId, albumId, albumId, limit, offset];
                countParams = [albumId, albumId, albumId];
            }

            const [[{ total }]] = await pool.query(countQuery, countParams);
            const [rows] = await pool.query(dataQuery, queryParams);

            res.json({
                items: rows,
                meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // --- ARTYŚCI ---
    router.get('/artists/:id', async (req, res) => {
        try {
            const idParam = req.params.id;
            const { limit, page, offset } = getPaginationParams(req);

            if (isTop(idParam)) {
                const [rows] = await pool.query(`
                    SELECT id, name, slug, picture_url FROM artists
                    ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset]);
                const [[{total}]] = await pool.query(`SELECT COUNT(*) as total FROM artists`);
                return res.json({
                    items: rows,
                    meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
                });
            }

            const artistId = parseInt(idParam);
            const dataQuery = `
                SELECT target_art.id, target_art.name, target_art.slug, target_art.picture_url,
                       COUNT(DISTINCT ag_target.genre_id) as common_genres_count,
                       GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', ') as genre_names
                FROM artists target_art
                         JOIN album_artists aa_target ON target_art.id = aa_target.artist_id
                         JOIN album_genres ag_target ON aa_target.album_id = ag_target.album_id
                         JOIN genres g ON ag_target.genre_id = g.id
                WHERE ag_target.genre_id IN (
                    SELECT DISTINCT ag_src.genre_id
                    FROM album_genres ag_src
                             JOIN album_artists aa_src ON ag_src.album_id = aa_src.album_id
                    WHERE aa_src.artist_id = ?
                )
                  AND target_art.id != ?
                GROUP BY target_art.id
                ORDER BY common_genres_count DESC, RAND()
                LIMIT ? OFFSET ?`;

            const [rows] = await pool.query(dataQuery, [artistId, artistId, limit, offset]);
            const [[{total}]] = await pool.query(`
                SELECT COUNT(DISTINCT target_art.id) as total
                FROM artists target_art
                         JOIN album_artists aa_target ON target_art.id = aa_target.artist_id
                         JOIN album_genres ag_target ON aa_target.album_id = ag_target.album_id
                WHERE ag_target.genre_id IN (
                    SELECT DISTINCT ag_src.genre_id
                    FROM album_genres ag_src
                             JOIN album_artists aa_src ON ag_src.album_id = aa_src.album_id
                    WHERE aa_src.artist_id = ?
                ) AND target_art.id != ?`, [artistId, artistId]);

            res.json({
                items: rows,
                meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // --- UTWORY ---
    router.get('/tracks/:id', async (req, res) => {
        try {
            const idParam = req.params.id;
            const { limit, page, offset } = getPaginationParams(req);

            if (isTop(idParam)) {
                const dataQuery = `
                    SELECT t.id, t.title, t.slug, a.cover_url, art.name as artist_name
                    FROM tracks t
                             JOIN albums a ON t.album_id = a.id
                             LEFT JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                             LEFT JOIN artists art ON aa.artist_id = art.id
                    ORDER BY t.id DESC LIMIT ? OFFSET ?`;
                const [rows] = await pool.query(dataQuery, [limit, offset]);
                const [[{total}]] = await pool.query(`SELECT COUNT(*) as total FROM tracks`);
                return res.json({
                    items: rows,
                    meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
                });
            }

            const trackId = parseInt(idParam);

            // Zapytanie o liczbę unikalnych artystów (bo limitujemy 1 utwór na artystę)
            const countQuery = `
                SELECT COUNT(DISTINCT aa.artist_id) as total
                FROM tracks t
                         JOIN albums a ON t.album_id = a.id
                         JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                WHERE a.id IN (
                    SELECT DISTINCT ag.album_id FROM album_genres ag
                    WHERE ag.genre_id IN (
                        SELECT ag2.genre_id FROM album_genres ag2
                                                     JOIN tracks t2 ON ag2.album_id = t2.album_id
                        WHERE t2.id = ?
                    )
                )
                  AND t.id != ?
                  AND aa.artist_id NOT IN (
                    SELECT aa_self.artist_id FROM album_artists aa_self
                                                      JOIN tracks t_self ON aa_self.album_id = t_self.album_id
                    WHERE t_self.id = ?
                )`;

            // Zapytanie o dane z użyciem ROW_NUMBER dla unikalności artysty
            const dataQuery = `
                WITH RankedTracks AS (
                    SELECT t.id, t.title, t.slug, a.cover_url, art.name as artist_name,
                           ROW_NUMBER() OVER (PARTITION BY art.id ORDER BY RAND()) as rn
                    FROM tracks t
                             JOIN albums a ON t.album_id = a.id
                             JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                             JOIN artists art ON aa.artist_id = art.id
                    WHERE a.id IN (
                        SELECT DISTINCT ag.album_id FROM album_genres ag
                        WHERE ag.genre_id IN (
                            SELECT ag2.genre_id FROM album_genres ag2
                                                         JOIN tracks t2 ON ag2.album_id = t2.album_id
                            WHERE t2.id = ?
                        )
                    )
                      AND t.id != ?
                      AND art.id NOT IN (
                        SELECT aa_self.artist_id
                        FROM album_artists aa_self
                                 JOIN tracks t_self ON aa_self.album_id = t_self.album_id
                        WHERE t_self.id = ?
                    )
                )
                SELECT * FROM RankedTracks
                WHERE rn = 1
                ORDER BY RAND()
                LIMIT ? OFFSET ?`;

            const [[{ total }]] = await pool.query(countQuery, [trackId, trackId, trackId]);
            const [rows] = await pool.query(dataQuery, [trackId, trackId, trackId, limit, offset]);

            res.json({
                items: rows,
                meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // --- UŻYTKOWNICY ---
    router.get('/users/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            const { limit, page, offset } = getPaginationParams(req);
            const MIN_SHARED = 1;

            const dataQuery = `
                SELECT u.id, u.username, up.profile_pic,
                       COUNT(r2.album_id) as shared_albums,
                       ROUND((1 - (AVG(ABS(r1.score - r2.score)) / 5)) * 100, 1) as match_percent
                FROM ratings r1
                         JOIN ratings r2 ON r1.album_id = r2.album_id AND r1.user_id != r2.user_id
                         JOIN users u ON r2.user_id = u.id
                         JOIN user_profiles up ON u.id = up.user_id
                WHERE r1.user_id = ?
                GROUP BY u.id
                HAVING shared_albums >= ?
                ORDER BY match_percent DESC, shared_albums DESC
                LIMIT ? OFFSET ?`;

            const countQuery = `
                SELECT COUNT(*) as total FROM (
                                                  SELECT r2.user_id
                                                  FROM ratings r1
                                                           JOIN ratings r2 ON r1.album_id = r2.album_id AND r1.user_id != r2.user_id
                                                  WHERE r1.user_id = ?
                                                  GROUP BY r2.user_id
                                                  HAVING COUNT(r2.album_id) >= ?
                                              ) as sub`;

            const [[{ total }]] = await pool.query(countQuery, [userId, MIN_SHARED]);
            const [rows] = await pool.query(dataQuery, [userId, MIN_SHARED, limit, offset]);

            res.json({
                items: rows,
                meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
            });
        } catch (err) {
            console.error('Błąd Bratnich Dusz:', err);
            res.status(500).json({ error: 'Błąd bazy данных' });
        }
    });

    // --- LISTY ---
    router.get('/lists/:slug', async (req, res) => {
        try {
            const { slug } = req.params;
            const { limit, page, offset } = getPaginationParams(req);

            let countQuery, dataQuery, queryParams, countParams;

            if (slug === 'top' || slug === 'discovery') {
                countQuery = `SELECT COUNT(*) as total FROM lists`;
                dataQuery = `
                    SELECT l.id, l.name, l.slug, l.cover_url, u.username, 0 as common_items_count
                    FROM lists l
                             JOIN users u ON l.user_id = u.id
                    ORDER BY l.id DESC
                    LIMIT ? OFFSET ?`;
                queryParams = [limit, offset];
                countParams = [];
            } else {
                const [currentList] = await pool.query('SELECT id, type FROM lists WHERE slug = ?', [slug]);
                if (currentList.length === 0) return res.status(404).json({ error: 'Lista nie została znaleziona' });

                const listId = currentList[0].id;
                const listType = currentList[0].type;

                countQuery = `
                    SELECT COUNT(DISTINCT l.id) as total
                    FROM lists l
                             JOIN list_items li2 ON l.id = li2.list_id
                    WHERE li2.entity_id IN (SELECT entity_id FROM list_items WHERE list_id = ?)
                      AND l.id != ? AND l.type = ?`;

                dataQuery = `
                    SELECT l.id, l.name, l.slug, l.cover_url, u.username,
                           COUNT(li2.entity_id) as common_items_count
                    FROM lists l
                             JOIN list_items li2 ON l.id = li2.list_id
                             JOIN users u ON l.user_id = u.id
                    WHERE li2.entity_id IN (SELECT entity_id FROM list_items WHERE list_id = ?)
                      AND l.id != ? AND l.type = ?
                    GROUP BY l.id
                    ORDER BY common_items_count DESC, l.id DESC
                    LIMIT ? OFFSET ?`;
                queryParams = [listId, listId, listType, limit, offset];
                countParams = [listId, listId, listType];
            }

            const [[{ total }]] = await pool.query(countQuery, countParams);
            const [rows] = await pool.query(dataQuery, queryParams);

            res.json({
                items: rows,
                meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    return router;
};