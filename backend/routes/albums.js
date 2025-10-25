const express = require('express');
const router = express.Router();
const slugify = require('slugify'); // Импортируем библиотеку slugify

module.exports = (pool) => {
  /**
   * Маршрут для получения списка альбомов с фильтрацией и сортировкой.
   * Параметры запроса:
   * - sort: 'rating', 'popularity', 'release_date'
   * - order: 'asc', 'desc'
   * - format: 'LP', 'EP', 'Single' (через запятую)
   * - year: Год выпуска (например, '2024')
   * - yearRange: Диапазон лет (например, '2010-2019')
   * - genres: Жанры (через запятую, например, 'rock,pop')
   * - search: Поиск по названию или исполнителю
   */
  router.get('/', async (req, res) => {
    let connection;
    try {
      const { sort, order, format, year, yearRange, genres, description, language, search } = req.query;

      connection = await pool.getConnection();

      let query = `
                SELECT
                    a.*,
                    AVG(r.score) AS average_rating,
                    COUNT(DISTINCT uaa1.id) AS likes,
                    (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'wishlist') AS wishlist_count,
                    (SELECT COUNT(id) FROM user_album_actions WHERE album_id = a.id AND action_type = 'add-to-list') AS in_lists_count,
                    (SELECT COUNT(id) FROM reviews WHERE album_id = a.id) AS reviews_count
                FROM albums a
                LEFT JOIN ratings r ON a.id = r.album_id
                LEFT JOIN user_album_actions uaa1 ON a.id = uaa1.album_id AND uaa1.action_type = 'like'
            `;

      const whereClauses = [];
      const params = [];
      const groupClauses = ['a.id'];

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

      // Фильтрация по описанию (исправлено)
      if (description) {
        const descriptionArray = description.split(',').map(d => d.trim());
        if (descriptionArray.length > 0) {
          const findInSetConditions = descriptionArray.map(d => `FIND_IN_SET(?, REPLACE(TRIM(a.description), ' ', ''))`).join(' OR ');
          whereClauses.push(`(${findInSetConditions})`);
          const cleanedDescriptionArray = descriptionArray.map(d => d.replace(/ /g, ''));
          params.push(...cleanedDescriptionArray);
        }
      }

      // Фильтрация по языку (исправлено)
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

      // Поиск по названию или исполнителю
      if (search) {
        whereClauses.push('(a.title LIKE ? OR a.artist LIKE ?)');
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
      } else {
        orderByClause = `ORDER BY a.release_date ${orderDirection}`;
      }

      query += ` ${orderByClause}`;

      // Логирование для отладки
      console.log('Final SQL Query:', query);
      console.log('Query Parameters:', params);

      const [albums] = await connection.execute(query, params);

      const finalAlbums = albums.map(album => ({
        ...album,
        rating: album.average_rating ? parseFloat(album.average_rating) : 0,
        likes: album.likes || 0,
      }));

      res.json(finalAlbums);
    } catch (err) {
      console.error('GET /api/albums error:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });

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

  // НОВЫЙ МАРШРУТ: Получение всех уникальных дескрипторов
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

  // Остальные маршруты (без изменений)
  router.get('/:id', async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();
      const [album] = await connection.execute(
          'SELECT * FROM albums WHERE id = ?',
          [req.params.id]
      );

      if (album.length === 0) {
        return res.status(404).json({ error: 'Album not found' });
      }

      const [tracks] = await connection.execute(
          'SELECT * FROM tracks WHERE album_id = ? ORDER BY track_number',
          [req.params.id]
      );

      album[0].tracks = tracks;
      res.json(album[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  });

  router.put('/:id', async (req, res) => {
    let connection;
    try {
      const { id } = req.params;
      const { title, artist, cover_url, type, release_date, genres, label, language, description, tracks } = req.body;

      if (!title || !artist) {
        return res.status(400).json({ error: 'Title and artist are required' });
      }

      // Генерируем новый слаг на основе обновленных данных
      const slug = slugify(`${artist}-${title}`, {
        lower: true,
        strict: true,
        locale: 'ru'
      });

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const safeValue = (val) => (val !== undefined ? val : null);

      await connection.execute(
          `UPDATE albums SET
                           title = ?, artist = ?, cover_url = ?, type = ?, release_date = ?, genres = ?, label = ?, language = ?, description = ?, slug = ?
           WHERE id = ?`,
          [title, artist, safeValue(cover_url), safeValue(type), safeValue(release_date), safeValue(genres), safeValue(label), safeValue(language), safeValue(description), slug, id]
      );

      await connection.execute('DELETE FROM tracks WHERE album_id = ?', [id]);

      if (tracks && tracks.length > 0) {
        let trackNumber = 1;
        for (const track of tracks) {
          await connection.execute(
              `INSERT INTO tracks (album_id, track_number, title, duration)
               VALUES (?, ?, ?, ?)`,
              [id, trackNumber, track.title, track.duration]
          );
          trackNumber++;
        }
      }

      await connection.commit();
      // Возвращаем новый слаг в ответе
      res.json({ message: 'Album updated successfully', id, slug });

    } catch (err) {
      if (connection) {
        await connection.rollback();
      }
      console.error('PUT /api/albums/:id error:', err);
      res.status(500).json({ error: 'Failed to update album' });
    } finally {
      if (connection) connection.release();
    }
  });

  router.post('/', async (req, res) => {
    let connection;
    try {
      const { title, artist, release_date, cover_url, type, genres, label, language, description, tracks } = req.body;

      if (!title || !artist) {
        return res.status(400).json({ error: 'Title and artist are required' });
      }

      const safeValue = (val) => (val !== undefined ? val : null);
      const generateRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Используем slugify для генерации слага
      const slug = slugify(`${artist}-${title}`, {
        lower: true,
        strict: true,
        locale: 'ru'
      });

      const albumParams = [
        title,
        artist,
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
        generateRandom(20, 2000) // reviews_count
      ];

      const [albumResult] = await connection.execute(
          `INSERT INTO albums
           (title, artist, release_date, cover_url, type, genres, label, language, description, slug,
            likes, wishlist_count, in_lists_count, reviews_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          albumParams
      );

      const albumId = albumResult.insertId;

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
        errorMessage = 'Album with this title and artist already exists';
      } else if (err.message.includes('track number')) {
        errorMessage = 'Invalid track number format';
      }

      res.status(500).json({ error: errorMessage });
    } finally {
      if (connection) connection.release();
    }
  });

  router.get('/by-slug/:slug', async (req, res) => {
    let connection;
    try {
      const slug = req.params.slug;
      console.log(`Fetching album by slug: ${slug}`);

      connection = await pool.getConnection();
      const [albums] = await connection.execute(
          'SELECT * FROM albums WHERE slug = ?',
          [slug]
      );

      if (albums.length === 0) {
        console.log(`Album not found for slug: ${slug}`);
        return res.status(404).json({ error: 'Album not found' });
      }

      const albumData = albums[0];
      console.log(`Album found: ${albumData.title} by ${albumData.artist}`);

      const stringToArray = (str) => (typeof str === 'string' ? str.split(',').map(s => s.trim()) : (str || []));

      albumData.artist = stringToArray(albumData.artist);
      albumData.type = stringToArray(albumData.type);
      albumData.genres = stringToArray(albumData.genres);
      albumData.label = stringToArray(albumData.label);
      albumData.language = stringToArray(albumData.language);
      albumData.description = stringToArray(albumData.description);


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

  return router;
};