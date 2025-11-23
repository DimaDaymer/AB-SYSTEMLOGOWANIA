const express = require('express');

const router = express.Router();

const slugify = require('slugify');

const { pool } = require('../db'); // Убедись, что путь правильный

const authenticate = require('../authMiddleware');
// Маппинг параметров сортировки URL на реальные колонки БД
const SORT_MAPPING = {
    'rating': 'ast.avg_score',
    'popularity': 'ast.likes_count',
    'release_date': 'a.release_date',
    'title': 'a.title', // <-- ДОБАВЛЕНО
    'artist': 'artist_name' // <-- ДОБАВЛЕНО
};

const stringToArray = (str) => (typeof str === 'string' ? str.split(',').map(s => s.trim()).filter(s => s.length > 0) : (str || []));

module.exports = (pool) => {

    // GET /api/albums (Список альбомов с фильтрацией)
    router.get('/', async (req, res) => {
        let connection;
        try {
            // !!! ДОБАВЛЕН attributes в деструктуризацию !!!
            const { sort, order, format, attributes, year, yearRange, genres, description, language, search } = req.query;

            connection = await pool.getConnection();

            // Основной запрос
            let query = `
                SELECT
                    a.id, a.title, a.slug, a.release_date, a.cover_url, a.genres,
                    rf.name as format_name,
                    ast.avg_score,
                    ast.ratings_count,
                    ast.reviews_count,
                    ast.likes_count as likes,
                    (SELECT GROUP_CONCAT(art.name SEPARATOR ', ')
                     FROM album_artists aa
                              JOIN artists art ON aa.artist_id = art.id
                     WHERE aa.album_id = a.id) AS artist_name,

                    -- Получаем список атрибутов одной строкой (Live, Demo...)
                    (SELECT GROUP_CONCAT(ra.name SEPARATOR ', ')
                     FROM album_release_attributes ara
                              JOIN release_attributes ra ON ara.attribute_id = ra.id
                     WHERE ara.album_id = a.id) AS attributes_list

                FROM albums a
                         JOIN album_stats ast ON a.id = ast.album_id
                         LEFT JOIN release_formats rf ON a.release_format_id = rf.id
            `;

            const whereClauses = [];
            const params = [];

            // === 0. ПЕРЕМЕННЫЕ ДЛЯ СЛОЖНЫХ JOIN/GROUP BY ===
            let shouldGroupBy = true;
            let groupByIds = ['a.id', 'a.title', 'a.slug', 'a.release_date', 'a.cover_url', 'a.genres', 'rf.name', 'ast.avg_score', 'ast.ratings_count', 'ast.reviews_count', 'ast.likes_count'];
            let havingClauses = [];


            // === ФИЛЬТРЫ ===

            // 1. ФИЛЬТР ПО ФОРМАТУ (Album, EP, Single...) - Строгое соответствие
            if (format) {
                const formatList = stringToArray(format);
                if (formatList.length > 0) {
                    const placeholders = formatList.map(() => '?').join(',');
                    // Ищем альбомы, у которых format_name один из выбранных
                    whereClauses.push(`rf.name IN (${placeholders})`);
                    params.push(...formatList);
                }
            }

            // 2. ФИЛЬТР ПО АТРИБУТАМ (Live, Soundtrack...) - Строгое "И"
            if (attributes) {
                const attrNames = stringToArray(attributes);
                if (attrNames.length > 0) {
                    // Используем INNER JOIN и HAVING COUNT() для требования совпадения ВСЕХ выбранных атрибутов
                    query += `
                        INNER JOIN album_release_attributes ara ON a.id = ara.album_id
                        INNER JOIN release_attributes ra ON ara.attribute_id = ra.id
                    `;

                    // Фильтруем JOIN по выбранным атрибутам в WHERE
                    whereClauses.push(`ra.name IN (${attrNames.map(() => '?').join(',')})`);
                    params.push(...attrNames);

                    // Условие HAVING: количество уникальных совпавших атрибутов должно быть равно количеству запрошенных
                    havingClauses.push(`COUNT(DISTINCT ra.name) = ?`);
                    params.push(attrNames.length);

                    // Так как мы добавляем HAVING, нам нужно будет группировать
                    shouldGroupBy = true;
                }
            }

            // 3. Жанры (Оставляем как было)
            if (genres) {
                const genreArray = stringToArray(genres);
                if (genreArray.length > 0) {
                    const conds = genreArray.map(() => `FIND_IN_SET(?, REPLACE(TRIM(a.genres), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${conds})`);
                    params.push(...genreArray.map(g => g.replace(/ /g, '')));
                }
            }

            // 4. Дескрипторы (Оставляем как было)
            if (description) {
                const descArray = stringToArray(description);
                if (descArray.length > 0) {
                    const conds = descArray.map(() => `FIND_IN_SET(?, REPLACE(TRIM(a.description), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${conds})`);
                    params.push(...descArray.map(d => d.replace(/ /g, '')));
                }
            }

            // 5. Язык (Оставляем как было)
            if (language) {
                const langArray = stringToArray(language);
                if (langArray.length > 0) {
                    const conds = langArray.map(() => `FIND_IN_SET(?, REPLACE(TRIM(a.language), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${conds})`);
                    params.push(...langArray.map(l => l.replace(/ /g, '')));
                }
            }

            // 6. Года (Оставляем как было)
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

            // 7. Поиск (Название альбома или Имя артиста)
            if (search) {
                // Добавляем JOIN для поиска по артисту (нужно для WHERE)
                query += ` LEFT JOIN album_artists aa_search ON a.id = aa_search.album_id
                            LEFT JOIN artists art_search ON aa_search.artist_id = art_search.id `;

                whereClauses.push('(a.title LIKE ? OR art_search.name LIKE ?)');
                params.push(`%${search}%`, `%${search}%`);

                shouldGroupBy = true;
            }

            // === СБОРКА ЗАПРОСА ===

            if (whereClauses.length > 0) {
                query += ` WHERE ${whereClauses.join(' AND ')}`;
            }

            // Группировка обязательна, если есть атрибуты или поиск по артисту
            if (shouldGroupBy || attributes) {
                query += ` GROUP BY ${groupByIds.join(', ')}`;
            }

            // Применяем HAVING, если есть атрибуты
            if (havingClauses.length > 0) {
                query += ` HAVING ${havingClauses.join(' AND ')}`;
            }


            // === СОРТИРОВКА ===
            const sortKey = sort ? sort.toLowerCase() : 'release_date';
            const sortCol = SORT_MAPPING[sortKey] || 'a.release_date';
            const dir = order && ['asc', 'desc'].includes(order.toLowerCase()) ? order.toUpperCase() : 'DESC';

            query += ` ORDER BY ${sortCol} ${dir}`;

            const [rows] = await connection.execute(query, params);
            res.json(rows);

        } catch (err) {
            console.error('GET /api/albums error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    // ... (Остальные маршруты: /by-slug, POST, DELETE) ...

    router.get('/by-slug/:slug', async (req, res) => {
        // ... (Код не изменен, так как логика фильтрации здесь не нужна) ...
        let connection;
        try {
            const { slug } = req.params;
            connection = await pool.getConnection();

            // 1. Основной запрос альбома
            const [albums] = await connection.execute(
                `SELECT
                     a.*,
                     rf.name as format_name,
                     ast.avg_score,
                     ast.ratings_count,
                     ast.reviews_count,
                     ast.likes_count as likes,
                     ast.current_rank,
                     ast.chart_slug,
                     (SELECT GROUP_CONCAT(ra.name SEPARATOR ', ')
                      FROM album_release_attributes ara
                               JOIN release_attributes ra ON ara.attribute_id = ra.id
                      WHERE ara.album_id = a.id) AS attributes_list,
                     JSON_ARRAYAGG(JSON_OBJECT('name', art.name, 'slug', art.slug)) AS artists
                 FROM albums a
                          JOIN album_stats ast ON a.id = ast.album_id
                          LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                          LEFT JOIN album_artists aa ON a.id = aa.album_id
                          LEFT JOIN artists art ON aa.artist_id = art.id
                 WHERE a.slug = ?
                 GROUP BY a.id`,
                [slug]
            );

            if (albums.length === 0) return res.status(404).json({ error: 'Album not found' });

            const albumData = albums[0];
            // Парсинг данных
            let artistsData = albumData.artists;
            if (typeof artistsData === 'string') { try { artistsData = JSON.parse(artistsData); } catch (e) { artistsData = []; } }
            albumData.artists = Array.isArray(artistsData) ? artistsData.filter(a => a.name) : [];
            albumData.genres = stringToArray(albumData.genres);
            albumData.language = stringToArray(albumData.language);
            albumData.description = stringToArray(albumData.description);
            albumData.attributes = stringToArray(albumData.attributes_list);

            // === 2. РАСШИРЕННАЯ ЛОГИКА РАНКОВ ===

            // Мы будем считать ранги только если у альбома есть рейтинг > 0
            const score = parseFloat(albumData.avg_score);
            const ranks = {
                format: null,   // Например: { rank: 5, name: 'EP' }
                attributes: []  // Например: [{ rank: 1, name: 'Live' }]
            };

            if (score > 0) {
                // А. Ранг по ФОРМАТУ (Format Rank)
                if (albumData.format_name) {
                    // Считаем кол-во альбомов ТАКОГО ЖЕ формата с рейтингом ВЫШЕ
                    const [rows] = await connection.execute(`
                        SELECT COUNT(*) + 1 as rank_val
                        FROM album_stats ast
                                 JOIN albums a ON ast.album_id = a.id
                                 LEFT JOIN release_formats rf ON a.release_format_id = rf.id
                        WHERE ast.avg_score > ?          -- Строго больше
                          AND rf.name = ?                  -- Тот же формат
                    `, [score, albumData.format_name]);

                    if (rows[0]) {
                        ranks.format = { rank: rows[0].rank_val, name: albumData.format_name };
                    }
                }

                // Б. Ранги по АТРИБУТАМ (Attribute Ranks)
                if (albumData.attributes.length > 0) {
                    for (const attrName of albumData.attributes) {
                        const [rows] = await connection.execute(`
                            SELECT COUNT(*) + 1 as rank_val
                            FROM album_stats ast
                                     JOIN albums a ON ast.album_id = a.id
                                     JOIN album_release_attributes ara ON a.id = ara.album_id
                                     JOIN release_attributes ra ON ara.attribute_id = ra.id
                            WHERE ast.avg_score > ?     -- Строго больше
                              AND ra.name = ?             -- Тот же атрибут
                        `, [score, attrName]);

                        if (rows[0]) {
                            ranks.attributes.push({ rank: rows[0].rank_val, name: attrName });
                        }
                    }
                }
            }

            albumData.extra_ranks = ranks;
            // ==============================================

            // Треки
            const [tracks] = await connection.execute(
                `SELECT id, track_number, title, duration FROM tracks WHERE album_id = ? ORDER BY track_number`,
                [albumData.id]
            );

            res.json({ ...albumData, tracks: tracks });

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    // ... (Код POST/DELETE/Links не изменен) ...

    router.post('/', authenticate, async (req, res) => {
        let connection;
        try {
            // primary_format - например 'Album' или 'EP'
            // attributes - массив строк ['Live', 'Unauthorized']
            const { title, artist, release_date, cover_url, primary_format, attributes, genres, label, language, description, tracks } = req.body;

            if (!title || !artist) {
                return res.status(400).json({ error: 'Title and Artist required' });
            }

            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 1. Находим ID формата
            let formatId = null;
            if (primary_format) {
                const [fRows] = await connection.execute('SELECT id FROM release_formats WHERE name = ?', [primary_format]);
                if (fRows.length > 0) formatId = fRows[0].id;
            }

            // 2. Создаем альбом
            const artistName0 = stringToArray(artist)[0];
            const slug = slugify(`${artistName0}-${title}`, { lower: true, strict: true, locale: 'ru' });

            const [resAlbum] = await connection.execute(
                `INSERT INTO albums (title, slug, release_date, cover_url, release_format_id, genres, label, language, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [title, slug, release_date, cover_url, formatId, genres, label, language, description]
            );
            const albumId = resAlbum.insertId;

            // (Запись в album_stats создается автоматически триггером)

            // 3. Привязываем атрибуты
            if (attributes && Array.isArray(attributes)) {
                for (const attrName of attributes) {
                    const [aRows] = await connection.execute('SELECT id FROM release_attributes WHERE name = ?', [attrName]);
                    if (aRows.length > 0) {
                        await connection.execute('INSERT IGNORE INTO album_release_attributes (album_id, attribute_id) VALUES (?, ?)', [albumId, aRows[0].id]);
                    }
                }
            }

            // 4. Обработка Артистов
            const artistNames = stringToArray(artist);
            for (const name of artistNames) {
                const aSlug = slugify(name, { lower: true, strict: true, locale: 'ru' });
                let artId;
                const [exArt] = await connection.execute('SELECT id FROM artists WHERE slug = ?', [aSlug]);

                if (exArt.length > 0) {
                    artId = exArt[0].id;
                } else {
                    const [newArt] = await connection.execute('INSERT INTO artists (name, slug) VALUES (?, ?)', [name, aSlug]);
                    artId = newArt.insertId;
                }
                await connection.execute('INSERT INTO album_artists (album_id, artist_id) VALUES (?, ?)', [albumId, artId]);
            }

            // 5. Обработка Треков
            if (tracks && tracks.length > 0) {
                tracks.sort((a, b) => (a.number || 0) - (b.number || 0));
                let tNum = 1;
                for (const t of tracks) {
                    await connection.execute(
                        'INSERT INTO tracks (album_id, track_number, title, duration) VALUES (?,?,?,?)',
                        [albumId, tNum++, t.title, t.duration]
                    );
                }
            }

            await connection.commit();
            res.status(201).json({ slug, message: 'Album created successfully' });

        } catch (err) {
            if (connection) await connection.rollback();
            console.error('POST /api/albums error:', err);
            res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    router.delete('/:id', authenticate, async (req, res) => {
        let connection;
        try {
            const { id } = req.params;
            connection = await pool.getConnection();

            // Благодаря ON DELETE CASCADE в базе, достаточно удалить только из albums.
            // Остальные таблицы (stats, tracks, artists_link) очистятся сами.
            const [result] = await connection.execute('DELETE FROM albums WHERE id = ?', [id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Album not found' });
            }

            res.json({ success: true, message: 'Album deleted' });

        } catch (err) {
            console.error('DELETE error:', err);
            res.status(500).json({ error: 'Failed to delete album' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.get('/:id/links', async (req, res) => {
        let connection;
        try {
            const { id } = req.params;
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT * FROM album_links WHERE album_id = ?', [id]);
            res.json(rows);
        } catch (err) {
            console.error('GET links error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.post('/:id/links', authenticate, async (req, res) => {
        let connection;
        try {
            const { id } = req.params; // album_id
            const { platform, url } = req.body;

            if (!url) return res.status(400).json({ error: 'URL is required' });

            connection = await pool.getConnection();
            await connection.execute(
                'INSERT INTO album_links (album_id, platform_name, url) VALUES (?, ?, ?)',
                [id, platform || 'Other', url]
            );
            res.json({ success: true });
        } catch (err) {
            console.error('POST link error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.delete('/links/:linkId', authenticate, async (req, res) => {
        let connection;
        try {
            const { linkId } = req.params;
            connection = await pool.getConnection();
            await connection.execute('DELETE FROM album_links WHERE id = ?', [linkId]);
            res.json({ success: true });
        } catch (err) {
            console.error('DELETE link error:', err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });
    return router;
};