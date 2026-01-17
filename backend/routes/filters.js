const express = require('express');
const router = express.Router();

const CACHE = {
    formats: { data: null, timestamp: 0 },
    attributes_cache: { data: null, timestamp: 0},
    genres: { data: null, timestamp: 0 },
    languages: { data: null, timestamp: 0 },
    descriptors: { data: null, timestamp: 0 },
    location: { data: null, timestamp: 0 }
};
const CACHE_TTL = 10 * 60 * 1000;

module.exports = (pool) => {
    const getFromTable = async (tableName, cacheKey) => {
        const now = Date.now();
        const cacheEntry = CACHE[cacheKey];

        if (cacheEntry && cacheEntry.data && (now - cacheEntry.timestamp < CACHE_TTL)) {
            return cacheEntry.data;
        }

        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute(`SELECT name FROM ${tableName} ORDER BY name ASC`);
            const list = rows.map(r => r.name || r.Name);

            CACHE[cacheKey] = { data: list, timestamp: now };
            return list;
        } catch (error) {
            console.error(`Błąd podczas pobierania z tabeli ${tableName}:`, error);
            throw error;
        } finally {
            if (connection) connection.release();
        }
    };

    router.get('/formats', async (req, res) => {
        try {
            const formats = await getFromTable('release_formats', 'formats');
            const attributes = await getFromTable('release_attributes', 'attributes_cache');
            res.json({ formats, attributes });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Nie udało się pobrać formatów' });
        }
    });

    router.get('/all-genres', async (req, res) => {
        try { res.json(await getFromTable('genres', 'genres')); }
        catch (e) { res.status(500).json({ error: 'Błąd' }); }
    });

    router.get('/genres-count', async (req, res) => {
        try {
            const genres = await getFromTable('genres', 'genres');
            res.json({ count: genres.length });
        } catch (e) { res.status(500).json({ error: 'Błąd' }); }
    });

    router.get('/all-language', async (req, res) => {
        try { res.json(await getFromTable('languages', 'languages')); }
        catch (e) { res.status(500).json({ error: 'Błąd' }); }
    });

    router.get('/language-count', async (req, res) => {
        try {
            const data = await getFromTable('languages', 'languages');
            res.json({ count: data.length });
        } catch (e) { res.status(500).json({ error: 'Błąd' }); }
    });

    router.get('/all-description', async (req, res) => {
        try { res.json(await getFromTable('descriptors', 'descriptors')); }
        catch (e) { res.status(500).json({ error: 'Błąd' }); }
    });

    router.get('/description-count', async (req, res) => {
        try {
            const data = await getFromTable('descriptors', 'descriptors');
            res.json({ count: data.length });
        } catch (e) { res.status(500).json({ error: 'Błąd' }); }
    });

    router.get('/all-location', async (req, res) => {
        try { res.json(await getFromTable('locations', 'location')); }
        catch (e) { res.status(500).json({ error: 'Nie udało się pobrać lokalizacji' }); }
    });

    router.get('/location-count', async (req, res) => {
        try {
            const data = await getFromTable('locations', 'location');
            res.json({ count: data.length });
        } catch (e) { res.status(500).json({ error: 'Błąd' }); }
    });

    router.get('/autocomplete', async (req, res) => {
        const query = req.query.q;
        if (!query || query.length < 2) return res.json([]);

        let connection;
        try {
            connection = await pool.getConnection();
            const sql = `
                SELECT value, type FROM (
                                            SELECT name as value, 'genre' as type,
                                                   CASE WHEN name = ? THEN 1 WHEN name LIKE CONCAT(?, '%') THEN 2 ELSE 3 END as relevance
                                            FROM genres WHERE name LIKE CONCAT('%', ?, '%')
                                            UNION ALL
                                            SELECT name as value, 'descriptor' as type,
                                                   CASE WHEN name = ? THEN 1 WHEN name LIKE CONCAT(?, '%') THEN 2 ELSE 3 END as relevance
                                            FROM descriptors WHERE name LIKE CONCAT('%', ?, '%')
                                            UNION ALL
                                            SELECT name as value, 'artist' as type,
                                                   CASE WHEN name = ? THEN 1 WHEN name LIKE CONCAT(?, '%') THEN 2 ELSE 3 END as relevance
                                            FROM artists WHERE name LIKE CONCAT('%', ?, '%')
                                            UNION ALL
                                            SELECT name as value, 'language' as type,
                                                   CASE WHEN name = ? THEN 1 WHEN name LIKE CONCAT(?, '%') THEN 2 ELSE 3 END as relevance
                                            FROM languages WHERE name LIKE CONCAT('%', ?, '%')
                                            UNION ALL
                                            SELECT name as value, 'location' as type,
                                                   CASE WHEN name = ? THEN 1 WHEN name LIKE CONCAT(?, '%') THEN 2 ELSE 3 END as relevance
                                            FROM locations WHERE name LIKE CONCAT('%', ?, '%')
                                        ) as combined_results
                ORDER BY relevance ASC, value ASC
                LIMIT 10;
            `;

            const params = [
                query, query, query,
                query, query, query,
                query, query, query,
                query, query, query,
                query, query, query
            ];

            const [results] = await connection.execute(sql, params);
            res.json(results);
        } catch (error) {
            console.error('Błąd autouzupełniania:', error);
            res.status(500).json({ error: 'Wyszukiwanie nie powiodło się' });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};