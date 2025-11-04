const express = require('express');
const router = express.Router();
const slugify = require('slugify');

// *** ДОБАВЛЕННЫЙ КОД: Константы и утилита для валидации и консистентности ***
const VALID_SORTS = ['rating', 'popularity', 'release_date', 'title', 'artist'];
const VALID_ORDERS = ['asc', 'desc'];

// Утилита для преобразования строки в массив. Используется для полей albums
const stringToArray = (str) => (typeof str === 'string' ? str.split(',').map(s => s.trim()).filter(Boolean) : (str || []));

/**
 * Функция для поиска или создания исполнителя.
 * Использует транзакцию из основного запроса.
 * @param {object} connection - Активное соединение с базой данных (внутри транзакции)
 * @param {string} artistName - Имя исполнителя
 * @returns {Promise<number>} ID исполнителя
 */
async function findOrCreateArtist(connection, artistName) {
    const artistSlug = slugify(artistName, { lower: true, strict: true, locale: 'ru' });

    // Поиск существующего исполнителя по имени
    const [existingArtist] = await connection.execute('SELECT id FROM artists WHERE name = ?', [artistName]);

    if (existingArtist.length > 0) {
        return existingArtist[0].id;
    } else {
        // Создание нового исполнителя
        try {
            const [newArtistResult] = await connection.execute(
                'INSERT INTO artists (name, slug) VALUES (?, ?)',
                [artistName, artistSlug]
            );
            return newArtistResult.insertId;
        } catch (error) {
            // Обработка возможной коллизии слага (крайне редко)
            if (error.code === 'ER_DUP_ENTRY') {
                console.warn(`Artist slug collision for ${artistName}. Retrying search.`);
                const [existingArtistAfterCollision] = await connection.execute('SELECT id FROM artists WHERE name = ?', [artistName]);
                if (existingArtistAfterCollision.length > 0) {
                    return existingArtistAfterCollision[0].id;
                }
            }
            throw error;
        }
    }
}
// *** КОНЕЦ ДОБАВЛЕННОГО КОДА ***

module.exports = (pool) => {
    /**
     * Маршрут для получения списка альбомов с фильтрацией и сортировкой.
     */
    router.get('/', async (req, res) => {
        let connection;
        try {
            const { sort, order, format, year, yearRange, genres, description, language, search } = req.query;

            // Валидация sort и order
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
                    GROUP_CONCAT(DISTINCT art.name ORDER BY aa.is_main DESC) AS artists_list,
                    AVG(r.score) AS average_rating,
                    COUNT(DISTINCT uaa1.id) AS likes
                -- Статистические счетчики, которые уже есть в таблице albums
                -- (a.likes, a.wishlist_count, a.in_lists_count, a.reviews_count)
                FROM albums a
                         JOIN album_artists aa ON a.id = aa.album_id
                         JOIN artists art ON aa.artist_id = art.id
                         LEFT JOIN ratings r ON a.id = r.album_id
                         LEFT JOIN user_album_actions uaa1 ON a.id = uaa1.album_id AND uaa1.action_type = 'like'
            `;

            const whereClauses = [];
            const params = [];
            const groupClauses = ['a.id'];

            // Фильтрация по жанрам, описанию, языку, формату, году, диапазону и поиску
            // (Логика фильтрации остается прежней, но обратите внимание,
            // что поле 'genres' в albums должно быть заполнено для фильтрации)

            // ... (Вся логика WHERE clauses, как в предыдущем файле) ...

            // Фильтрация по жанрам
            if (genres) {
                const genreArray = genres.split(',').map(g => g.trim());
                if (genreArray.length > 0) {
                    const findInSetConditions = genreArray.map(genre => `FIND_IN_SET(?, REPLACE(TRIM(a.genres), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${findInSetConditions})`);
                    const cleanedGenreArray = genreArray.map(g => g.replace(/ /g, ''));
                    params.push(...cleanedGenreArray);
                }
            }

            // Фильтрация по описанию
            if (description) {
                const descriptionArray = description.split(',').map(d => d.trim());
                if (descriptionArray.length > 0) {
                    const findInSetConditions = descriptionArray.map(d => `FIND_IN_SET(?, REPLACE(TRIM(a.description), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${findInSetConditions})`);
                    const cleanedDescriptionArray = descriptionArray.map(d => d.replace(/ /g, ''));
                    params.push(...cleanedDescriptionArray);
                }
            }

            // Фильтрация по языку
            if (language) {
                const languageArray = language.split(',').map(l => l.trim());
                if (languageArray.length > 0) {
                    const findInSetConditions = languageArray.map(l => `FIND_IN_SET(?, REPLACE(TRIM(a.language), ' ', ''))`).join(' OR ');
                    whereClauses.push(`(${findInSetConditions})`);
                    const cleanedLanguageArray = languageArray.map(l => l.replace(/ /g, ''));
                    params.push(...cleanedLanguageArray);
                }
            }

            // Фильтрация по формату
            if (format) {
                const formats = format.split(',').map(f => f.trim());
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

            // Поиск по названию или исполнителю (ищет как в альбоме, так и в таблице artists)
            if (search) {
                whereClauses.push('(a.title LIKE ? OR art.name LIKE ?)');
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
                orderByClause = `ORDER BY average_rating ${orderDirection}, a.popularity DESC, a.release_date DESC`;
            } else if (sort === 'popularity') {
                orderByClause = `ORDER BY a.popularity ${orderDirection}, average_rating DESC, a.release_date DESC`;
            } else if (sort === 'artist') {
                orderByClause = `ORDER BY artists_list ${orderDirection}`;
            } else { // release_date, title
                orderByClause = `ORDER BY a.${sort || 'release_date'} ${orderDirection}`;
            }

            query += ` ${orderByClause}`;

            // Логирование для отладки
            // console.log('Final SQL Query:', query);
            // console.log('Query Parameters:', params);

            const [albums] = await connection.execute(query, params);

            const finalAlbums = albums.map(album => ({
                ...album,
                // Преобразуем строку исполнителей в массив для консистентности
                artist: stringToArray(album.artists_list),
                rating: album.average_rating ? parseFloat(album.average_rating) : 0,
                // Используем поле 'likes' из таблицы albums для большей производительности
                likes: album.likes || album.likes_count || 0,
                // Удаляем временное поле, чтобы не сбивать с толку
                artists_list: undefined
            }));

            res.json(finalAlbums);
        } catch (err) {
            console.error('GET /api/albums error:', err);
            res.status(500).json({ error: 'Database error', details: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    // ... (Маршруты для /genres, /description, /language остаются без изменений) ...

    // НОВЫЙ МАРШРУТ: Получение всех уникальных жанров
    router.get('/genres', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT genres FROM albums WHERE genres IS NOT NULL AND genres != ""');

            const allGenres = new Set();
            rows.forEach(row => {
                row.genres.split(',').forEach(genre => {
                    const trimmedGenre = genre.trim();
                    if (trimmedGenre) {
                        allGenres.add(trimmedGenre);
                    }
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

    // НОВЫЙ МАРШРУТ: Получение всех уникальных дескрипторов
    router.get('/description', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT description FROM albums WHERE description IS NOT NULL AND description != ""');

            const allDescription = new Set();
            rows.forEach(row => {
                row.description.split(',').forEach(description => {
                    const trimmedDescription = description.trim();
                    if (trimmedDescription) {
                        allDescription.add(trimmedDescription);
                    }
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

    // НОВЫЙ МАРШРУТ: Получение всех уникальных языков
    router.get('/language', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT language FROM albums WHERE language IS NOT NULL AND language != ""');

            const allLanguage = new Set();
            rows.forEach(row => {
                row.language.split(',').forEach(language => {
                    const trimmedLanguage = language.trim();
                    if (trimmedLanguage) {
                        allLanguage.add(trimmedLanguage);
                    }
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


    // Вспомогательная функция для получения данных альбома по ID или SLUG
    const getAlbumData = async (connection, albumIdentifier, isSlug = false) => {
        const query = `
            SELECT
                a.*,
                GROUP_CONCAT(art.name ORDER BY aa.is_main DESC) AS artists_list
            FROM albums a
            JOIN album_artists aa ON a.id = aa.album_id
            JOIN artists art ON aa.artist_id = art.id
            WHERE a.${isSlug ? 'slug' : 'id'} = ?
            GROUP BY a.id;
        `;

        const [albums] = await connection.execute(query, [albumIdentifier]);

        if (albums.length === 0) {
            return null;
        }

        const albumData = albums[0];

        // Преобразование полей в массивы
        albumData.artist = stringToArray(albumData.artists_list); // Теперь artist берется из artists_list
        albumData.type = stringToArray(albumData.type);
        albumData.genres = stringToArray(albumData.genres);
        albumData.label = stringToArray(albumData.label);
        albumData.language = stringToArray(albumData.language);
        albumData.description = stringToArray(albumData.description);
        albumData.artists_list = undefined; // Удаляем промежуточное поле

        const [tracks] = await connection.execute(
            'SELECT * FROM tracks WHERE album_id = ? ORDER BY track_number',
            [albumData.id]
        );

        return {
            ...albumData,
            tracks: tracks
        };
    };

    /**
     * Маршрут для получения альбома по ID
     */
    router.get('/:id', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const album = await getAlbumData(connection, req.params.id, false);

            if (!album) {
                return res.status(404).json({ error: 'Album not found' });
            }

            res.json(album);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Database error' });
        } finally {
            if (connection) connection.release();
        }
    });

    /**
     * Маршрут для получения альбома по SLUG
     */
    router.get('/by-slug/:slug', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const album = await getAlbumData(connection, req.params.slug, true);

            if (!album) {
                return res.status(404).json({ error: 'Album not found' });
            }

            res.json(album);
        } catch (err) {
            console.error('Album fetch error:', err);
            res.status(500).json({
                error: 'Database error',
                message: err.message
            });
        } finally {
            if (connection) connection.release();
        }
    });


    /**
     * Маршрут для обновления альбома по ID (изменен для работы с artists)
     */
    router.put('/:id', async (req, res) => {
        let connection;
        try {
            const { id } = req.params;
            // !!! ВНИМАНИЕ: artist теперь ожидается как строка через запятую
            const { title, artist, cover_url, type, release_date, genres, label, language, description, tracks } = req.body;

            if (!title || !artist) {
                return res.status(400).json({ error: 'Title and artist are required' });
            }

            const artistsInput = stringToArray(artist);
            if (artistsInput.length === 0) {
                return res.status(400).json({ error: 'Artist list cannot be empty' });
            }

            const slug = slugify(`${artistsInput[0]}-${title}`, { // Используем первого исполнителя для слага
                lower: true,
                strict: true,
                locale: 'ru'
            });

            connection = await pool.getConnection();
            await connection.beginTransaction();

            const safeValue = (val) => (val !== undefined ? val : null);

            // 1. Обновление таблицы albums (удаляем artist)
            await connection.execute(
                `UPDATE albums SET
                                   title = ?, cover_url = ?, type = ?, release_date = ?, genres = ?, label = ?, language = ?, description = ?, slug = ?
                 WHERE id = ?`,
                [title, safeValue(cover_url), safeValue(type), safeValue(release_date), safeValue(genres), safeValue(label), safeValue(language), safeValue(description), slug, id]
            );

            // 2. Обновление исполнителей (artists и album_artists)
            await connection.execute('DELETE FROM album_artists WHERE album_id = ?', [id]);
            const artistIds = [];
            for (let i = 0; i < artistsInput.length; i++) {
                const artistId = await findOrCreateArtist(connection, artistsInput[i]);
                const isMain = i === 0; // Первый исполнитель считается основным
                await connection.execute(
                    'INSERT INTO album_artists (album_id, artist_id, is_main) VALUES (?, ?, ?)',
                    [id, artistId, isMain]
                );
                artistIds.push(artistId);
            }


            // 3. Обновление треков
            await connection.execute('DELETE FROM tracks WHERE album_id = ?', [id]);
            if (tracks && tracks.length > 0) {
                for (const track of tracks) {
                    const trackNumber = parseInt(track.number || track.track_number); // Поддержка обоих форматов
                    if (isNaN(trackNumber)) {
                        throw new Error('Invalid track number');
                    }
                    await connection.execute(
                        `INSERT INTO tracks (album_id, track_number, title, duration)
                         VALUES (?, ?, ?, ?)`,
                        [id, trackNumber, track.title, track.duration]
                    );
                }
            }

            await connection.commit();
            res.json({ message: 'Album updated successfully', id, slug });

        } catch (err) {
            if (connection) {
                await connection.rollback();
            }
            console.error('PUT /api/albums/:id error:', err);
            res.status(500).json({ error: 'Failed to update album', details: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    /**
     * Маршрут для создания нового альбома (изменен для работы с artists)
     */
    router.post('/', async (req, res) => {
        let connection;
        try {
            // !!! ВНИМАНИЕ: artist теперь ожидается как строка через запятую
            const { title, artist, release_date, cover_url, type, genres, label, language, description, tracks } = req.body;

            if (!title || !artist) {
                return res.status(400).json({ error: 'Title and artist are required' });
            }

            const artistsInput = stringToArray(artist);
            if (artistsInput.length === 0) {
                return res.status(400).json({ error: 'Artist list cannot be empty' });
            }

            const safeValue = (val) => (val !== undefined ? val : null);
            const generateRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 1. Создание/поиск исполнителей
            const artistIds = [];
            for (const artistName of artistsInput) {
                const artistId = await findOrCreateArtist(connection, artistName);
                artistIds.push(artistId);
            }

            // Используем первого исполнителя для генерации слага
            const slug = slugify(`${artistsInput[0]}-${title}`, {
                lower: true,
                strict: true,
                locale: 'ru'
            });

            // 2. Вставка в таблицу albums (без поля artist)
            const albumParams = [
                title,
                safeValue(release_date),
                safeValue(cover_url),
                safeValue(type),
                safeValue(genres),
                safeValue(label),
                safeValue(language),
                safeValue(description),
                slug,
                generateRandom(100, 10000), // likes
                generateRandom(50, 5000), // wishlist_count
                generateRandom(30, 3000), // in_lists_count
                generateRandom(20, 2000), // reviews_count
                generateRandom(1000, 50000) // popularity
            ];

            const [albumResult] = await connection.execute(
                `INSERT INTO albums
                 (title, release_date, cover_url, type, genres, label, language, description, slug,
                  likes, wishlist_count, in_lists_count, reviews_count, popularity)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                albumParams
            );

            const albumId = albumResult.insertId;

            // 3. Заполнение промежуточной таблицы album_artists
            for (let i = 0; i < artistIds.length; i++) {
                const isMain = i === 0;
                await connection.execute(
                    'INSERT INTO album_artists (album_id, artist_id, is_main) VALUES (?, ?, ?)',
                    [albumId, artistIds[i], isMain]
                );
            }

            // 4. Вставка треков
            if (tracks && tracks.length > 0) {
                for (const track of tracks) {
                    const trackNumber = parseInt(track.number);
                    if (isNaN(trackNumber)) {
                        throw new Error('Invalid track number');
                    }

                    await connection.execute(
                        `INSERT INTO tracks (album_id, track_number, title, duration)
                         VALUES (?, ?, ?, ?)`,
                        [albumId, trackNumber, track.title, safeValue(track.duration)]
                    );
                }
            }

            await connection.commit();
            res.status(201).json({
                id: albumId,
                slug: slug,
                message: 'Album added successfully'
            });
        } catch (err) {
            if (connection) {
                await connection.rollback();
            }
            console.error('POST /api/albums error:', err);

            let errorMessage = 'Failed to add album';
            if (err.message.includes('Duplicate entry')) {
                errorMessage = 'Album with this title and artist combination already exists (check slug collision)';
            } else if (err.message.includes('track number')) {
                errorMessage = 'Invalid track number format';
            }

            res.status(500).json({ error: errorMessage, details: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};