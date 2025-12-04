const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const authenticate = require('../authMiddleware');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================

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

// Функция для безопасного парсинга JSON полей из MySQL
const parseJsonField = (field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field; // Если драйвер уже вернул массив
    try {
        return JSON.parse(field);
    } catch (e) {
        return [];
    }
};

// ==========================================
// 2. QUERY BUILDERS (ИСПРАВЛЕНО: Функции-хелперы теперь внутри buildFilters)
// ==========================================

const buildFilters = (query, currentUserId) => {
    // Достаем параметры, включая новые (exclude_*)
    const {
        format, exclude_format,
        genres, exclude_genres,
        attributes, exclude_attributes,
        language, exclude_language,
        description, exclude_description,
        search, year, yearRange, status, one_per_artist
    } = query;

    const whereClauses = [];
    const params = [];

    // --- 1. Универсальный фильтр ВКЛЮЧЕНИЯ (INCLUDE) - Теперь определен ЗДЕСЬ ---
    const addListFilter = (input, pivotTable, refTable, fkColumnName) => {
        const list = normalizeTagInput(input);
        if (list.length > 0) {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM ${pivotTable} pivot
                JOIN ${refTable} ref ON pivot.${fkColumnName} = ref.id
                WHERE pivot.album_id = a.id AND ref.name IN (${list.map(() => '?').join(',')})
            )`);
            params.push(...list);
        }
    };

    // --- 2. Универсальный фильтр ИСКЛЮЧЕНИЯ (EXCLUDE) - Теперь определен ЗДЕСЬ ---
    const addExcludeListFilter = (input, pivotTable, refTable, fkColumnName) => {
        const list = normalizeTagInput(input);
        if (list.length > 0) {
            // Выбираем альбомы, где НЕ СУЩЕСТВУЕТ связи с запрещенными тегами
            whereClauses.push(`NOT EXISTS (
                SELECT 1 FROM ${pivotTable} pivot
                JOIN ${refTable} ref ON pivot.${fkColumnName} = ref.id
                WHERE pivot.album_id = a.id AND ref.name IN (${list.map(() => '?').join(',')})
            )`);
            params.push(...list);
        }
    };

    // === ПРИМЕНЕНИЕ ФИЛЬТРОВ ===

    // 1. Формат (Include - ОК)
    if (format) {
        const list = normalizeTagInput(format);
        if (list.length > 0) {
            whereClauses.push(`rf.name IN (${list.map(() => '?').join(',')})`);
            params.push(...list);
        }
    }

    // 2. Формат (Exclude - ОК)
    if (exclude_format) {
        const list = normalizeTagInput(exclude_format);
        if (list.length > 0) {
            whereClauses.push(`(rf.name IS NULL OR rf.name NOT IN (${list.map(() => '?').join(',')}))`);
            params.push(...list);
        }
    }

    // 3. Теги (Include - ИСПОЛЬЗУЕМ ИСПРАВЛЕННУЮ addListFilter)
    addListFilter(genres, 'album_genres', 'genres', 'genre_id');
    addListFilter(attributes, 'album_release_attributes', 'release_attributes', 'attribute_id');
    addListFilter(language, 'album_languages', 'languages', 'language_id');
    addListFilter(description, 'album_descriptors', 'descriptors', 'descriptor_id');

    // 4. Теги (Exclude - ИСПОЛЬЗУЕМ ИСПРАВЛЕННУЮ addExcludeListFilter)
    addExcludeListFilter(exclude_genres, 'album_genres', 'genres', 'genre_id');
    addExcludeListFilter(exclude_attributes, 'album_release_attributes', 'release_attributes', 'attribute_id');
    addExcludeListFilter(exclude_language, 'album_languages', 'languages', 'language_id');
    addExcludeListFilter(exclude_description, 'album_descriptors', 'descriptors', 'descriptor_id');

    // 5. Год
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

    // 6. Поиск
    if (search) {
        whereClauses.push(`(
            a.title LIKE ?
            OR EXISTS (
                SELECT 1 FROM album_artists aa
                JOIN artists art ON aa.artist_id = art.id
                WHERE aa.album_id = a.id AND art.name LIKE ?
            )
        )`);
        params.push(`%${search}%`, `%${search}%`);
    }

    // 7. Статус прослушивания (Only listened / Exclude listened)
    if (currentUserId && status) {
        if (status === 'listened') {
            whereClauses.push(`EXISTS (
                SELECT 1 FROM user_album_actions uaa
                WHERE uaa.album_id = a.id
                AND uaa.user_id = ?
                AND uaa.action_type = 'listen'
            )`);
            params.push(currentUserId);
        } else if (status === 'not_listened') {
            whereClauses.push(`NOT EXISTS (
                SELECT 1 FROM user_album_actions uaa
                WHERE uaa.album_id = a.id
                AND uaa.user_id = ?
                AND uaa.action_type = 'listen'
            )`);
            params.push(currentUserId);
        }
    }

    // 8. Один альбом на артиста (Лучший по рейтингу)
    if (one_per_artist === 'true') {
        whereClauses.push(`
            a.id = (
                SELECT inner_a.id
                FROM albums inner_a
                JOIN album_artists inner_aa ON inner_a.id = inner_aa.album_id
                LEFT JOIN album_stats inner_ast ON inner_a.id = inner_ast.album_id
                WHERE inner_aa.artist_id = (
                    -- Определяем главного артиста для текущей строки альбома 'a'
                    SELECT artist_id FROM album_artists
                    WHERE album_id = a.id
                    ORDER BY is_main DESC, artist_id ASC
                    LIMIT 1
                )
                -- Сортируем альбомы этого артиста по рейтингу
                ORDER BY inner_ast.avg_score DESC, inner_ast.ratings_count DESC, inner_a.release_date DESC
                LIMIT 1
            )
        `);
    }

    return {
        whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '',
        params
    };
};

const buildSort = (sort) => {
    const sortKey = sort ? sort.toLowerCase() : 'release_date';
    switch (sortKey) {
        case 'rating': return 'ORDER BY (ast.avg_score IS NULL), ast.avg_score DESC, ast.ratings_count DESC';
        case 'popularity': return 'ORDER BY ast.likes_count DESC';
        case 'title': return 'ORDER BY a.title ASC';
        case 'artist': return 'ORDER BY (SELECT name FROM artists ar JOIN album_artists aa ON ar.id = aa.artist_id WHERE aa.album_id = a.id LIMIT 1) ASC';
        default: return 'ORDER BY a.release_date DESC';
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

// ==========================================
// 3. SERVICE LOGIC (Транзакции)
// ==========================================

const saveAlbumTransaction = async (connection, existingAlbumId, body) => {
    const { title, artist, release_date, cover_url, primary_format, tracks, label, description: keywords } = body;

    const bio = null;
    const genres = normalizeTagInput(body.genres);
    const language = normalizeTagInput(body.language);
    const descriptors = normalizeTagInput(keywords);
    const attributes = normalizeTagInput(body.attributes);
    const artistNames = normalizeTagInput(artist);

    // 1. Находим/Создаем Формат
    let formatId = null;
    if (primary_format) {
        const [fRows] = await connection.execute('SELECT id FROM release_formats WHERE name = ?', [primary_format]);
        if (fRows.length > 0) formatId = fRows[0].id;
    }

    // 2. Генерируем Slug
    const artistName0 = artistNames[0] || 'Unknown';
    let baseSlug = slugify(`${artistName0}-${title}`, { lower: true, strict: true, locale: 'ru' });
    let slug = baseSlug;
    let slugCounter = 1;

    while (true) {
        const [rows] = await connection.execute('SELECT id FROM albums WHERE slug = ? AND id != COALESCE(?, 0)', [slug, existingAlbumId]);
        if (rows.length === 0) break;
        slug = `${baseSlug}-${slugCounter++}`;
    }

    // 3. Вставка/Обновление самого альбома
    let targetAlbumId = existingAlbumId;
    const albumParams = [title, slug, release_date, cover_url, formatId, label, bio];

    if (targetAlbumId) {
        await connection.execute(
            `UPDATE albums SET title=?, slug=?, release_date=?, cover_url=?, release_format_id=?, label=?, description=? WHERE id=?`,
            [...albumParams, targetAlbumId]
        );
    } else {
        const [resAlbum] = await connection.execute(
            `INSERT INTO albums (title, slug, release_date, cover_url, release_format_id, label, description) VALUES (?,?,?,?,?,?,?)`,
            albumParams
        );
        targetAlbumId = resAlbum.insertId;
        await connection.execute('INSERT INTO album_stats (album_id) VALUES (?)', [targetAlbumId]);
    }

    // 4. Helper для обновления связей
    const syncTags = async (list, tableName, pivotTable, fkColumn) => {
        await connection.execute(`DELETE FROM ${pivotTable} WHERE album_id = ?`, [targetAlbumId]);
        for (const name of list) {
            if (!name) continue;
            await connection.execute(`INSERT IGNORE INTO ${tableName} (name) VALUES (?)`, [name]);
            const [r] = await connection.execute(`SELECT id FROM ${tableName} WHERE name = ?`, [name]);
            if (r.length) {
                await connection.execute(`INSERT IGNORE INTO ${pivotTable} (album_id, ${fkColumn}) VALUES (?, ?)`, [targetAlbumId, r[0].id]);
            }
        }
    };

    await syncTags(attributes, 'release_attributes', 'album_release_attributes', 'attribute_id');
    await syncTags(genres, 'genres', 'album_genres', 'genre_id');
    await syncTags(language, 'languages', 'album_languages', 'language_id');
    await syncTags(descriptors, 'descriptors', 'album_descriptors', 'descriptor_id');

    // 5. Артисты
    await connection.execute('DELETE FROM album_artists WHERE album_id = ?', [targetAlbumId]);
    for (const name of artistNames) {
        const aSlug = slugify(name, { lower: true, strict: true, locale: 'ru' });
        await connection.execute('INSERT IGNORE INTO artists (name, slug) VALUES (?, ?)', [name, aSlug]);
        const [art] = await connection.execute('SELECT id FROM artists WHERE slug = ?', [aSlug]);
        if (art.length) {
            await connection.execute('INSERT IGNORE INTO album_artists (album_id, artist_id) VALUES (?, ?)', [targetAlbumId, art[0].id]);
        }
    }

    // 6. Треки
    await connection.execute('DELETE FROM tracks WHERE album_id = ?', [targetAlbumId]);
    if (tracks && tracks.length) {
        let tNum = 1;
        for (const t of tracks) {
            await connection.execute('INSERT INTO tracks (album_id, track_number, title, duration) VALUES (?,?,?,?)',
                [targetAlbumId, tNum++, t.title, t.duration]);
        }
    }

    return { slug, albumId: targetAlbumId };
};

// ==========================================
// 4. ROUTES
// ==========================================

module.exports = (pool) => {

    // === GET ALL (FILTERED) ===
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

            // ВАЖНО: передаем currentUserId в buildFilters
            const { whereSql, params } = buildFilters(req.query, currentUserId);

            // Считаем общее кол-во
            const [countRows] = await connection.execute(
                `SELECT COUNT(*) as total FROM albums a LEFT JOIN release_formats rf ON a.release_format_id = rf.id ${whereSql}`,
                params
            );

            const userParams = currentUserId ? [currentUserId, currentUserId, currentUserId] : [];
            const queryParams = [...userParams, ...params, limit.toString(), offset.toString()];

            const sql = `
                SELECT
                    a.id, a.title, a.slug, a.release_date, a.cover_url, a.description as bio,
                    rf.name as format_name,
                    COALESCE(ast.avg_score, 0) as avg_score,
                    COALESCE(ast.ratings_count, 0) as ratings_count,
                    COALESCE(ast.likes_count, 0) as likes_count,
                    COALESCE(ast.reviews_count, 0) as reviews_count,
                    COALESCE(ast.listens_count, 0) as listens_count,
                    COALESCE(ast.wishlist_count, 0) as wishlist_count,
                    COALESCE(ast.in_lists_count, 0) as in_lists_count,

                    (SELECT COUNT(*) + 1 FROM album_stats s2 WHERE s2.avg_score > ast.avg_score OR (s2.avg_score = ast.avg_score AND s2.ratings_count > ast.ratings_count)) as global_rank,

                    (SELECT JSON_ARRAYAGG(name) FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id) AS artists,
                    (SELECT name FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id ORDER BY aa.is_main DESC LIMIT 1) AS artist_name,
                    (SELECT JSON_ARRAYAGG(name) FROM album_genres ag JOIN genres g ON ag.genre_id = g.id WHERE ag.album_id = a.id) AS genres,
                    (SELECT JSON_ARRAYAGG(name) FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id WHERE ad.album_id = a.id) AS descriptors,
                    (SELECT JSON_ARRAYAGG(name) FROM album_languages al JOIN languages l ON al.language_id = l.id WHERE al.album_id = a.id) AS languages,
                    (SELECT JSON_ARRAYAGG(name) FROM album_release_attributes ara JOIN release_attributes ra ON ara.attribute_id = ra.id WHERE ara.album_id = a.id) AS attributes

                    ${getUserStatsSql(currentUserId)}
                FROM albums a
                         LEFT JOIN album_stats ast ON a.id = ast.album_id
                         LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                    ${whereSql}
                GROUP BY a.id
                    ${buildSort(req.query.sort)}
                LIMIT ? OFFSET ?
            `;

            const [rows] = await connection.execute(sql, queryParams);

            const enrichedRows = rows.map(row => ({
                ...row,
                is_listened: !!row.is_listened,
                is_liked: !!row.is_liked,
                is_wishlisted: !!row.is_wishlisted,
                artists: parseJsonField(row.artists),
                genres: parseJsonField(row.genres),
                descriptors: parseJsonField(row.descriptors),
                languages: parseJsonField(row.languages),
                attributes: parseJsonField(row.attributes),
            }));

            res.json({
                data: enrichedRows,
                meta: { total: countRows[0].total, page, limit, total_pages: Math.ceil(countRows[0].total / limit) }
            });

        } catch (err) {
            console.error('GET /api/albums error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === GET BY SLUG ===
    router.get('/by-slug/:slug', async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const { slug } = req.params;

            const [albums] = await connection.execute(`
                SELECT a.*, rf.name as format_name,
                       COALESCE(ast.avg_score, 0) as avg_score,
                       COALESCE(ast.ratings_count, 0) as ratings_count,
                       COALESCE(ast.reviews_count, 0) as reviews_count,
                       COALESCE(ast.likes_count, 0) as likes,

                       (SELECT JSON_ARRAYAGG(JSON_OBJECT('name', art.name, 'slug', art.slug))
                        FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id) AS artists,

                       (SELECT JSON_ARRAYAGG(name) FROM album_genres ag JOIN genres g ON ag.genre_id = g.id WHERE ag.album_id = a.id) AS genres,
                       (SELECT JSON_ARRAYAGG(name) FROM album_descriptors ad JOIN descriptors d ON ad.descriptor_id = d.id WHERE ad.album_id = a.id) AS descriptors,
                       (SELECT JSON_ARRAYAGG(name) FROM album_languages al JOIN languages l ON al.language_id = l.id WHERE al.album_id = a.id) AS languages,
                       (SELECT JSON_ARRAYAGG(name) FROM album_release_attributes ara JOIN release_attributes ra ON ara.attribute_id = ra.id WHERE ara.album_id = a.id) AS attributes

                FROM albums a
                         LEFT JOIN album_stats ast ON a.id = ast.album_id
                         LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                WHERE a.slug = ?
                GROUP BY a.id
            `, [slug]);

            if (!albums.length) return res.status(404).json({ error: 'Album not found' });

            const album = albums[0];
            const parsedArtists = parseJsonField(album.artists);
            const parsedAttributes = parseJsonField(album.attributes);
            const currentScore = parseFloat(album.avg_score);
            const currentCount = parseInt(album.ratings_count);

            // CALCULATE RANKS
            let currentRank = null;
            let extraRanks = { format: null, attributes: [] };

            if (currentScore > 0) {
                const [rankRows] = await connection.execute(`
                    SELECT COUNT(*) + 1 as \`rank\` FROM album_stats
                    WHERE (avg_score > ?) OR (avg_score = ? AND ratings_count > ?)
                `, [currentScore, currentScore, currentCount]);

                if (rankRows && rankRows.length > 0) {
                    currentRank = rankRows[0].rank;
                }

                if (album.format_name) {
                    const [fRankRows] = await connection.execute(`
                        SELECT COUNT(*) + 1 as \`rank\`
                        FROM album_stats ast
                                 JOIN albums a ON ast.album_id = a.id
                                 LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                        WHERE rf.name = ?
                          AND ((ast.avg_score > ?) OR (ast.avg_score = ? AND ast.ratings_count > ?))
                    `, [album.format_name, currentScore, currentScore, currentCount]);

                    if (fRankRows && fRankRows.length > 0) {
                        extraRanks.format = {
                            name: album.format_name,
                            rank: fRankRows[0].rank
                        };
                    }
                }

                if (parsedAttributes && parsedAttributes.length > 0) {
                    for (const attrName of parsedAttributes) {
                        const [aRankRows] = await connection.execute(`
                            SELECT COUNT(*) + 1 as \`rank\`
                            FROM album_stats ast
                                     JOIN album_release_attributes ara ON ast.album_id = ara.album_id
                                     JOIN release_attributes ra ON ara.attribute_id = ra.id
                            WHERE ra.name = ?
                              AND ((ast.avg_score > ?) OR (ast.avg_score = ? AND ast.ratings_count > ?))
                        `, [attrName, currentScore, currentScore, currentCount]);

                        if (aRankRows && aRankRows.length > 0) {
                            extraRanks.attributes.push({
                                name: attrName,
                                rank: aRankRows[0].rank
                            });
                        }
                    }
                }
            }

            const responseData = {
                ...album,
                artists: parsedArtists,
                genres: parseJsonField(album.genres),
                descriptors: parseJsonField(album.descriptors),
                languages: parseJsonField(album.languages),
                attributes: parsedAttributes,
                current_rank: currentRank,
                extra_ranks: extraRanks
            };

            const [tracks] = await connection.execute('SELECT id, track_number, title, duration FROM tracks WHERE album_id = ? ORDER BY track_number', [album.id]);
            responseData.tracks = tracks;

            const [links] = await connection.execute('SELECT * FROM album_links WHERE album_id = ?', [album.id]);
            responseData.links = links;

            res.json(responseData);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === CREATE ===
    router.post('/', authenticate, async (req, res) => {
        let connection = null;
        try {
            if (!req.body.title || !req.body.artist) return res.status(400).json({ error: 'Required fields missing' });
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const result = await saveAlbumTransaction(connection, null, req.body);

            await connection.commit();
            res.status(201).json({ slug: result.slug, message: 'Album created' });
        } catch (err) {
            if (connection) await connection.rollback();
            console.error('Album creation failed:', err);
            res.status(500).json({ error: err.message || 'Server error during album creation' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === UPDATE ===
    router.put('/:idOrSlug', authenticate, async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const albumId = await getAlbumId(connection, req.params.idOrSlug);
            if (!albumId) return res.status(404).json({ error: 'Album not found' });

            await connection.beginTransaction();
            const result = await saveAlbumTransaction(connection, albumId, req.body);
            await connection.commit();

            res.json({ slug: result.slug, message: 'Album updated' });
        } catch (err) {
            if (connection) await connection.rollback();
            res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    // === DELETE ===
    router.delete('/:id', authenticate, async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const albumId = await getAlbumId(connection, req.params.id);
            if (!albumId) return res.status(404).json({ error: 'Not found' });
            await connection.execute('DELETE FROM albums WHERE id = ?', [albumId]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Delete failed' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === LINKS ROUTES ===
    router.post('/:id/links', authenticate, async (req, res) => {
        let connection = null;
        try {
            if (!req.body.url) return res.status(400).json({ error: 'URL required' });
            connection = await pool.getConnection();
            const albumId = await getAlbumId(connection, req.params.id);
            if (!albumId) return res.status(404).json({ error: 'Album not found' });
            await connection.execute('INSERT INTO album_links (album_id, platform_name, url) VALUES (?, ?, ?)', [albumId, req.body.platform || 'Other', req.body.url]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'DB error' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.delete('/links/:linkId', authenticate, async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            await connection.execute('DELETE FROM album_links WHERE id = ?', [req.params.linkId]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'DB error' });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};