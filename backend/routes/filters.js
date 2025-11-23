const express = require('express');
const router = express.Router();

module.exports = (pool) => {

    // === ИЗМЕНЕНО: РАЗДЕЛЕНИЕ ФОРМАТОВ И АТРИБУТОВ ===
    router.get('/formats', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();

            // 1. Форматы (Album, EP, Single...)
            const [formatsRows] = await connection.execute('SELECT name FROM release_formats ORDER BY name');

            // 2. Атрибуты (Live, Demo, Soundtrack...)
            const [attrRows] = await connection.execute('SELECT name FROM release_attributes ORDER BY name');

            // Возвращаем объект с двумя массивами
            res.json({
                formats: formatsRows.map(r => r.name),
                attributes: attrRows.map(r => r.name)
            });

        } catch (error) {
            console.error('Error fetching formats:', error);
            res.status(500).json({ error: 'Failed to fetch formats' });
        } finally {
            if (connection) connection.release();
        }
    });


    // NEW: API endpoint to get the count of genres
    router.get('/genres-count', async (req, res) => {
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

            res.json({ count: allGenres.size });
        } catch (error) {
            console.error('Error fetching genres count:', error);
            res.status(500).json({ error: 'Failed to fetch genres count' });
        } finally {
            if (connection) connection.release();
        }
    });

    // НОВЫЙ МАРШРУТ: для получения всех уникальных дескрипторов
    router.get('/all-description', async (req, res) => {
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

            const sortedDescription = Array.from(allDescription).sort((a, b) => a.localeCompare(b));
            res.json(sortedDescription);
        } catch (error) {
            console.error('Error fetching all descriptors:', error);
            res.status(500).json({ error: 'Failed to fetch descriptors' });
        } finally {
            if (connection) connection.release();
        }
    });

    // НОВЫЙ МАРШРУТ: для получения количества дескрипторов
    router.get('/description-count', async (req, res) => {
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

            res.json({ count: allDescription.size });
        } catch (error) {
            console.error('Error fetching descriptors count:', error);
            res.status(500).json({ error: 'Failed to fetch descriptors count' });
        } finally {
            if (connection) connection.release();
        }
    });

    router.get('/all-language', async (req, res) => {
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

            const sortedLanguage = Array.from(allLanguage).sort((a, b) => a.localeCompare(b));
            res.json(sortedLanguage);
        } catch (error) {
            console.error('Error fetching all language:', error);
            res.status(500).json({ error: 'Failed to fetch language' });
        } finally {
            if (connection) connection.release();
        }
    });

    // NEW: API endpoint to get the count of genres
    router.get('/language-count', async (req, res) => {
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

            res.json({ count: allLanguage.size });
        } catch (error) {
            console.error('Error fetching language count:', error);
            res.status(500).json({ error: 'Failed to fetch language count' });
        } finally {
            if (connection) connection.release();
        }
    });
    router.get('/all-genres', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT genres FROM albums WHERE genres IS NOT NULL AND genres != ""');
            const allGenres = new Set();
            rows.forEach(row => {
                row.genres.split(',').forEach(g => {
                    const t = g.trim();
                    if(t) allGenres.add(t);
                });
            });
            const sorted = Array.from(allGenres).sort();
            res.json(sorted);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch genres' });
        } finally {
            if(connection) connection.release();
        }
    });

    return router;
};