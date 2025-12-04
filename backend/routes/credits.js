const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware'); // Предполагаем, что этот файл есть по этому пути

// Helper: Проверка прав админа
const isAdmin = (req) => req.user && req.user.role === 'admin';

module.exports = (pool) => {

    // === ПОЛУЧИТЬ КРЕДИТЫ АЛЬБОМА ===
    router.get('/album/:albumId', async (req, res) => {
        let connection = null;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.execute(`
                SELECT 
                    ac.id, 
                    ac.artist_id,
                    art.name as artist_name, 
                    art.slug as artist_slug, 
                    ac.role_id,
                    cr.name as role_name
                FROM album_credits ac
                JOIN artists art ON ac.artist_id = art.id
                LEFT JOIN credit_roles cr ON ac.role_id = cr.id
                WHERE ac.album_id = ?
                ORDER BY cr.name, art.name
            `, [req.params.albumId]);
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'DB Error' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === ПОИСК АРТИСТОВ (Для автокомплита) ===
    router.get('/search-artists', async (req, res) => {
        let connection = null;
        try {
            const { q } = req.query;
            if (!q) return res.json([]);
            connection = await pool.getConnection();
            const [rows] = await connection.execute(
                'SELECT id, name FROM artists WHERE name LIKE ? LIMIT 10',
                [`%${q}%`]
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: 'DB Error' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === ПОИСК РОЛЕЙ (Для автокомплита) ===
    router.get('/search-roles', async (req, res) => {
        let connection = null;
        try {
            const { q } = req.query;
            connection = await pool.getConnection();
            let sql = 'SELECT id, name FROM credit_roles';
            let params = [];
            if (q) {
                sql += ' WHERE name LIKE ?';
                params.push(`%${q}%`);
            }
            sql += ' LIMIT 20';
            const [rows] = await connection.execute(sql, params);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: 'DB Error' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === ДОБАВИТЬ КРЕДИТ (Admin Only) ===
    router.post('/', authenticate, async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });

        const { albumId, artistName, roleName } = req.body;
        if (!albumId || !artistName || !roleName) return res.status(400).json({ error: 'Missing fields' });

        let connection = null;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 1. Найти или создать артиста (упрощенно, если артиста нет, можно запретить или создать)
            // Здесь предполагаем, что артист должен существовать, но можно и создать.
            // Для надежности ищем по имени.
            let [artists] = await connection.execute('SELECT id FROM artists WHERE name = ?', [artistName]);
            if (artists.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Artist not found. Please create artist first.' });
            }
            const artistId = artists[0].id;

            // 2. Найти или создать роль
            let roleId;
            let [roles] = await connection.execute('SELECT id FROM credit_roles WHERE name = ?', [roleName]);
            if (roles.length > 0) {
                roleId = roles[0].id;
            } else {
                const [newRole] = await connection.execute('INSERT INTO credit_roles (name) VALUES (?)', [roleName]);
                roleId = newRole.insertId;
            }

            // 3. Создать связь
            await connection.execute(
                'INSERT INTO album_credits (album_id, artist_id, role_id) VALUES (?, ?, ?)',
                [albumId, artistId, roleId]
            );

            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            if (connection) await connection.rollback();
            console.error(err);
            res.status(500).json({ error: 'Save failed' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === УДАЛИТЬ КРЕДИТ (Admin Only) ===
    router.delete('/:id', authenticate, async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
        let connection = null;
        try {
            connection = await pool.getConnection();
            await connection.execute('DELETE FROM album_credits WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Delete failed' });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};