// backend/routes/artist.js
const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const jwt = require('jsonwebtoken');

const adminAuthChain = require('../adminAuth');
const authMiddleware = require('../authMiddleware');
const { getPagination, getMeta } = require('../paginationHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const parseJsonField = (field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    try {
        return typeof field === 'string' ? JSON.parse(field) : field;
    } catch (e) { return []; }
};

const normalizeTagInput = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
};

const optionalAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authMiddleware(req, res, next);
    }
    next();
};

const buildArtistFilters = (query) => {
    const {
        search,
        genres, exclude_genres,
        description, exclude_description,
        language, exclude_language,
        attributes, exclude_attributes,
        location, exclude_location
    } = query;

    const whereClauses = [];
    const params = [];

    // Optimized EXISTS filters
    const applyArtistExistsFilter = (input, excludeInput, subqueryJoinSql) => {
        const inc = normalizeTagInput(input);
        if (inc.length > 0) {
            whereClauses.push(`EXISTS (SELECT 1 ${subqueryJoinSql} AND ref.name IN (${inc.map(() => '?').join(',')}))`);
            params.push(...inc);
        }

        const exc = normalizeTagInput(excludeInput);
        if (exc.length > 0) {
            whereClauses.push(`NOT EXISTS (SELECT 1 ${subqueryJoinSql} AND ref.name IN (${exc.map(() => '?').join(',')}))`);
            params.push(...exc);
        }
    };

    applyArtistExistsFilter(genres, exclude_genres,
        `FROM album_artists aa JOIN album_genres pivot ON aa.album_id = pivot.album_id JOIN genres ref ON pivot.genre_id = ref.id WHERE aa.artist_id = a.id`
    );

    applyArtistExistsFilter(description, exclude_description,
        `FROM album_artists aa JOIN album_descriptors pivot ON aa.album_id = pivot.album_id JOIN descriptors ref ON pivot.descriptor_id = ref.id WHERE aa.artist_id = a.id`
    );

    applyArtistExistsFilter(language, exclude_language,
        `FROM album_artists aa JOIN album_languages pivot ON aa.album_id = pivot.album_id JOIN languages ref ON pivot.language_id = ref.id WHERE aa.artist_id = a.id`
    );

    applyArtistExistsFilter(attributes, exclude_attributes,
        `FROM album_artists aa JOIN album_release_attributes pivot ON aa.album_id = pivot.album_id JOIN release_attributes ref ON pivot.attribute_id = ref.id WHERE aa.artist_id = a.id`
    );

    applyArtistExistsFilter(location, exclude_location,
        `FROM artist_locations pivot JOIN locations ref ON pivot.location_id = ref.id WHERE pivot.artist_id = a.id`
    );

    if (search) {
        whereClauses.push(`a.name LIKE ?`);
        params.push(`%${search}%`);
    }

    return {
        whereSql: whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '',
        params
    };
};

module.exports = (pool) => {

    async function checkIsFollowing(artistId, userId) {
        if (!userId) return false;
        const [rows] = await pool.execute(
            `SELECT 1 FROM user_album_actions WHERE user_id = ? AND artist_id = ? AND action_type = 'follow' LIMIT 1`,
            [userId, artistId]
        );
        return rows.length > 0;
    }

    // 1. POBIERANIE LISTY ARTYSTÓW (OPTIMIZED)
    router.get('/', async (req, res) => {
        try {
            const { page, limit, offset } = getPagination(req, 20);

            let currentUserId = null;
            if (req.headers.authorization) {
                try {
                    const token = req.headers.authorization.split(' ')[1];
                    const decoded = jwt.verify(token, JWT_SECRET);
                    currentUserId = decoded.id;
                } catch (e) { }
            }

            const { whereSql, params } = buildArtistFilters(req.query);

            let orderBy = `s.avg_score DESC`;
            if (req.query.sort === 'popularity') orderBy = 's.followers_count DESC';
            if (req.query.sort === 'title') orderBy = 'a.name ASC';
            if (req.query.sort === 'release_date') orderBy = 'a.formed_year DESC';

            const countSql = `SELECT COUNT(DISTINCT a.id) as total FROM artists a ${whereSql}`;
            const [cRows] = await pool.execute(countSql, params);
            const total = cRows[0].total;

            const sql = `
                SELECT a.id, a.name, a.slug, a.picture_url, a.formed_year, a.artist_type,
                       COALESCE(s.followers_count, 0) as followers_count,
                       COALESCE(s.avg_score, 0) as avg_score,
                       COALESCE(s.in_lists_count, 0) as in_lists_count,
                       COALESCE(s.reviews_count, 0) as reviews_count,

                       (SELECT JSON_ARRAYAGG(g.name) FROM (SELECT DISTINCT g2.name FROM genres g2 JOIN album_genres ag ON g2.id = ag.genre_id JOIN album_artists aa ON ag.album_id = aa.album_id WHERE aa.artist_id = a.id LIMIT 5) as g) as genres,
                       (SELECT JSON_ARRAYAGG(d.name) FROM (SELECT DISTINCT d2.name FROM descriptors d2 JOIN album_descriptors ad ON d2.id = ad.descriptor_id JOIN album_artists aa ON ad.album_id = aa.album_id WHERE aa.artist_id = a.id LIMIT 5) as d) as descriptors,
                       (SELECT JSON_ARRAYAGG(loc.name) FROM artist_locations al JOIN locations loc ON al.location_id = loc.id WHERE al.artist_id = a.id) as locations,

                       CASE WHEN uaa.id IS NOT NULL THEN 1 ELSE 0 END as is_following
                FROM artists a
                         LEFT JOIN artist_stats s ON a.id = s.artist_id
                         LEFT JOIN user_album_actions uaa ON uaa.artist_id = a.id AND uaa.user_id = ? AND uaa.action_type = 'follow'
                    ${whereSql}
                ORDER BY ${orderBy}
                LIMIT ? OFFSET ?
            `;

            const queryParams = [currentUserId, ...params, limit.toString(), offset.toString()];
            const [rows] = await pool.execute(sql, queryParams);

            const safeOffset = parseInt(offset) || 0;

            const result = rows.map((r, index) => ({
                ...r,
                genres: parseJsonField(r.genres),
                descriptors: parseJsonField(r.descriptors),
                locations: parseJsonField(r.locations),
                is_following: !!r.is_following,
                avg_score: r.avg_score !== null ? Number(r.avg_score).toFixed(2) : "0.00",
                global_rank: safeOffset + index + 1 // FIX: Rank calculation logic
            }));

            res.json({ data: result, meta: getMeta(total, page, limit) });
        } catch (err) {
            console.error('Błąd podczas pobierania artystów:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 2. SZCZEGÓŁOWE INFORMACJE O ARTYŚCIE (OPTIMIZED + RECALCULATE SCORE)
    router.get('/:slug', optionalAuthMiddleware, async (req, res) => {
        try {
            const { slug } = req.params;
            const userId = req.user ? req.user.id : null;

            const [artistRows] = await pool.execute(
                `SELECT a.id, a.name, a.picture_url, a.slug, a.formed_year, a.bio, a.artist_type,
                        COALESCE(s.followers_count, 0) as followers_count,
                        COALESCE(s.reviews_count, 0) as reviews_count,
                        COALESCE(s.avg_score, 0) as globalScore
                 FROM artists a
                          LEFT JOIN artist_stats s ON a.id = s.artist_id
                 WHERE a.slug = ?`, [slug]
            );

            if (artistRows.length === 0) return res.status(404).json({ error: 'Nie znaleziono artysty' });

            const artist = artistRows[0];

            // --- FIX: RECALCULATE AVERAGE SCORE FROM RELEASES ---
            // Pobieramy świeżą średnią z albumów, aby wynik był zawsze aktualny
            const [statsCalc] = await pool.execute(`
                SELECT AVG(ast.avg_score) as real_avg, SUM(ast.reviews_count) as total_reviews
                FROM album_stats ast
                JOIN album_artists aa ON ast.album_id = aa.album_id
                WHERE aa.artist_id = ? AND ast.avg_score > 0
            `, [artist.id]);

            let rawScore = 0;
            if (statsCalc[0] && statsCalc[0].real_avg) {
                rawScore = parseFloat(statsCalc[0].real_avg);
                const totalReviews = statsCalc[0].total_reviews ? parseInt(statsCalc[0].total_reviews) : 0;

                // Aktualizujemy tabelę artist_stats, aby listy i rankingi też były aktualne
                await pool.execute(`
                    INSERT INTO artist_stats (artist_id, avg_score, reviews_count) 
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE avg_score = VALUES(avg_score), reviews_count = VALUES(reviews_count)
                `, [artist.id, rawScore, totalReviews]);

                // Nadpisujemy dane obiektu artist przed wysłaniem do frontendu
                artist.globalScore = rawScore.toFixed(2);
                artist.reviews_count = totalReviews;
            } else {
                // Jeśli brak ocen albumów, bierzemy starą wartość lub 0
                rawScore = artist.globalScore ? parseFloat(artist.globalScore) : 0;
                artist.globalScore = rawScore > 0 ? rawScore.toFixed(2) : 'N/A';
            }
            // --- END FIX ---

            const ranks = { global: null, locations: [] };

            // Ranking calculation is acceptable for SINGLE artist view (Scan on Index)
            if (rawScore > 0) {
                // Relies on index idx_artist_stats_score
                const [rankRow] = await pool.execute(
                    `SELECT COUNT(*) as betterCount FROM artist_stats WHERE avg_score > ?`,
                    [rawScore]
                );
                ranks.global = rankRow[0].betterCount + 1;
            }

            const [locRows] = await pool.execute(
                `SELECT loc.id, loc.name FROM locations loc JOIN artist_locations al ON loc.id = al.location_id WHERE al.artist_id = ?`,
                [artist.id]
            );
            artist.locations = locRows.map(l => l.name);

            // Optimization: Only calculate location rank if location exists and score > 0
            if (rawScore > 0 && locRows.length > 0) {
                for (const loc of locRows) {
                    const [locRankRow] = await pool.execute(
                        `SELECT COUNT(*) as betterCount
                         FROM artist_stats s
                                  JOIN artist_locations al ON s.artist_id = al.artist_id
                         WHERE al.location_id = ? AND s.avg_score > ?`,
                        [loc.id, rawScore]
                    );
                    ranks.locations.push({ name: loc.name, rank: locRankRow[0].betterCount + 1 });
                }
            }
            artist.ranks = ranks;

            const [genresRows] = await pool.execute(
                `SELECT DISTINCT g.name FROM genres g JOIN album_genres ag ON g.id = ag.genre_id JOIN album_artists aa ON ag.album_id = aa.album_id WHERE aa.artist_id = ? LIMIT 5`,
                [artist.id]
            );
            artist.genres = genresRows.map(row => row.name);

            // Optimized Albums Query: Removed correlated subqueries in SELECT list
            // Uses LEFT JOINs for user actions
            const albumsQuery = `
                SELECT a.id, a.title, a.slug, a.cover_url, a.release_date, rf.name AS format_name,
                       COALESCE(ast.avg_score, 0) AS average_rating,
                       COALESCE(ast.ratings_count, 0) as ratings_count,
                       (ua_like.id IS NOT NULL) as is_liked,
                       (ua_listen.id IS NOT NULL) as is_listened,
                       (ua_wish.id IS NOT NULL) as is_wishlisted,
                       (SELECT JSON_ARRAYAGG(ra.name) FROM album_release_attributes ara JOIN release_attributes ra ON ara.attribute_id = ra.id WHERE ara.album_id = a.id) AS attributes
                FROM albums a
                         JOIN album_artists aa ON a.id = aa.album_id
                         LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                         LEFT JOIN album_stats ast ON a.id = ast.album_id
                    -- Optimized User Actions
                         LEFT JOIN user_album_actions ua_like ON ua_like.album_id = a.id AND ua_like.user_id = ? AND ua_like.action_type = 'like'
                         LEFT JOIN user_album_actions ua_listen ON ua_listen.album_id = a.id AND ua_listen.user_id = ? AND ua_listen.action_type = 'listen'
                         LEFT JOIN user_album_actions ua_wish ON ua_wish.album_id = a.id AND ua_wish.user_id = ? AND ua_wish.action_type = 'wishlist'
                WHERE aa.artist_id = ?
                ORDER BY a.release_date DESC
            `;

            const [albumsRows] = await pool.execute(albumsQuery, [userId, userId, userId, artist.id]);

            const parsedAlbumsRows = albumsRows.map(row => ({
                ...row,
                attributes: parseJsonField(row.attributes),
                is_liked: !!row.is_liked,
                is_listened: !!row.is_listened,
                is_wishlisted: !!row.is_wishlisted,
                average_rating: Number(row.average_rating).toFixed(2)
            }));

            artist.isFollowing = await checkIsFollowing(artist.id, userId);

            const discography = parsedAlbumsRows.reduce((acc, album) => {
                const primaryFormat = album.format_name || 'Inne';
                const primaryAttribute = (album.attributes && album.attributes.length > 0) ? album.attributes[0] : '';
                let groupKey = primaryAttribute ? `${primaryAttribute} ${primaryFormat}` : primaryFormat;

                if (!acc[groupKey]) acc[groupKey] = [];
                acc[groupKey].push({
                    ...album,
                    release_year: album.release_date ? new Date(album.release_date).getFullYear() : 'N/A'
                });
                return acc;
            }, {});

            res.json({ artist, discography });
        } catch (err) {
            console.error('Błąd podczas pobierania szczegółów artysty:', err);
            res.status(500).json({ error: 'Błąd serwera' });
        }
    });

    // 3. AKTUALIZACJA ARTYSTY (ADMIN)
    router.patch('/:artistId', adminAuthChain, async (req, res) => {
        const { name, picture_url, formed_year, bio, artist_type, locations } = req.body;
        const { artistId } = req.params;

        if (!name) return res.status(400).json({ error: 'Nazwa jest wymagana' });

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const newSlug = slugify(name, { lower: true, strict: true });

            await connection.execute(
                `UPDATE artists SET name = ?, picture_url = ?, formed_year = ?, bio = ?, slug = ?, artist_type = ? WHERE id = ?`,
                [name, picture_url || null, formed_year || null, bio || null, newSlug, artist_type || 'solo', artistId]
            );

            if (locations !== undefined) {
                const locsArray = Array.isArray(locations) ? locations : normalizeTagInput(locations);
                await connection.execute(`DELETE FROM artist_locations WHERE artist_id = ?`, [artistId]);

                for (const locName of locsArray) {
                    await connection.execute(`INSERT IGNORE INTO locations (name) VALUES (?)`, [locName]);
                    const [locRows] = await connection.execute(`SELECT id FROM locations WHERE name = ?`, [locName]);
                    if (locRows.length > 0) {
                        await connection.execute(`INSERT INTO artist_locations (artist_id, location_id) VALUES (?, ?)`, [artistId, locRows[0].id]);
                    }
                }
            }

            await connection.commit();
            res.json({ success: true, slug: newSlug });
        } catch (err) {
            await connection.rollback();
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Artysta już istnieje' });
            res.status(500).json({ error: 'Aktualizacja nie powiodła się', details: err.message });
        } finally {
            connection.release();
        }
    });

    // 4. POWIĄZANI ARTYŚCI
    router.get('/related/:artistId', async (req, res) => {
        try {
            const { mode } = req.query;
            const artistId = req.params.artistId;

            // This query relies on indexes on credits table. Ensure credits(artist_id) and credits(group_id) exist.
            let sql = (mode === 'groups')
                ? `SELECT c.id, c.group_id as target_id, c.start_year, c.end_year, cr.name as role_name,
                          art.name as target_name, art.slug as target_slug, 'group' as relation_type
                   FROM credits c
                            JOIN artists art ON c.group_id = art.id
                            LEFT JOIN credit_roles cr ON c.role_id = cr.id
                   WHERE c.artist_id = ? AND c.group_id IS NOT NULL
                   ORDER BY c.start_year ASC, art.name`
                : `SELECT c.id, c.artist_id as target_id, c.start_year, c.end_year, cr.name as role_name,
                          art.name as target_name, art.slug as target_slug, 'member' as relation_type
                   FROM credits c
                            JOIN artists art ON c.artist_id = art.id
                            LEFT JOIN credit_roles cr ON c.role_id = cr.id
                   WHERE c.group_id = ?
                   ORDER BY c.start_year ASC, art.name`;

            const [rows] = await pool.execute(sql, [artistId]);
            res.json(rows);
        } catch (err) {
            console.error('Błąd powiązanych artystów:', err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 5. OBSERWUJ / PRZESTAŃ OBSERWOWAĆ
    router.post('/:artistId/follow', authMiddleware, async (req, res) => {
        const userId = req.user.id;
        const artistID = parseInt(req.params.artistId);
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [check] = await connection.execute(
                `SELECT 1 FROM user_album_actions WHERE user_id = ? AND artist_id = ? AND action_type = 'follow' LIMIT 1`,
                [userId, artistID]
            );
            const currentlyFollowing = check.length > 0;

            await connection.execute('INSERT IGNORE INTO artist_stats (artist_id) VALUES (?)', [artistID]);

            if (currentlyFollowing) {
                // Przestań obserwować
                await connection.execute(`DELETE FROM user_album_actions WHERE user_id = ? AND artist_id = ? AND action_type = 'follow'`, [userId, artistID]);
                await connection.execute(`UPDATE artist_stats SET followers_count = GREATEST(0, followers_count - 1) WHERE artist_id = ?`, [artistID]);
                await connection.commit();
                res.json({ status: 'unfollowed' });
            } else {
                // Obserwuj
                await connection.execute(`INSERT INTO user_album_actions (user_id, artist_id, action_type, list_id) VALUES (?, ?, 'follow', NULL)`, [userId, artistID]);
                await connection.execute(`UPDATE artist_stats SET followers_count = followers_count + 1 WHERE artist_id = ?`, [artistID]);
                await connection.commit();
                res.json({ status: 'followed' });
            }
        } catch (err) {
            await connection.rollback();
            res.status(500).json({ error: 'Akcja nie powiodła się', details: err.message });
        } finally {
            connection.release();
        }
    });

    return router;
};