const express = require('express');
const router = express.Router();

const CACHE = {
    formats: { data: null, timestamp: 0 },
    attributes_cache: { data: null, timestamp: 0},
    genres: { data: null, timestamp: 0 },
    languages: { data: null, timestamp: 0 },
    descriptors: { data: null, timestamp: 0 }

};
const CACHE_TTL = 10 * 60 * 1000;

module.exports = (pool) => {
    // Единая функция получения данных из таблиц-справочников
    const getFromTable = async (tableName, cacheKey) => {
        const now = Date.now();
        const cacheEntry = CACHE[cacheKey];

        // УЛУЧШЕННАЯ ЛОГИКА КЭША:
        // Если кэш существует, он свежий И содержит данные (длина > 0)
        // Если кэш свежий, но пустой, мы игнорируем его и идем в базу,
        // чтобы получить новые данные сразу после добавления первого альбома.
        if (cacheEntry && cacheEntry.data && cacheEntry.data.length > 0 && (now - cacheEntry.timestamp < CACHE_TTL)) {
            return cacheEntry.data;
        }

        let connection;
        try {
            connection = await pool.getConnection();
            // Выбираем уникальные имена, отсортированные по алфавиту
            const [rows] = await connection.execute(`SELECT name FROM ${tableName} ORDER BY name ASC`);

            // Обработка на случай разного регистра (name vs Name)
            const list = rows.map(r => r.name || r.Name);

            // Обновляем кэш
            CACHE[cacheKey] = { data: list, timestamp: now };
            return list;
        } catch (error) {
            console.error(`Error fetching ${tableName}:`, error);
            throw error;
        } finally {
            if (connection) connection.release();
        }
    };

    // === ЭНДПОИНТЫ ===

    router.get('/formats', async (req, res) => {
        try {
            const formats = await getFromTable('release_formats', 'formats');
            const attributes = await getFromTable('release_attributes', 'attributes_cache');
            res.json({ formats, attributes });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch formats' });
        }
    });

    router.get('/all-genres', async (req, res) => {
        try {
            const genres = await getFromTable('genres', 'genres');
            res.json(genres);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed' });
        }
    });

    router.get('/genres-count', async (req, res) => {
        try {
            const genres = await getFromTable('genres', 'genres');
            res.json({ count: genres.length });
        } catch (e) { res.status(500).json({ error: 'Failed' }); }
    });

    // Языки
    router.get('/all-language', async (req, res) => {
        try {
            const data = await getFromTable('languages', 'languages');
            res.json(data);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed' });
        }
    });

    router.get('/language-count', async (req, res) => {
        try {
            const data = await getFromTable('languages', 'languages');
            res.json({ count: data.length });
        } catch (e) { res.status(500).json({ error: 'Failed' }); }
    });

    // Дескрипторы
    router.get('/all-description', async (req, res) => {
        try {
            const data = await getFromTable('descriptors', 'descriptors');
            res.json(data);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed' });
        }
    });

    router.get('/description-count', async (req, res) => {
        try {
            const data = await getFromTable('descriptors', 'descriptors');
            res.json({ count: data.length });
        } catch (e) { res.status(500).json({ error: 'Failed' }); }
    });

    // ==================================================================
    // 🟢 НОВЫЙ ЭНДПОИНТ: УМНЫЙ АВТОКОМПЛИТ (ПОИСК)
    // ==================================================================
    router.get('/autocomplete', async (req, res) => {
        const query = req.query.q;

        // Если запрос пустой или слишком короткий
        if (!query || query.length < 2) {
            return res.json([]);
        }

        let connection;
        try {
            connection = await pool.getConnection();

            // Мы используем UNION ALL, чтобы склеить результаты из разных таблиц.
            // Приоритет (relevance):
            // 1 = Полное совпадение
            // 2 = Начинается с... (Grunge -> Grun...)
            // 3 = Содержит внутри (...Post-Grunge)

            const sql = `
                SELECT * FROM (
                    -- 1. Жанры
                    SELECT name as value, 'genre' as type,
                    CASE 
                        WHEN name = ? THEN 1 
                        WHEN name LIKE CONCAT(?, '%') THEN 2 
                        ELSE 3 
                    END as relevance
                    FROM genres 
                    WHERE name LIKE CONCAT('%', ?, '%')

                    UNION ALL

                    -- 2. Дескрипторы
                    SELECT name as value, 'description' as type,
                    CASE 
                        WHEN name = ? THEN 1 
                        WHEN name LIKE CONCAT(?, '%') THEN 2 
                        ELSE 3 
                    END as relevance
                    FROM descriptors 
                    WHERE name LIKE CONCAT('%', ?, '%')

                    UNION ALL

                    -- 3. Артисты (чтобы поиск по артистам тоже работал умно)
                    SELECT name as value, 'artist' as type,
                    CASE 
                        WHEN name = ? THEN 1 
                        WHEN name LIKE CONCAT(?, '%') THEN 2 
                        ELSE 3 
                    END as relevance
                    FROM artists 
                    WHERE name LIKE CONCAT('%', ?, '%')

                    UNION ALL

                    -- 4. Языки
                    SELECT name as value, 'language' as type,
                    CASE 
                        WHEN name = ? THEN 1 
                        WHEN name LIKE CONCAT(?, '%') THEN 2 
                        ELSE 3 
                    END as relevance
                    FROM languages 
                    WHERE name LIKE CONCAT('%', ?, '%')

                ) as combined_results
                ORDER BY relevance ASC, value ASC
                LIMIT 10;
            `;

            // Нам нужно передать параметр query 3 раза для каждой таблицы (для =, для LIKE start%, для LIKE %contains%)
            // Таблиц 4 штуки. Итого 4 * 3 = 12 параметров.
            const params = [
                query, query, query, // genres
                query, query, query, // descriptors
                query, query, query, // artists
                query, query, query  // languages
            ];

            const [results] = await connection.execute(sql, params);

            res.json(results);

        } catch (error) {
            console.error('Autocomplete Error:', error);
            res.status(500).json({ error: 'Search failed' });
        } finally {
            if (connection) connection.release();
        }
    });


    return router;
};