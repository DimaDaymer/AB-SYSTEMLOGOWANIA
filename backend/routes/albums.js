//backend/routes/albums.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET all albums with their tracks
router.get('/', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [albums] = await connection.execute('SELECT * FROM albums ORDER BY release_date DESC');

    for (let album of albums) {
      const [tracks] = await connection.execute('SELECT track_number, title, duration FROM tracks WHERE album_id = ? ORDER BY track_number', [album.id]);
      album.tracks = tracks;
    }

    res.json(albums);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// backend/routes/albums1.js
// GET album by ID with tracks
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

// POST new album with tracks
// ... предыдущий код ...

// POST new album with tracks
// POST new album with tracks
router.post('/', async (req, res) => {
  let connection;
  try {
    const { title, artist, release_date, cover_url, type, genres, label, language, tracks } = req.body;

    // Проверка обязательных полей
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }

    // Преобразование undefined в null
    const safeValue = (val) => (val !== undefined ? val : null);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Генерация slug
    const slug = `${artist}-${title}`
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    // Параметры для запроса
    const albumParams = [
      title,
      artist,
      safeValue(release_date),
      safeValue(cover_url),
      safeValue(type),
      safeValue(genres),
      safeValue(label),
      safeValue(language),
      slug
    ];

    // Insert album
    const [albumResult] = await connection.execute(
        `INSERT INTO albums 
      (title, artist, release_date, cover_url, type, genres, label, language, slug) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        albumParams
    );

    const albumId = albumResult.insertId;

    // Insert tracks
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
// GET album by slug
// GET album by slug
router.get('/by-slug/:slug', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    // Убрана проверка токена - она не нужна для просмотра альбома
    const [albums] = await connection.execute(
        'SELECT * FROM albums WHERE slug = ?',
        [req.params.slug]
    );

    if (albums.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Преобразование жанров
    if (albums[0].genres && typeof albums[0].genres === 'string') {
      albums[0].genres = albums[0].genres.split(',').map(genre => genre.trim());
    } else {
      albums[0].genres = albums[0].genres || [];
    }

    // Получение треков
    const [tracks] = await connection.execute(
        'SELECT * FROM tracks WHERE album_id = ? ORDER BY track_number',
        [albums[0].id]
    );

    albums[0].tracks = tracks;
    res.json(albums[0]);
  } catch (err) {
    console.error('Error in /by-slug:', err);
    // Убрана лишняя отправка ответа (была попытка отправить 2 ответа)
    res.status(500).json({ error: 'Database error', details: err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;


