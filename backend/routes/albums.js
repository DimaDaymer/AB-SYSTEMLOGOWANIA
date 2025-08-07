const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  let connection;
  try {
    const { sort, order, format, year, yearRange } = req.query;

    connection = await pool.getConnection();

    let query = `
      SELECT a.*, 
        AVG(r.score) AS rating,
        COUNT(DISTINCT uaa1.id) AS likes,
        COUNT(DISTINCT uaa2.id) AS wishlist_count,
        COUNT(DISTINCT uaa3.id) AS in_lists_count,
        COUNT(DISTINCT r.id) AS reviews_count
      FROM albums a
      LEFT JOIN ratings r ON a.id = r.album_id
      LEFT JOIN user_album_actions uaa1 ON a.id = uaa1.album_id AND uaa1.action_type = 'like'
      LEFT JOIN user_album_actions uaa2 ON a.id = uaa2.album_id AND uaa2.action_type = 'wishlist'
      LEFT JOIN user_album_actions uaa3 ON a.id = uaa3.album_id AND uaa3.action_type = 'add-to-list'
    `;

    const whereClauses = [];
    const params = [];

    if (format) {
      const formats = format.split(',');
      whereClauses.push(`a.type IN (${formats.map(() => '?').join(',')})`);
      params.push(...formats);
    }

    if (year) {
      whereClauses.push('YEAR(a.release_date) = ?');
      params.push(year);
    }

    if (yearRange) {
      const [startYear, endYear] = yearRange.split('-');
      whereClauses.push('YEAR(a.release_date) BETWEEN ? AND ?');
      params.push(startYear, endYear);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` GROUP BY a.id`;

    if (sort === 'rating') {
      query += ` ORDER BY rating ${order === 'desc' ? 'DESC' : 'ASC'}`;
    } else if (sort === 'popularity') {
      query += ` ORDER BY likes ${order === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      query += ' ORDER BY a.release_date DESC';
    }

    const [albums] = await connection.execute(query, params);

    for (let album of albums) {
      const [tracks] = await connection.execute(
          'SELECT track_number, title, duration FROM tracks WHERE album_id = ? ORDER BY track_number',
          [album.id]
      );
      album.tracks = tracks;

      album.rating = album.rating ? parseFloat(album.rating) : 0;
      album.likes = album.likes || 0;
      album.wishlist_count = album.wishlist_count || 0;
      album.in_lists_count = album.in_lists_count || 0;
      album.reviews_count = album.reviews_count || 0;
    }

    res.json(albums);
  } catch (err) {
    console.error('GET /api/albums error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

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

router.post('/', async (req, res) => {
  let connection;
  try {
    const { title, artist, release_date, cover_url, type, genres, label, language, tracks } = req.body;

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

    const albumParams = [
      title,
      artist,
      safeValue(release_date),
      safeValue(cover_url),
      safeValue(type),
      safeValue(genres),
      safeValue(label),
      safeValue(language),
      slug,
      generateRandom(100, 10000),   // likes
      generateRandom(50, 5000),     // wishlist_count
      generateRandom(30, 3000),     // in_lists_count
      generateRandom(20, 2000)      // reviews_count
    ];

    // Insert album
    const [albumResult] = await connection.execute(
        `INSERT INTO albums
         (title, artist, release_date, cover_url, type, genres, label, language, slug,
          likes, wishlist_count, in_lists_count, reviews_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    albumData.genres = typeof albumData.genres === 'string' ?
        albumData.genres.split(',').map(g => g.trim()) :
        (albumData.genres || []);

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

module.exports = router;