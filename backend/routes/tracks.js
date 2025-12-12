const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Предполагаем, что вы передаете пул соединений из server.js
// const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================

const normalizeTagInput = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') {
        return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    return [];
};

// ==========================================
// 2. QUERY BUILDERS
// ==========================================

const buildTrackFilters = (query, currentUserId) => {
    const {
        format, exclude_format,
        genres, exclude_genres,
        attributes, exclude_attributes,
        language, exclude_language,
        description, exclude_description,
        search, year, yearRange, status
    } = query;

    const whereClauses = [];
    const params = [];

    // --- Helper for Tag Filters (Targeting Album ID of the Track) ---
    const addListFilter = (input, pivotTable, refTable, fkColumnName, isExclude = false) => {
        const list = normalizeTagInput(input);
        if (list.length > 0) {
            const operator = isExclude ? 'NOT EXISTS' : 'EXISTS';
            whereClauses.push(`${operator} (
                SELECT 1 FROM ${pivotTable} pivot
                JOIN ${refTable} ref ON pivot.${fkColumnName} = ref.id
                WHERE pivot.album_id = t.album_id AND ref.name IN (${list.map(() => '?').join(',')})
            )`);
            params.push(...list);
        }
    };

    // 1. Format (Via Album)
    if (format) {
        const list = normalizeTagInput(format);
        if (list.length > 0) {
            whereClauses.push(`rf.name IN (${list.map(() => '?').join(',')})`);
            params.push(...list);
        }
    }
    if (exclude_format) {
        const list = normalizeTagInput(exclude_format);
        if (list.length > 0) {
            whereClauses.push(`(rf.name IS NULL OR rf.name NOT IN (${list.map(() => '?').join(',')}))`);
            params.push(...list);
        }
    }

    // 2. Tags (Genres, Descriptors, etc. - inherited from Album)
    addListFilter(genres, 'album_genres', 'genres', 'genre_id');
    addListFilter(exclude_genres, 'album_genres', 'genres', 'genre_id', true);

    addListFilter(attributes, 'album_release_attributes', 'release_attributes', 'attribute_id');
    addListFilter(exclude_attributes, 'album_release_attributes', 'release_attributes', 'attribute_id', true);

    addListFilter(language, 'album_languages', 'languages', 'language_id');
    addListFilter(exclude_language, 'album_languages', 'languages', 'language_id', true);

    addListFilter(description, 'album_descriptors', 'descriptors', 'descriptor_id');
    addListFilter(exclude_description, 'album_descriptors', 'descriptors', 'descriptor_id', true);

    // 3. Year (Via Album Release Date)
    if (year) {
        whereClauses.push('YEAR(a.release_date) = ?');
        params.push(year);
    } else if (yearRange) {
        if (yearRange.endsWith('s')) {
            const start = parseInt(yearRange, 10);
            whereClauses.push('YEAR(a.release_date) BETWEEN ? AND ?');
            params.push(start, start + 9);
        } else {
            const parts = yearRange.split('-');
            if (parts.length === 2) {
                whereClauses.push('YEAR(a.release_date) BETWEEN ? AND ?');
                params.push(parts[0], parts[1]);
            }
        }
    }

    // 4. Search (Track Title or Artist Name)
    if (search) {
        whereClauses.push(`(
            t.title LIKE ? 
            OR a.title LIKE ?
            OR EXISTS (
                SELECT 1 FROM album_artists aa
                JOIN artists art ON aa.artist_id = art.id
                WHERE aa.album_id = a.id AND art.name LIKE ?
            )
        )`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // 5. User Status (Listened/Rated Tracks)
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
        params
    };
};

const buildSort = (sort) => {
    const sortKey = sort ? sort.toLowerCase() : 'release_date';
    switch (sortKey) {
        // Убедимся, что здесь ratings_count
        case 'rating': return 'ORDER BY (ts.avg_score IS NULL), ts.avg_score DESC, ts.ratings_count DESC';
        case 'popularity': return 'ORDER BY ts.ratings_count DESC';
        case 'title': return 'ORDER BY t.title ASC';
        case 'artist': return 'ORDER BY (SELECT name FROM artists ar JOIN album_artists aa ON ar.id = aa.artist_id WHERE aa.album_id = a.id LIMIT 1) ASC';
        case 'release_date': default: return 'ORDER BY a.release_date DESC, t.track_number ASC';
    }
};

const getUserTrackStatsSql = (userId) => {
    if (!userId) return ', NULL as user_score';
    // ИСПРАВЛЕНО: Заменили 'rating' на 'score' в таблице track_ratings
    return `, (SELECT score FROM track_ratings WHERE user_id = ? AND track_id = t.id) as user_score`;
};

// ==========================================
// 3. ROUTES
// ==========================================

module.exports = (pool) => {

    // === GET ALL TRACKS (Chart/Filtered) ===
    router.get('/', async (req, res) => {
        let connection = null;
        try {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.max(1, parseInt(req.query.limit) || 50);
            const offset = (page - 1) * limit;

            let currentUserId = null;
            if (req.headers.authorization) {
                try {
                    const token = req.headers.authorization.split(' ')[1];
                    currentUserId = jwt.verify(token, JWT_SECRET).id;
                } catch (e) {}
            }

            connection = await pool.getConnection();

            const { whereSql, params } = buildTrackFilters(req.query, currentUserId);

            // 1. Count Total
            const [countRows] = await connection.execute(
                `SELECT COUNT(*) as total
                 FROM tracks t
                          JOIN albums a ON t.album_id = a.id
                          LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                     ${whereSql}`,
                params
            );

            // 2. Fetch Data
            const userParams = currentUserId ? [currentUserId] : [];
            // Важно: в MySQL нумерация параметров в execute/query начинается сначала, поэтому userParams должны быть первыми
            const queryParams = [...userParams, ...params, limit.toString(), offset.toString()];

            // Убедимся, что здесь ratings_count
            const sql = `
                SELECT
                    t.id, t.title, t.slug, t.duration, t.track_number,
                    a.title as album_title, a.slug as album_slug, a.cover_url, a.release_date,
                    rf.name as format_name,

                    COALESCE(ts.avg_score, 0) as avg_score,
                    COALESCE(ts.ratings_count, 0) as ratings_count,

                    (SELECT name FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id ORDER BY aa.is_main DESC LIMIT 1) AS artist_name,
                    (SELECT slug FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id ORDER BY aa.is_main DESC LIMIT 1) AS artist_slug

                    ${getUserTrackStatsSql(currentUserId)}
                FROM tracks t
                         JOIN albums a ON t.album_id = a.id
                         LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                         LEFT JOIN track_stats ts ON t.id = ts.track_id
                    ${whereSql}
                    ${buildSort(req.query.sort)}
                LIMIT ? OFFSET ?
            `;

            // Для дебага: console.log('Final SQL:', sql, 'Params:', queryParams);

            const [rows] = await connection.execute(sql, queryParams);

            res.json({
                data: rows,
                meta: { total: countRows[0].total, page, limit, total_pages: Math.ceil(countRows[0].total / limit) }
            });

        } catch (err) {
            console.error('GET /api/tracks error:', err);
            // Возвращаем 500 только в случае ошибки
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};