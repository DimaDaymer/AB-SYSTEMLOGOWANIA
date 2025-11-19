const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

const VALID_SORTS = ['rating', 'popularity', 'release_date', 'title', 'artist'];
const VALID_ORDERS = ['asc', 'desc'];

// Утилита для преобразования строки с разделителями в массив строк
const stringToArray = (str) => (typeof str === 'string' ? str.split(',').map(s => s.trim()).filter(s => s.length > 0) : (str || []));

module.exports = (pool) => {

    // ... (router.get('/') - код для получения списка альбомов)

    router.get('/', async (req, res) => {
        let connection;
        try {
            const { sort, order, format, year, yearRange, genres, description, language, search } = req.query;

            if (sort && !VALID_SORTS.includes(sort.toLowerCase())) {
                return res.status(400).json({ error: 'Invalid sort parameter. Must be one of: ' + VALID_SORTS.join(', ') });
            }

            if (order && !VALID_ORDERS.includes(order.toLowerCase())) {
                return res.status(400).json({ error: 'Invalid order parameter. Must be asc or desc.' });
            }

            connection = await pool.getConnection();

            let query = `
                SELECT
                    a.*,
                    (SELECT GROUP_CONCAT(art.name SEPARATOR ', ') FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id) AS artist_name,
                    COALESCE(AVG(r.score), 0) AS average_rating,
                    (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'like') AS likes,
                    (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'wishlist') AS wishlist_count,
                    (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'add-to-list') AS in_lists_count,
                    (SELECT COUNT(id) FROM reviews WHERE album_id = a.id) AS reviews_count
                FROM albums a
                         LEFT JOIN ratings r ON a.id = r.album_id
            `;

            const whereClauses = [];
            const params = [];
            const groupClauses = ['a.id'];

            // Фильтрация по жанрам
            if (genres) {
                const genreArray = stringToArray(genres);
                if (genreArray.length > 0) {
                    const findInSetConditions = genreArray.map(genre => `FIND_IN_SET(?, REPLACE(TRIM(a.genres), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${findInSetConditions})`);
                    const cleanedGenreArray = genreArray.map(g => g.replace(/ /g, ''));
                    params.push(...cleanedGenreArray);
                }
            }

            // Фильтрация по описанию
            if (description) {
                const descriptionArray = stringToArray(description);
                if (descriptionArray.length > 0) {
                    const findInSetConditions = descriptionArray.map(d => `FIND_IN_SET(?, REPLACE(TRIM(a.description), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${findInSetConditions})`);
                    const cleanedDescriptionArray = descriptionArray.map(d => d.replace(/ /g, ''));
                    params.push(...cleanedDescriptionArray);
                }
            }

            // Фильтрация по языку
            if (language) {
                const languageArray = stringToArray(language);
                if (languageArray.length > 0) {
                    const findInSetConditions = languageArray.map(l => `FIND_IN_SET(?, REPLACE(TRIM(a.language), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${findInSetConditions})`);
                    const cleanedLanguageArray = languageArray.map(l => l.replace(/ /g, ''));
                    params.push(...cleanedLanguageArray);
                }
            }

            // Фильтрация по формату
            if (format) {
                const formats = stringToArray(format);
                if (formats.length > 0) {
                    whereClauses.push(`a.type IN (${formats.map(() => '?').join(',')})`);
                    params.push(...formats);
                }
            }

            // Фильтрация по году
            if (year && !isNaN(year)) {
                whereClauses.push('YEAR(a.release_date) = ?');
                params.push(parseInt(year, 10));
            }

            // Фильтрация по диапазону лет
            if (yearRange) {
                const yearMatch = yearRange.match(/(\d{4})-(\d{4})/);
                if (yearMatch) {
                    const [_, startYear, endYear] = yearMatch;
                    whereClauses.push('YEAR(a.release_date) BETWEEN ? AND ?');
                    params.push(parseInt(startYear, 10), parseInt(endYear, 10));
                } else if (yearRange.endsWith('s')) {
                    const decadeStart = parseInt(yearRange.slice(0, 4), 10);
                    const decadeEnd = decadeStart + 9;
                    whereClauses.push('YEAR(a.release_date) BETWEEN ? AND ?');
                    params.push(decadeStart, decadeEnd);
                }
            }

            // Поиск по названию/исполнителю
            if (search) {
                whereClauses.push('(a.title LIKE ? OR (SELECT GROUP_CONCAT(art.name SEPARATOR ", ") FROM album_artists aa JOIN artists art ON aa.artist_id = art.id WHERE aa.album_id = a.id) LIKE ?)');
                params.push(`%${search}%`, `%${search}%`);
            }

            // Добавляем все условия WHERE
            if (whereClauses.length > 0) {
                query += ` WHERE ${whereClauses.join(' AND ')}`;
            }

            // Группировка
            query += ` GROUP BY ${groupClauses.join(', ')}`;

            // Сортировка
            const orderDirection = order && ['asc', 'desc'].includes(order.toLowerCase()) ? order.toUpperCase() : 'DESC';

            let orderByClause = '';
            if (sort === 'rating') {
                orderByClause = `ORDER BY average_rating ${orderDirection}, likes DESC, a.release_date DESC`;
            } else if (sort === 'popularity') {
                orderByClause = `ORDER BY likes ${orderDirection}, average_rating DESC, a.release_date DESC`;
            } else if (sort === 'release_date') {
                orderByClause = `ORDER BY a.release_date ${orderDirection}, likes DESC`;
            } else if (sort === 'title') {
                orderByClause = `ORDER BY a.title ${orderDirection}`;
            } else if (sort === 'artist') {
                // Для сортировки по исполнителю нужно добавить artist_name в GROUP BY
                query += `, artist_name`;
                orderByClause = `ORDER BY artist_name ${orderDirection}`;
            } else {
                // Сортировка по умолчанию
                orderByClause = `ORDER BY likes DESC, average_rating DESC, a.release_date DESC`;
            }

            query += ` ${orderByClause}`;

            // Выполнение запроса
            const [albums] = await connection.execute(query, params);

            res.json(albums);

        } catch (err) {
            console.error('GET /api/albums error:', err);
            res.status(500).json({ error: 'Failed to fetch albums' });
        } finally {
            if (connection) connection.release();
        }
    });

    // ... (router.get('/by-slug/:slug') - код для получения альбома по slug)

    router.get('/by-slug/:slug', async (req, res) => {
        let connection;
        try {
            const { slug } = req.params;
            connection = await pool.getConnection();

            // Включаем JOIN для получения данных исполнителей через JSON_ARRAYAGG
            const [albums] = await connection.execute(
                `SELECT
                     a.*,
                     COALESCE(AVG(r.score), 0) AS average_rating,
                     (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'like') AS likes,
                     (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'wishlist') AS wishlist_count,
                     (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'add-to-list') AS in_lists_count,
                     (SELECT COUNT(id) FROM reviews WHERE album_id = a.id) AS reviews_count,
                     JSON_ARRAYAGG(
                             JSON_OBJECT('name', art.name, 'slug', art.slug)
                     ) AS artists
                 FROM albums a
                          LEFT JOIN ratings r ON a.id = r.album_id
                          LEFT JOIN album_artists aa ON a.id = aa.album_id
                          LEFT JOIN artists art ON aa.artist_id = art.id
                 WHERE a.slug = ?
                 GROUP BY a.id`,
                [slug]
            );

            if (albums.length === 0) {
                return res.status(404).json({ error: 'Album not found' });
            }

            const albumData = albums[0];
            console.log(`Album found: ${albumData.title}`);

            // === ИСПРАВЛЕНИЕ ОШИБКИ JSON.parse ===
            let artistsData = albumData.artists;

            if (typeof artistsData === 'string') {
                try {
                    artistsData = JSON.parse(artistsData);
                } catch (e) {
                    console.warn('Could not parse artists JSON string, treating as empty array.', e);
                    artistsData = null;
                }
            }

            albumData.artists = Array.isArray(artistsData)
                ? artistsData.filter(artist => artist.name !== null)
                : [];
            // =====================================

            // Преобразование строковых полей в массивы
            albumData.genres = stringToArray(albumData.genres);
            albumData.label = stringToArray(albumData.label);
            albumData.language = stringToArray(albumData.language);
            albumData.description = stringToArray(albumData.description);

            // Получение треков
            const [tracks] = await connection.execute(
                `SELECT id, track_number, title, duration
                 FROM tracks WHERE album_id = ?
                 ORDER BY track_number`,
                [albumData.id]
            );

            res.json({
                ...albumData,
                tracks: tracks
            });

        } catch (err) {
            console.error('Album fetch error:', err);
            res.status(500).json({
                error: 'Database error',
                message: err.message,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            });
        } finally {
            if (connection) connection.release();
        }
    });

    // Маршрут для добавления нового альбома
    router.post('/', authenticate, async (req, res) => {
        let connection;
        try {
            // artist - это строка, которую мы получаем из add_album.html
            const { title, artist, release_date, cover_url, type, genres, label, language, description, tracks } = req.body;

            // === ИСПРАВЛЕНИЕ 1 (для 400 Bad Request): ПРЕОБРАЗОВАНИЕ СТРОКИ ИСПОЛНИТЕЛЕЙ В МАССИВ ОБЪЕКТОВ ===
            const artistNames = stringToArray(artist);
            const artists = artistNames.map(name => ({ name }));
            // ===============================================================================================

            // Валидация
            if (!title || !artists || artists.length === 0) {
                return res.status(400).json({ error: 'Title and at least one artist are required' });
            }

            // Генерируем слаг, используя название альбома и имя ПЕРВОГО исполнителя
            const artistNameForSlug = artists[0].name;
            const slug = slugify(`${artistNameForSlug}-${title}`, { lower: true, strict: true, locale: 'ru' });

            connection = await pool.getConnection();
            await connection.beginTransaction();

            const safeValue = (val) => (val !== undefined && val !== null ? val : null);

            // ИСПРАВЛЕНИЕ 2: Удален 'artist' из INSERT INTO albums.
            const [albumResult] = await connection.execute(
                `INSERT INTO albums
                 (title, release_date, cover_url, type, genres, label, language, description, slug,
                  likes, wishlist_count, in_lists_count, reviews_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    title, safeValue(release_date), safeValue(cover_url), safeValue(type), safeValue(genres),
                    safeValue(label), safeValue(language), safeValue(description), slug,
                    0, 0, 0, 0
                ]
            );
            // Если вы применили изменения в db.js (language VARCHAR(255)), этот INSERT не вызовет ошибку Data too long.

            const albumId = albumResult.insertId;

            // ЛОГИКА ДЛЯ ИСПОЛНИТЕЛЕЙ (artists - это массив, созданный выше)
            for (const artistItem of artists) {
                const artistSlug = slugify(artistItem.name, { lower: true, strict: true, locale: 'ru' });
                let artistId;

                // 1. Ищем существующего исполнителя
                const [existingArtist] = await connection.execute(
                    'SELECT id FROM artists WHERE slug = ?',
                    [artistSlug]
                );

                if (existingArtist.length > 0) {
                    artistId = existingArtist[0].id;
                } else {
                    // 2. Если исполнитель не найден, создаем его
                    const [newArtistResult] = await connection.execute(
                        'INSERT INTO artists (name, slug) VALUES (?, ?)',
                        [artistItem.name, artistSlug]
                    );
                    artistId = newArtistResult.insertId;
                }

                // 3. Связываем альбом с исполнителем
                await connection.execute(
                    'INSERT INTO album_artists (album_id, artist_id) VALUES (?, ?)',
                    [albumId, artistId]
                );
            }

            // Добавление треков
            if (tracks && tracks.length > 0) {
                // Сортируем треки по номеру, чтобы правильно назначить trackNumber
                tracks.sort((a, b) => (a.number || Infinity) - (b.number || Infinity));
                let trackNumber = 1;
                for (const track of tracks) {
                    await connection.execute(
                        `INSERT INTO tracks (album_id, track_number, title, duration) VALUES (?, ?, ?, ?)`,
                        [albumId, trackNumber, track.title, safeValue(track.duration)]
                    );
                    trackNumber++;
                }
            }

            await connection.commit();
            res.status(201).json({ id: albumId, slug: slug, message: 'Album added successfully' });

        } catch (err) {
            if (connection) await connection.rollback();
            console.error('POST /api/albums error:', err);
            res.status(500).json({
                error: 'Failed to add album',
                message: err.message,
                sql: err.sql // Добавляем SQL ошибку для лучшей диагностики
            });
        } finally {
            if (connection) connection.release();
        }
    });

    // ... (Остальные маршруты GET /genres, /description, /language, DELETE)

    router.get('/genres', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT genres FROM albums WHERE genres IS NOT NULL AND genres != ""');
            const allGenres = new Set();
            rows.forEach(row => {
                stringToArray(row.genres).forEach(genre => {
                    if (genre) { allGenres.add(genre); }
                });
            });
            const sortedGenres = Array.from(allGenres).sort();
            res.json(sortedGenres);
        } catch (err) {
            console.error('GET /api/albums/genres error:', err);
            res.status(500).json({ error: 'Failed to fetch genres' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.get('/description', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT description FROM albums WHERE description IS NOT NULL AND description != ""');
            const allDescription = new Set();
            rows.forEach(row => {
                stringToArray(row.description).forEach(description => {
                    if (description) { allDescription.add(description); }
                });
            });
            const sortedDescriptors = Array.from(allDescription).sort();
            res.json(sortedDescriptors);
        } catch (err) {
            console.error('GET /api/albums/description error:', err);
            res.status(500).json({ error: 'Failed to fetch description' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.get('/language', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT language FROM albums WHERE language IS NOT NULL AND language != ""');
            const allLanguage = new Set();
            rows.forEach(row => {
                stringToArray(row.language).forEach(language => {
                    if (language) { allLanguage.add(language); }
                });
            });
            const sortedLanguage = Array.from(allLanguage).sort();
            res.json(sortedLanguage);
        } catch (err) {
            console.error('GET /api/albums/language error:', err);
            res.status(500).json({ error: 'Failed to fetch language' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.delete('/:id', authenticate, async (req, res) => {
        let connection;
        try {
            const { id } = req.params;

            connection = await pool.getConnection();
            await connection.beginTransaction();

            // Удаляем записи о треках, действиях, рейтингах, рецензиях, связях с артистами
            await connection.execute('DELETE FROM tracks WHERE album_id = ?', [id]);
            await connection.execute('DELETE FROM user_album_actions WHERE album_id = ?', [id]);
            await connection.execute('DELETE FROM ratings WHERE album_id = ?', [id]);
            await connection.execute('DELETE FROM reviews WHERE album_id = ?', [id]);
            await connection.execute('DELETE FROM album_artists WHERE album_id = ?', [id]);

            // Удаляем сам альбом
            const [result] = await connection.execute('DELETE FROM albums WHERE id = ?', [id]);

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Album not found' });
            }

            await connection.commit();
            res.json({ success: true, message: 'Album and all related data deleted successfully' });

        } catch (err) {
            await connection.rollback();
            console.error('DELETE /api/albums/:id error:', err);
            res.status(500).json({ error: 'Failed to delete album' });
        } finally {
            if (connection) connection.release();
        }
    });


    return router;
};