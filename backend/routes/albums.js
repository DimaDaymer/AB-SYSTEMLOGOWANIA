const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const [albums] = await db.execute('SELECT * FROM albums');
    res.json(albums);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [album] = await db.execute(
        'SELECT * FROM albums WHERE id = ?',
        [req.params.id]
    );

    if (album.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    res.json(album[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Добавить после GET роутов
router.post('/', async (req, res) => {
  try {
    const { title, artist, release_year, genre, label, language, type } = req.body;

    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }

    const [result] = await db.execute(
        `INSERT INTO albums 
      (title, artist, release_year, genre, label, language, type) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, artist, release_year || null, genre || null,
          label || null, language || null, type || null]
    );

    res.status(201).json({
      id: result.insertId,
      message: 'Album added successfully'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add album' });
  }
});

module.exports = router;