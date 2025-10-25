const express = require('express');
const router = express.Router();

module.exports = (pool) => {


    router.get('/formats', async (req, res) => {
        try {
            const [rows] = await pool.execute('SELECT DISTINCT type FROM albums WHERE type IS NOT NULL');
            const formats = rows.map(row => row.type);
            res.json(formats);
        } catch (error) {
            console.error('Error fetching formats:', error);
            res.status(500).json({ error: 'Failed to fetch formats' });
        }
    });

    router.get('/all-genres', async (req, res) => {
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

            const sortedGenres = Array.from(allGenres).sort((a, b) => a.localeCompare(b));
            res.json(sortedGenres);
        } catch (error) {
            console.error('Error fetching all genres:', error);
            res.status(500).json({ error: 'Failed to fetch genres' });
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

    // ОБНОВЛЕННЫЙ МАРШРУТ: для получения отфильтрованных альбомов
    router.get('/new-releases', async (req, res) => {
        let connection;
        try {
            connection = await pool.getConnection();
            const { sort = 'release_date', order = 'desc', format, genres, description, language, year, yearRange, search } = req.query;

            let query = 'SELECT * FROM albums WHERE 1=1';
            const params = [];

            if (search) {
                query += ` AND (title LIKE ? OR artist LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            if (format) {
                const formatsArray = format.split(',');
                const placeholders = formatsArray.map(() => '?').join(',');
                query += ` AND type IN (${placeholders})`;
                params.push(...formatsArray);
            }

            // ОБРАБОТКА ЖАНРОВ: Использование FIND_IN_SET
            if (genres) {
                const genresArray = genres.split(',').map(g => g.trim());
                if (genresArray.length > 0) {
                    const findInSetConditions = genresArray.map(genre => `FIND_IN_SET(?, genres)`).join(' OR ');
                    query += ` AND (${findInSetConditions})`;
                    params.push(...genresArray);
                }
            }

            // ОБРАБОТКА description: Использование FIND_IN_SET
            if (description) {
                const descriptionArray = description.split(',').map(g => g.trim());
                if (descriptionArray.length > 0) {
                    const findInSetConditions = descriptionArray.map(genre => `FIND_IN_SET(?, description)`).join(' OR ');
                    query += ` AND (${findInSetConditions})`;
                    params.push(...descriptionArray);
                }
            }

            // ОБРАБОТКА language: Использование FIND_IN_SET
            if (language) {
                const languageArray = language.split(',').map(g => g.trim());
                if (languageArray.length > 0) {
                    const findInSetConditions = languageArray.map(genre => `FIND_IN_SET(?, language)`).join(' OR ');
                    query += ` AND (${findInSetConditions})`;
                    params.push(...languageArray);
                }
            }

            if (year) {
                query += ` AND YEAR(release_date) = ?`;
                params.push(year);
            } else if (yearRange) {
                const [start, end] = yearRange.split('-').map(Number);
                query += ` AND YEAR(release_date) BETWEEN ? AND ?`;
                params.push(start, end);
            }

            query += ` ORDER BY ${pool.escapeId(sort)} ${order.toUpperCase()}`;

            const [rows] = await connection.execute(query, params);
            res.json(rows);
        } catch (error) {
            console.error('Error fetching new releases:', error);
            res.status(500).json({ error: 'Failed to fetch new releases' });
        } finally {
            if (connection) connection.release();
        }
    });
    return router;
};