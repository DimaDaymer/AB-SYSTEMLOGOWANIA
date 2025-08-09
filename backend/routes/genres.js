const express = require('express');
const router = express.Router();
const pool = require('../db');

// Получение основных жанров
router.get('/main', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT name, COUNT(ag.album_id) as album_count 
            FROM genres g
            LEFT JOIN album_genres ag ON g.id = ag.genre_id
            WHERE g.category = 'main'
            GROUP BY g.name
            ORDER BY album_count DESC
            `
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch main genres' });
    }
});

// Получение дескрипторов
router.get('/descriptors', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT name, COUNT(ag.album_id) as album_count 
            FROM genres g
            LEFT JOIN album_genres ag ON g.id = ag.genre_id
            WHERE g.category = 'descriptor'
            GROUP BY g.name
            ORDER BY album_count DESC
            `
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch descriptors' });
    }
});

// Получение локаций
router.get('/locations', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT name, COUNT(ag.album_id) as album_count 
            FROM genres g
            LEFT JOIN album_genres ag ON g.id = ag.genre_id
            WHERE g.category = 'location'
            GROUP BY g.name
            ORDER BY album_count DESC
            `
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

// Получение языков
router.get('/languages', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `
            SELECT name, COUNT(ag.album_id) as album_count 
            FROM genres g
            LEFT JOIN album_genres ag ON g.id = ag.genre_id
            WHERE g.category = 'language'
            GROUP BY g.name
            ORDER BY album_count DESC
            `
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch languages' });
    }
});

module.exports = router;