// backend/routes/tracks.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getPagination, getMeta } = require('../paginationHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// --- FUNKCJE POMOCNICZE ---

const normalizeTagInput = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') {
        return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    return [];
};

const parseJsonField = (field) => {
    if (typeof field === 'string') {
        try { return JSON.parse(field); } catch (e) { return []; }
    }
    return field || [];
};

const buildTrackFilters = (query, currentUserId) => {
    const {
        format, genres, attributes, language, description, location,
        exclude_genres, exclude_attributes, exclude_language, exclude_description, exclude_location,
        search, year, yearRange, status, one_per_artist
    } = query;

    const whereClauses = [];
    const params = [];

    const addListFilter = (input, excludeInput, pivotTable, refTable, fkColumnName) => {
        const includeList = normalizeTagInput(input);
        if (includeList.length > 0) {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM ${pivotTable} pivot
                JOIN ${refTable} ref ON pivot.${fkColumnName} = ref.id
                WHERE pivot.album_id = t.album_id AND ref.name IN (${includeList.map(() => '?').join(',')})
            )`);
            params.push(...includeList);
        }

        const excludeList = normalizeTagInput(excludeInput);
        if (excludeList.length > 0) {
            whereClauses.push(`NOT EXISTS (
                SELECT 1 FROM ${pivotTable} pivot
                JOIN ${refTable} ref ON pivot.${fkColumnName} = ref.id
                WHERE pivot.album_id = t.album_id AND ref.name IN (${excludeList.map(() => '?').join(',')})
            )`);
            params.push(...excludeList);
        }
    };

    const addLocationFilter = (input, excludeInput) => {
        const inc = normalizeTagInput(input);
        if (inc.length > 0) {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM album_artists aa
                JOIN artist_locations al ON aa.artist_id = al.artist_id
                JOIN locations l ON al.location_id = l.id
                WHERE aa.album_id = a.id AND l.name IN (${inc.map(() => '?').join(',')})
            )`);
            params.push(...inc);
        }

        const exc = normalizeTagInput(excludeInput);
        if (exc.length > 0) {
            whereClauses.push(`NOT EXISTS (
                SELECT 1 FROM album_artists aa
                JOIN artist_locations al ON aa.artist_id = al.artist_id
                JOIN locations l ON al.location_id = l.id
                WHERE aa.album_id = a.id AND l.name IN (${exc.map(() => '?').join(',')})
            )`);
            params.push(...exc);
        }
    };

    addListFilter(genres, exclude_genres, 'album_genres', 'genres', 'genre_id');
    addListFilter(attributes, exclude_attributes, 'album_release_attributes', 'release_attributes', 'attribute_id');
    addListFilter(language, exclude_language, 'album_languages', 'languages', 'language_id');
    addListFilter(description, exclude_description, 'album_descriptors', 'descriptors', 'descriptor_id');
    addLocationFilter(location, exclude_location);

    const fInc = normalizeTagInput(format);
    if (fInc.length > 0) {
        whereClauses.push(`EXISTS (SELECT 1 FROM release_formats rf WHERE a.release_format_id = rf.id AND rf.name IN (${fInc.map(() => '?').join(',')}))`);
        params.push(...fInc);
    }

    if (yearRange) {
        if (yearRange.endsWith('s')) {
            const decadeStart = parseInt(yearRange.slice(0, 4));
            if (!isNaN(decadeStart)) {
                whereClauses.push('YEAR(a.release_date) >= ? AND YEAR(a.release_date) <= ?');
                params.push(decadeStart, decadeStart + 9);
            }
        } else if (yearRange.includes('-')) {
            const [start, end] = yearRange.split('-').map(y => parseInt(y.trim()));
            whereClauses.push('YEAR(a.release_date) >= ? AND YEAR(a.release_date) <= ?');
            params.push(start, end);
        }
    } else if (year) {
        whereClauses.push('YEAR(a.release_date) = ?');
        params.push(year);
    }

    if (search) {
        if (search.length > 3 && !/[%_]/.test(search)) {
            whereClauses.push(`(
                MATCH(t.title) AGAINST(? IN BOOLEAN MODE) 
                OR MATCH(a.title) AGAINST(? IN BOOLEAN MODE)
            )`);
            params.push(`*${search}*`, `*${search}*`);
        } else {
            whereClauses.push(`(t.title LIKE ? OR a.title LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`);
        }
    }

    if (currentUserId && status) {
        if (status === 'listened') {
            whereClauses.push(`EXISTS (SELECT 1 FROM track_ratings tr WHERE tr.track_id = t.id AND tr.user_id = ?)`);
            params.push(currentUserId);
        } else if (status === 'not_listened') {
            whereClauses.push(`NOT EXISTS (SELECT 1 FROM track_ratings tr WHERE tr.track_id = t.id AND tr.user_id = ?)`);
            params.push(currentUserId);
        }
    }

    return {
        whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '',
        params,
        onePerArtist: one_per_artist === 'true'
    };
};

const buildSort = (sort, order = 'desc', isOnePerArtist = false) => {
    const dir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Obsługa specjalna dla one_per_artist, gdzie mamy spłaszczony wynik subquery
    if (isOnePerArtist) {
        switch (sort) {
            case 'rating':
                return `ORDER BY t.avg_score ${dir}, t.ratings_count DESC`;
            case 'popularity':
                return `ORDER BY t.ratings_count ${dir}`;
            case 'title':
                return `ORDER BY t.title ${dir}`;
            default:
                return `ORDER BY t.release_date ${dir}`;
        }
    } else {
        switch (sort) {
            case 'rating':
                return `ORDER BY ts.avg_score ${dir}, ts.ratings_count DESC`;
            case 'popularity':
                return `ORDER BY ts.ratings_count ${dir}`;
            case 'title':
                return `ORDER BY t.title ${dir}`;
            default:
                return `ORDER BY a.release_date ${dir}`;
        }
    }
};

module.exports = (pool) => {

    router.get('/', async (req, res) => {
        try {
            const { page, limit, offset } = getPagination(req, 50);

            let currentUserId = null;
            if (req.headers.authorization) {
                try {
                    const token = req.headers.authorization.split(' ')[1];
                    const decoded = jwt.verify(token, JWT_SECRET);
                    currentUserId = decoded.id;
                } catch (e) {}
            }

            const { whereSql, params, onePerArtist } = buildTrackFilters(req.query, currentUserId);

            let baseQuery;
            if (onePerArtist) {
                // POPRAWKA: Subquery zwraca teraz pola potrzebne do sortowania (release_date, avg_score, title)
                // Używamy aliasu "t" dla tabeli wynikowej
                baseQuery = `
                    SELECT id FROM (
                                       SELECT t.id,
                                              a.release_date,
                                              t.title,
                                              COALESCE(ts.avg_score, 0) as avg_score,
                                              COALESCE(ts.ratings_count, 0) as ratings_count,
                                              ROW_NUMBER() OVER(PARTITION BY aa.artist_id ORDER BY COALESCE(ts.avg_score, 0) DESC) as rn
                                       FROM tracks t
                                                JOIN albums a ON t.album_id = a.id
                                                JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1
                                                LEFT JOIN tracks_stats ts ON t.id = ts.track_id
                                           ${whereSql}
                                   ) as t
                    WHERE rn = 1
                `;
            } else {
                baseQuery = `
                    SELECT t.id
                    FROM tracks t
                             JOIN albums a ON t.album_id = a.id
                             LEFT JOIN tracks_stats ts ON t.id = ts.track_id
                        ${whereSql}
                `;
            }

            const countSql = `SELECT COUNT(*) as total FROM (${baseQuery}) as sub`;
            const [countRows] = await pool.execute(countSql, params);
            const total = countRows[0].total;

            if (total === 0) return res.json({ data: [], meta: getMeta(0, page, limit) });

            const sortSql = buildSort(req.query.sort, req.query.order, onePerArtist);
            const [idRows] = await pool.execute(`${baseQuery} ${sortSql} LIMIT ? OFFSET ?`, [...params, limit.toString(), offset.toString()]);
            const ids = idRows.map(r => r.id);

            if (ids.length === 0) return res.json({ data: [], meta: getMeta(total, page, limit) });

            const placeholders = ids.map(() => '?').join(',');

            // Pobieranie szczegółów (sortowanie standardowe, bo tu już nie ma spłaszczenia one_per_artist)
            const detailSortSql = buildSort(req.query.sort, req.query.order, false);
            const detailSql = `
                SELECT t.id, t.title, t.slug, t.track_number,
                       COALESCE(a.title, 'Nieznany album') AS album_title,
                       a.slug AS album_slug, a.cover_url,
                       COALESCE(a.release_date, 'N/A') AS release_date,
                       COALESCE(ts.avg_score, 0) AS avg_score,
                       COALESCE(ts.ratings_count, 0) AS ratings_count,
                       COALESCE(ts.in_lists_count, 0) as in_lists_count,
                       COALESCE(ts.reviews_count, 0) as reviews_count,
                       (SELECT name FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id ORDER BY aa.is_main DESC LIMIT 1) as artist_name,
                       (SELECT JSON_ARRAYAGG(g.name) FROM album_genres ag JOIN genres g ON ag.genre_id = g.id WHERE ag.album_id = a.id) AS genres,
                       (SELECT JSON_ARRAYAGG(d.name) FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id WHERE ad.album_id = a.id) AS descriptors,
                       (SELECT JSON_ARRAYAGG(l.name) FROM album_languages al JOIN languages l ON al.language_id = l.id WHERE al.album_id = a.id) AS languages,
                       COALESCE(ast.likes_count, 0) as album_likes,
                       COALESCE(ast.ratings_count, 0) as album_listens,
                       COALESCE(ast.wishlist_count, 0) as album_wishlist,
                       0 as global_rank
                FROM tracks t
                         JOIN albums a ON t.album_id = a.id
                         LEFT JOIN tracks_stats ts ON t.id = ts.track_id
                         LEFT JOIN album_stats ast ON a.id = ast.album_id
                WHERE t.id IN (${placeholders})
                    ${detailSortSql}
            `;

            const [rows] = await pool.execute(detailSql, ids);

            const safeOffset = parseInt(offset) || 0;

            const result = rows.map((r, index) => ({
                ...r,
                genres: parseJsonField(r.genres),
                descriptors: parseJsonField(r.descriptors),
                languages: parseJsonField(r.languages),
                global_rank: safeOffset + index + 1 // FIX: Rank calculation logic
            }));

            res.json({ data: result, meta: getMeta(total, page, limit) });
        } catch (err) {
            console.error("Błąd API utworów:", err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:slug', async (req, res) => {
        try {
            const trackSlug = req.params.slug;
            const [rows] = await pool.execute(`
                SELECT t.*,
                       a.id AS album_id,
                       COALESCE(a.title, 'Nieznany album') AS album_title,
                       a.cover_url, a.slug AS album_slug,
                       COALESCE(a.release_date, 'N/A') AS release_date,
                       ts.avg_score, ts.ratings_count,
                       (SELECT JSON_ARRAYAGG(JSON_OBJECT('name', art.name, 'slug', art.slug))
                        FROM album_artists aa JOIN artists art ON aa.artist_id = art.id
                        WHERE aa.album_id = a.id) AS artists,
                       (SELECT JSON_ARRAYAGG(g.name)
                        FROM album_genres ag JOIN genres g ON ag.genre_id = g.id
                        WHERE ag.album_id = a.id) AS genres,
                       (SELECT JSON_ARRAYAGG(d.name)
                        FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id
                        WHERE ad.album_id = a.id) AS descriptors,
                       (SELECT JSON_ARRAYAGG(l.name)
                        FROM album_languages al JOIN languages l ON al.language_id = l.id
                        WHERE al.album_id = a.id) AS languages,
                       (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                               'id', t2.id, 'title', t2.title, 'slug', t2.slug,
                               'track_number', t2.track_number, 'duration', t2.duration,
                               'average_rating', COALESCE(ts2.avg_score, 0), 'rating_count', COALESCE(ts2.ratings_count, 0)
                                             ))
                        FROM tracks t2
                                 LEFT JOIN tracks_stats ts2 ON t2.id = ts2.track_id
                        WHERE t2.album_id = a.id
                        ORDER BY t2.track_number ASC) AS album_tracks
                FROM tracks AS t
                         JOIN albums AS a ON t.album_id = a.id
                         LEFT JOIN tracks_stats AS ts ON t.id = ts.track_id
                WHERE t.slug = ?
            `, [trackSlug]);

            if (rows.length === 0) return res.status(404).json({ error: 'Utwór nie został znaleziony' });

            const track = rows[0];
            const avg = track.avg_score || 0;
            const rCount = track.ratings_count || 0;

            const response = {
                ...track,
                genres: parseJsonField(track.genres),
                descriptors: parseJsonField(track.descriptors),
                languages: parseJsonField(track.languages),
                artists: parseJsonField(track.artists),
                album: {
                    id: track.album_id,
                    title: track.album_title,
                    slug: track.album_slug,
                    cover_url: track.cover_url,
                    release_date: track.release_date,
                    tracks: parseJsonField(track.album_tracks)
                }
            };

            const [gRankRows] = await pool.execute(
                `SELECT COUNT(*) + 1 as rank_val FROM tracks_stats WHERE avg_score > ? OR (avg_score = ? AND ratings_count > ?)`,
                [avg, avg, rCount]
            );
            response.rank_general = gRankRows[0]?.rank_val || null;

            res.json(response);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};