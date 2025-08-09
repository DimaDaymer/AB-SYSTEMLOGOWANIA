const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * Маршрут для получения списка альбомов с фильтрацией и сортировкой.
   * Параметры запроса:
   * - sort: 'rating', 'popularity'
   * - order: 'asc', 'desc'
   * - format: 'LP', 'EP', 'Single' (через запятую)
   * - year: Год выпуска (например, '2024')
   * - yearRange: Диапазон лет (например, '2010-2019')
   * - genres: Жанры (через запятую, например, 'rock,pop')
   */
  router.get('/', async (req, res) => {
    let connection;
    try {
      const { sort, order, format, year, yearRange, genres } = req.query;

      connection = await pool.getConnection();

      // Базовый запрос с LEFT JOIN для подсчета рейтингов и лайков
      let query = `
        SELECT
          a.*,
          AVG(r.score) AS average_rating,
          COUNT(DISTINCT uaa1.id) AS likes
        FROM albums a
               LEFT JOIN ratings r ON a.id = r.album_id
               LEFT JOIN user_album_actions uaa1 ON a.id = uaa1.album_id AND uaa1.action_type = 'like'
      `;

      const whereClauses = [];
      const params = [];
      const groupClauses = ['a.id'];
      let orderByClause = '';

      // Фильтрация по жанрам. Используем INNER JOIN для фильтрации.
      if (genres) {
        const genreNames = genres.split(',').map(g => g.trim());
        if (genreNames.length > 0) {
          query += `
            INNER JOIN album_genres ag ON a.id = ag.album_id
            INNER JOIN genres g ON ag.genre_id = g.id
          `;
          whereClauses.push(`g.name IN (${genreNames.map(() => '?').join(',')})`);
          params.push(...genreNames);
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
        const [startYear, endYear] = yearRange.split('-').map(y => parseInt(y.trim(), 10));
        if (!isNaN(startYear) && !isNaN(endYear)) {
          whereClauses.push('YEAR(a.release_date) BETWEEN ? AND ?');
          params.push(startYear, endYear);
        }
      }

      // Добавляем все условия WHERE
      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      // Группировка
      query += ` GROUP BY ${groupClauses.join(', ')}`;

      // Сортировка
      const orderDirection = order && ['asc', 'desc'].includes(order.toLowerCase()) ? order.toUpperCase() : 'DESC';

      if (sort === 'rating') {
        orderByClause = `ORDER BY average_rating ${orderDirection}, likes DESC, a.release_date DESC`;
      } else if (sort === 'popularity') {
        orderByClause = `ORDER BY likes ${orderDirection}, average_rating DESC, a.release_date DESC`;
      } else {
        orderByClause = `ORDER BY a.release_date DESC`;
      }

      query += ` ${orderByClause}`;

      const [albums] = await connection.execute(query, params);

      // Дополнительная обработка данных для каждого альбома
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

  // Маршрут для получения альбома по ID
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

  // Маршрут для обновления альбома по ID
  router.put('/:id', async (req, res) => {
    let connection;
    try {
      const { id } = req.params;
      const { title, artist, cover_url, type, release_date, genres, label, language, description, tracks } = req.body;

      if (!title || !artist) {
        return res.status(400).json({ error: 'Title and artist are required' });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const safeValue = (val) => (val !== undefined ? val : null);

      await connection.execute(
          `UPDATE albums SET
                           title = ?, artist = ?, cover_url = ?, type = ?, release_date = ?, genres = ?, label = ?, language = ?, description = ?
           WHERE id = ?`,
          [title, artist, safeValue(cover_url), safeValue(type), safeValue(release_date), safeValue(genres), safeValue(label), safeValue(language), safeValue(description), id]
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
      res.json({ message: 'Album updated successfully', id });

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

  // Маршрут для создания альбома
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

      const slug = `${artist}-${title}`
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');

// ... existing code ...
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
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, // Добавлен 14-й заполнитель '?'
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

  // Маршрут для получения альбома по SLUG
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

      // Преобразование строковых полей в массивы
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