// backend/routes/albums.js
const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const authenticate = require('../authMiddleware');
const authorizeAdmin = require('../adminAuth');
const jwt = require('jsonwebtoken');
const { getPagination, getMeta } = require('../paginationHelper');
const { createNotification } = require('./notifications');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const normalizeTagInput = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') {
        return input.split(',').map(s => s.trim()).filter(s => s.length > 0).map(s => s.replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
    }
    return [];
};

const getAlbumId = async (connection, idOrSlug) => {
    let albumId = parseInt(idOrSlug);
    if (isNaN(albumId)) {
        const [rows] = await connection.execute('SELECT id FROM albums WHERE slug = ?', [idOrSlug]);
        if (rows.length === 0) return null;
        albumId = rows[0].id;
    }
    return albumId;
};

const parseJsonField = (field) => {
    if (!field) return [];
    try {
        if (Array.isArray(field)) return field;
        const parsed = typeof field === 'string' ? JSON.parse(field) : field;
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

const buildFilters = (query, currentUserId) => {
    const {
        format, exclude_format,
        attributes, exclude_attributes,
        genres, exclude_genres,
        description, exclude_description,
        language, exclude_language,
        location, exclude_location,
        search, year, yearRange, status, one_per_artist
    } = query;

    const whereClauses = [];
    const params = [];

    const applyExistsFilter = (input, excludeInput, subqueryJoinSql) => {
        const includeList = normalizeTagInput(input);
        if (includeList.length > 0) {
            whereClauses.push(`EXISTS (
                SELECT 1 ${subqueryJoinSql} AND ref.name IN (${includeList.map(() => '?').join(',')})
            )`);
            params.push(...includeList);
        }

        const excludeList = normalizeTagInput(excludeInput);
        if (excludeList.length > 0) {
            whereClauses.push(`NOT EXISTS (
                SELECT 1 ${subqueryJoinSql} AND ref.name IN (${excludeList.map(() => '?').join(',')})
            )`);
            params.push(...excludeList);
        }
    };

    const tagFilters = [
        { inc: genres, exc: exclude_genres, table: 'album_genres', ref: 'genres', col: 'genre_id' },
        { inc: attributes, exc: exclude_attributes, table: 'album_release_attributes', ref: 'release_attributes', col: 'attribute_id' },
        { inc: language, exc: exclude_language, table: 'album_languages', ref: 'languages', col: 'language_id' },
        { inc: description, exc: exclude_description, table: 'album_descriptors', ref: 'descriptors', col: 'descriptor_id' }
    ];

    tagFilters.forEach(tag => {
        applyExistsFilter(tag.inc, tag.exc, `FROM ${tag.table} pivot JOIN ${tag.ref} ref ON pivot.${tag.col} = ref.id WHERE pivot.album_id = a.id`);
    });

    applyExistsFilter(location, exclude_location, `
        FROM album_artists aa
        JOIN artist_locations al ON aa.artist_id = al.artist_id
        JOIN locations ref ON al.location_id = ref.id
        WHERE aa.album_id = a.id
    `);

    const fInc = normalizeTagInput(format);
    if (fInc.length > 0) {
        whereClauses.push(`rf.name IN (${fInc.map(() => '?').join(',')})`);
        params.push(...fInc);
    }
    const fExc = normalizeTagInput(exclude_format);
    if (fExc.length > 0) {
        whereClauses.push(`(rf.name IS NULL OR rf.name NOT IN (${fExc.map(() => '?').join(',')}))`);
        params.push(...fExc);
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
            if (!isNaN(start) && !isNaN(end)) {
                whereClauses.push('YEAR(a.release_date) >= ? AND YEAR(a.release_date) <= ?');
                params.push(start, end);
            }
        }
    } else if (year) {
        whereClauses.push('YEAR(a.release_date) = ?');
        params.push(year);
    }

    if (search) {
        if (search.length > 3 && !/[%_]/.test(search)) {
            whereClauses.push(`(
                MATCH(a.title) AGAINST(? IN BOOLEAN MODE) 
                OR EXISTS (
                    SELECT 1 FROM album_artists aa 
                    JOIN artists art ON aa.artist_id = art.id 
                    WHERE aa.album_id = a.id AND MATCH(art.name) AGAINST(? IN BOOLEAN MODE)
                )
            )`);
            const searchStr = `*${search}*`;
            params.push(searchStr, searchStr);
        } else {
            whereClauses.push(`(a.title LIKE ? OR EXISTS (SELECT 1 FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id AND art.name LIKE ?))`);
            params.push(`%${search}%`, `%${search}%`);
        }
    }

    if (currentUserId && status) {
        if (status === 'listened') {
            whereClauses.push(`EXISTS (SELECT 1 FROM user_album_actions WHERE album_id = a.id AND user_id = ? AND action_type = 'listen')`);
            params.push(currentUserId);
        } else if (status === 'not_listened') {
            whereClauses.push(`NOT EXISTS (SELECT 1 FROM user_album_actions WHERE album_id = a.id AND user_id = ? AND action_type = 'listen')`);
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
    const sortKey = sort ? sort.toLowerCase() : 'release_date';

    if (isOnePerArtist) {
        switch (sortKey) {
            case 'rating':
                return `ORDER BY a.avg_score ${dir}, a.ratings_count DESC`;
            case 'popularity':
                return `ORDER BY a.popularity_score ${dir}`;
            case 'title':
                return `ORDER BY a.title ${dir}`;
            case 'release_date':
            default:
                return `ORDER BY a.release_date ${dir}`;
        }
    } else {
        switch (sortKey) {
            case 'rating':
                return `ORDER BY ast.avg_score ${dir}, ast.ratings_count DESC`;
            case 'popularity':
                return `ORDER BY (COALESCE(ast.listens_count, 0) + COALESCE(ast.wishlist_count, 0) + COALESCE(ast.likes_count, 0)) ${dir}`;
            case 'title':
                return `ORDER BY a.title ${dir}`;
            case 'release_date':
            default:
                return `ORDER BY a.release_date ${dir}`;
        }
    }
};

const getUserStatsSql = (userId) => {
    if (!userId) return ', 0 as is_listened, 0 as is_liked, 0 as is_wishlisted';
    return `
        , (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'listen') as is_listened
        , (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'like') as is_liked
        , (SELECT COUNT(*) FROM user_album_actions WHERE user_id = ? AND album_id = a.id AND action_type = 'wishlist') as is_wishlisted
    `;
};

const saveAlbumTransaction = async (connection, existingAlbumId, body, creatorId = null) => {
    const { title, artist, release_date, cover_url, label, primary_format, tracks, genres: rawGenres, language: rawLanguages, attributes: rawAttributes, description: rawDescriptors } = body;

    const genres = normalizeTagInput(rawGenres);
    const languages = normalizeTagInput(rawLanguages);
    const descriptors = normalizeTagInput(rawDescriptors);
    const attributes = normalizeTagInput(rawAttributes);
    const artistNames = normalizeTagInput(artist);

    let formatId = null;
    if (primary_format) {
        await connection.execute('INSERT IGNORE INTO release_formats (name) VALUES (?)', [primary_format]);
        const [fRows] = await connection.execute('SELECT id FROM release_formats WHERE name = ?', [primary_format]);
        if (fRows.length > 0) formatId = fRows[0].id;
    }

    const artistName0 = artistNames[0] || 'Unknown';
    let baseSlug = slugify(`${artistName0}-${title}`, { lower: true, strict: true });
    let slug = baseSlug;
    let slugCounter = 1;

    while (true) {
        const [rows] = await connection.execute('SELECT id FROM albums WHERE slug = ? AND id != COALESCE(?, 0)', [slug, existingAlbumId]);
        if (rows.length === 0) break;
        slug = `${baseSlug}-${slugCounter++}`;
    }

    let targetAlbumId = existingAlbumId;
    const isNewRelease = !existingAlbumId;

    if (targetAlbumId) {
        await connection.execute(
            `UPDATE albums SET title=?, slug=?, release_date=?, cover_url=?, label=?, release_format_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [title, slug, release_date || null, cover_url || null, label || null, formatId, targetAlbumId]
        );
    } else {
        // 3. Dodaj 'label' do zapytania INSERT
        const [resAlbum] = await connection.execute(
            `INSERT INTO albums (title, slug, release_date, cover_url, label, release_format_id) VALUES (?,?,?,?,?,?)`,
            [title, slug, release_date || null, cover_url || null, label || null, formatId]
        );
        targetAlbumId = resAlbum.insertId;
        await connection.execute('INSERT IGNORE INTO album_stats (album_id) VALUES (?)', [targetAlbumId]);
    }

    const syncTags = async (list, tableName, pivotTable, fkColumn) => {
        await connection.execute(`DELETE FROM ${pivotTable} WHERE album_id = ?`, [targetAlbumId]);
        for (const name of list) {
            await connection.execute(`INSERT IGNORE INTO ${tableName} (name) VALUES (?)`, [name]);
            const [r] = await connection.execute(`SELECT id FROM ${tableName} WHERE name = ?`, [name]);
            if (r.length) {
                await connection.execute(`INSERT INTO ${pivotTable} (album_id, ${fkColumn}) VALUES (?, ?)`, [targetAlbumId, r[0].id]);
            }
        }
    };

    await syncTags(attributes, 'release_attributes', 'album_release_attributes', 'attribute_id');
    await syncTags(genres, 'genres', 'album_genres', 'genre_id');
    await syncTags(languages, 'languages', 'album_languages', 'language_id');
    await syncTags(descriptors, 'descriptors', 'album_descriptors', 'descriptor_id');

    await connection.execute('DELETE FROM album_artists WHERE album_id = ?', [targetAlbumId]);
    const addedArtistIds = [];
    for (let i = 0; i < artistNames.length; i++) {
        const name = artistNames[i];
        const aSlug = slugify(name, { lower: true, strict: true});
        await connection.execute('INSERT IGNORE INTO artists (name, slug) VALUES (?, ?)', [name, aSlug]);
        const [art] = await connection.execute('SELECT id FROM artists WHERE name = ?', [name]);
        if (art.length) {
            addedArtistIds.push(art[0].id);
            await connection.execute('INSERT INTO album_artists (album_id, artist_id, is_main) VALUES (?, ?, ?)',
                [targetAlbumId, art[0].id, i === 0]);
        }
    }

    await connection.execute('DELETE FROM tracks WHERE album_id = ?', [targetAlbumId]);
    if (tracks && tracks.length) {
        const trackValues = tracks.map((t, i) => {
            const tNum = t.track_number || t.number || (i + 1);
            const tSlug = slugify(`${t.title}-${targetAlbumId}-${tNum}`, { lower: true, strict: true});
            return [targetAlbumId, tNum, t.title, t.duration || null, tSlug];
        });
        await connection.query('INSERT INTO tracks (album_id, track_number, title, duration, slug) VALUES ?', [trackValues]);
    }

    if (isNewRelease && addedArtistIds.length > 0) {
        try {
            const [subscribers] = await connection.query(
                `SELECT DISTINCT user_id FROM user_album_actions WHERE artist_id IN (?) AND action_type = 'follow'`,
                [addedArtistIds]
            );

            // Formatujemy tekst (używamy Markdownu, który na froncie pogrubiamy)
            const notificationText = `Nowe wydanie: ${artistName0} — [${title}](/release/album/${slug})`;

            for (const sub of subscribers) {
                // Przekazujemy slug jako 5-ty parametr!
                await createNotification(sub.user_id, creatorId, 'new_release', notificationText, slug);
            }
        } catch (notifyErr) {
            console.error("Notification error:", notifyErr);
        }
    }

    return { slug, albumId: targetAlbumId };
};

async function adjustAlbumRatingStats(connection, albumId, oldScore, newScore) {
    try {
        await connection.execute(`INSERT IGNORE INTO album_stats (album_id) VALUES (?)`, [albumId]);

        if (oldScore === null) {
            await connection.execute(`
                UPDATE album_stats SET
                                       ratings_count = ratings_count + 1,
                                       avg_score = (avg_score * ratings_count + ?) / (ratings_count + 1)
                WHERE album_id = ?
            `, [newScore, albumId]);
        } else {
            await connection.execute(`
                UPDATE album_stats SET
                    avg_score = (avg_score * ratings_count - ? + ?) / ratings_count
                WHERE album_id = ?
            `, [oldScore, newScore, albumId]);
        }
    } catch (err) {
        console.error("Ошибка инкрементального обновления рейтинга:", err);
    }
}

module.exports = (pool) => {
    router.get('/', async (req, res) => {
        let connection = null;
        try {
            const { page, limit, offset } = getPagination(req, 10);
            let currentUserId = null;
            if (req.headers.authorization) {
                try {
                    const token = req.headers.authorization.split(' ')[1];
                    const decoded = jwt.verify(token, JWT_SECRET);
                    currentUserId = decoded.id;
                } catch (e) {}
            }

            connection = await pool.getConnection();
            const { whereSql, params, onePerArtist } = buildFilters(req.query, currentUserId);

            let baseIdsSql;
            if (onePerArtist) {
                baseIdsSql = `
                    SELECT id FROM (
                                       SELECT a.id,
                                              a.release_date,
                                              a.title,
                                              COALESCE(ast.avg_score, 0) as avg_score,
                                              COALESCE(ast.ratings_count, 0) as ratings_count,
                                              (COALESCE(ast.listens_count, 0) + COALESCE(ast.wishlist_count, 0) + COALESCE(ast.likes_count, 0)) as popularity_score,
                                              ROW_NUMBER() OVER(PARTITION BY aa_main.artist_id ORDER BY COALESCE(ast.avg_score, 0) DESC, COALESCE(ast.ratings_count, 0) DESC) as rn
                                       FROM albums a
                                                JOIN album_artists aa_main ON a.id = aa_main.album_id AND aa_main.is_main = 1
                                                LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                                                LEFT JOIN album_stats ast ON a.id = ast.album_id
                                           ${whereSql}
                                   ) as a
                    WHERE rn = 1
                `;
            } else {
                baseIdsSql = `
                    SELECT a.id
                    FROM albums a
                             LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                             LEFT JOIN album_stats ast ON a.id = ast.album_id
                        ${whereSql}
                `;
            }

            const countSql = `SELECT COUNT(*) as total FROM (${baseIdsSql}) as sub_count`;
            const [countRows] = await connection.query(countSql, params);
            const total = countRows[0] ? countRows[0].total : 0;

            if (total === 0) {
                return res.json({ data: [], meta: getMeta(0, page, limit) });
            }

            const sortSql = buildSort(req.query.sort, req.query.order, onePerArtist);

            const [idRows] = await connection.query(`${baseIdsSql} ${sortSql} LIMIT ? OFFSET ?`, [...params, limit, offset]);

            if (idRows.length === 0) {
                return res.json({ data: [], meta: getMeta(total, page, limit) });
            }

            const ids = idRows.map(row => row.id);
            const placeholders = ids.map(() => '?').join(',');

            const finalSql = `
                SELECT
                    a.id, a.title, a.slug, a.release_date, a.cover_url,
                    rf.name as format_name,
                    COALESCE(ast.avg_score, 0) as avg_score,
                    COALESCE(ast.ratings_count, 0) as ratings_count,
                    COALESCE(ast.likes_count, 0) as likes_count,
                    COALESCE(ast.reviews_count, 0) as reviews_count,
                    COALESCE(ast.listens_count, 0) as listens_count,
                    COALESCE(ast.wishlist_count, 0) as wishlist_count,
                    COALESCE(ast.in_lists_count, 0) as in_lists_count,
                    0 as global_rank,
                    (SELECT JSON_ARRAYAGG(JSON_OBJECT('name', art.name, 'slug', art.slug)) FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id) AS artists,
                    (SELECT name FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id ORDER BY aa.is_main DESC LIMIT 1) AS artist_name,
                    (SELECT JSON_ARRAYAGG(g.name) FROM album_genres ag JOIN genres g ON ag.genre_id = g.id WHERE ag.album_id = a.id) AS genres,
                    (SELECT JSON_ARRAYAGG(d.name) FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id WHERE ad.album_id = a.id) AS descriptors,
                    (SELECT JSON_ARRAYAGG(ra.name) FROM album_release_attributes ara JOIN release_attributes ra ON ara.attribute_id = ra.id WHERE ara.album_id = a.id) AS album_attributes
                    ${getUserStatsSql(currentUserId)}
                FROM albums a
                         LEFT JOIN album_stats ast ON a.id = ast.album_id
                         LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                WHERE a.id IN (${placeholders})
                    ${buildSort(req.query.sort, req.query.order, false)}
            `;

            const finalParams = currentUserId ? [currentUserId, currentUserId, currentUserId, ...ids] : [...ids];
            const [rows] = await connection.query(finalSql, finalParams);

            const safeOffset = parseInt(offset) || 0;

            res.json({
                data: rows.map((r, index) => ({
                    ...r,
                    artists: parseJsonField(r.artists),
                    genres: parseJsonField(r.genres),
                    descriptors: parseJsonField(r.descriptors),
                    album_attributes: parseJsonField(r.album_attributes),
                    is_listened: !!r.is_listened,
                    is_liked: !!r.is_liked,
                    is_wishlisted: !!r.is_wishlisted,
                    global_rank: safeOffset + index + 1
                })),
                meta: getMeta(total, page, limit)
            });
        } catch (err) {
            console.error('SERVER ERROR:', err);
            res.status(500).json({ error: 'Błąd bazy danych', details: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    router.get('/by-slug/:slug', async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const data = await getFullAlbumData(connection, 'slug', req.params.slug);
            if (!data) return res.status(404).json({ error: 'Nie znaleziono' });
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    router.get('/:id', async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const data = await getFullAlbumData(connection, 'id', req.params.id);
            if (!data) return res.status(404).json({ error: 'Nie znaleziono' });
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    // РОУТ ДЛЯ ДОБАВЛЕНИЯ АЛЬБОМА (POST /api/albums)
    router.post('/', authenticate, async (req, res) => {
        // Проверяем, это добавление альбома или оценка
        // Если есть score и albumId (как число), это оценка.
        // Если есть title и artist, это добавление нового альбома.
        if (req.body.title && req.body.artist) {
            let connection = null;
            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();
                const result = await saveAlbumTransaction(connection, null, req.body, req.user.id);
                await connection.commit();
                return res.json(result);
            } catch (err) {
                if (connection) await connection.rollback();
                console.error("Add album error:", err);
                return res.status(500).json({ error: err.message });
            } finally {
                if (connection) connection.release();
            }
        }

        // Логика оценки (rating)
        const { albumId, score } = req.body;
        const userId = req.user.id;
        if (!albumId || score === undefined) return res.status(400).json({ error: 'Data missing' });

        let connection;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [existing] = await connection.execute(
                'SELECT score FROM ratings WHERE user_id = ? AND album_id = ?',
                [userId, albumId]
            );

            let oldScore = existing.length > 0 ? existing[0].score : null;

            if (oldScore !== null) {
                await connection.execute(
                    'UPDATE ratings SET score = ? WHERE user_id = ? AND album_id = ?',
                    [score, userId, albumId]
                );
            } else {
                await connection.execute(
                    'INSERT INTO ratings (user_id, album_id, score) VALUES (?, ?, ?)',
                    [userId, albumId, score]
                );
            }

            await adjustAlbumRatingStats(connection, albumId, oldScore, score);

            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            if (connection) await connection.rollback();
            res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    router.put('/:id/links', authenticate, authorizeAdmin, async (req, res) => {
        let connection = null;
        try {
            const albumId = req.params.id;
            const { links } = req.body;
            connection = await pool.getConnection();
            await connection.beginTransaction();
            await connection.execute('DELETE FROM album_links WHERE album_id = ?', [albumId]);
            if (links && Array.isArray(links)) {
                for (const link of links) {
                    if (link.url && link.url.trim() !== '') {
                        await connection.execute(
                            'INSERT INTO album_links (album_id, platform_id, url) VALUES (?, ?, ?)',
                            [albumId, link.platform_id, link.url.trim()]
                        );
                    }
                }
            }
            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            if (connection) await connection.rollback();
            res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    router.put('/:idOrSlug', authenticate, authorizeAdmin, async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const albumId = await getAlbumId(connection, req.params.idOrSlug);
            if (!albumId) return res.status(404).json({ error: 'Album nie został znaleziony' });
            await connection.beginTransaction();
            const result = await saveAlbumTransaction(connection, albumId, req.body, req.user.id);
            await connection.commit();
            res.json(result);
        } catch (err) {
            if (connection) await connection.rollback();
            res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    router.delete('/:id', authenticate, authorizeAdmin, async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const albumId = await getAlbumId(connection, req.params.id);
            if (albumId) await connection.execute('DELETE FROM albums WHERE id = ?', [albumId]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Usuwanie nie powiodło się' });
        } finally {
            if (connection) connection.release();
        }
    });

    const getFullAlbumData = async (connection, field, value) => {
        const [albums] = await connection.execute(`
            SELECT a.*, rf.name as format_name, ast.avg_score, ast.ratings_count, ast.reviews_count, ast.likes_count,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('name', art.name, 'slug', art.slug)) FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id) AS artists,
                   (SELECT JSON_ARRAYAGG(g.name) FROM album_genres ag JOIN genres g ON ag.genre_id = g.id WHERE ag.album_id = a.id) AS genres,
                   (SELECT JSON_ARRAYAGG(ra.name) FROM album_release_attributes ara JOIN release_attributes ra ON ara.attribute_id = ra.id WHERE ara.album_id = a.id) AS attributes,
                   (SELECT JSON_ARRAYAGG(l.name) FROM album_languages al JOIN languages l ON al.language_id = l.id WHERE al.album_id = a.id) AS languages,
                   (SELECT JSON_ARRAYAGG(d.name) FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id WHERE ad.album_id = a.id) AS descriptors
            FROM albums a
                     LEFT JOIN album_stats ast ON a.id = ast.album_id
                     LEFT JOIN release_formats rf ON a.release_format_id = rf.id
            WHERE a.${field} = ?
        `, [value]);

        if (!albums.length) return null;

        const album = albums[0];
        const avgScore = album.avg_score || 0;
        const ratCount = album.ratings_count || 0;

        const rankCond = `(s2.avg_score > ? OR (s2.avg_score = ? AND s2.ratings_count > ?))`;
        const rankParams = [avgScore, avgScore, ratCount];

        const [gRank] = await connection.execute(`SELECT COUNT(*) + 1 as \`rank\` FROM album_stats s2 WHERE ${rankCond}`, rankParams);
        album.current_rank = gRank[0].rank;

        let extra_ranks = { format: null, attributes: [] };

        if (album.release_format_id) {
            const [fRank] = await connection.execute(`
                SELECT COUNT(*) + 1 as \`rank\`
                FROM albums a2
                         JOIN album_stats s2 ON a2.id = s2.album_id
                WHERE a2.release_format_id = ? AND ${rankCond}
            `, [album.release_format_id, ...rankParams]);
            extra_ranks.format = { name: album.format_name, rank: fRank[0].rank };
        }

        const attrs = parseJsonField(album.attributes);
        for (const attrName of attrs) {
            const [aRank] = await connection.execute(`
                SELECT COUNT(*) + 1 as \`rank\`
                FROM album_release_attributes ara
                         JOIN release_attributes ra ON ara.attribute_id = ra.id
                         JOIN album_stats s2 ON ara.album_id = s2.album_id
                WHERE ra.name = ? AND ${rankCond}
            `, [attrName, ...rankParams]);
            extra_ranks.attributes.push({ name: attrName, rank: aRank[0].rank });
        }

        const [tracks] = await connection.execute(`
            SELECT t.*, COALESCE(ts.avg_score, 0) as average_rating, COALESCE(ts.ratings_count, 0) as rating_count
            FROM tracks t
                     LEFT JOIN tracks_stats ts ON t.id = ts.track_id
            WHERE t.album_id = ?
            ORDER BY t.track_number
        `, [album.id]);

        const [links] = await connection.execute('SELECT * FROM album_links WHERE album_id = ?', [album.id]);

        return {
            ...album,
            artists: parseJsonField(album.artists),
            genres: parseJsonField(album.genres),
            attributes: attrs,
            languages: parseJsonField(album.languages),
            descriptors: parseJsonField(album.descriptors),
            extra_ranks,
            tracks,
            links
        };
    };

    return router;
};