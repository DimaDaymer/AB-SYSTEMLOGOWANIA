// backend/routes/members.js
const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware');
const slugify = require('slugify');

// Helper: Проверка прав админа
const isAdmin = (req) => req.user && req.user.role === 'admin';

module.exports = (pool) => {

    // === АВТОДОПОЛНЕНИЕ АРТИСТОВ ===
    router.get('/autocomplete/artist', async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);
        try {
            const [rows] = await pool.execute(
                `SELECT name FROM artists WHERE name LIKE ? LIMIT 10`,
                [`%${q}%`]
            );
            res.json(rows.map(row => row.name));
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'DB Error fetching suggestions' });
        }
    });

    // === АВТОДОПОЛНЕНИЕ РОЛЕЙ ===
    router.get('/autocomplete/role', async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);
        try {
            const [rows] = await pool.execute(
                `SELECT name FROM credit_roles WHERE name LIKE ? LIMIT 10`,
                [`%${q}%`]
            );
            res.json(rows.map(row => row.name));
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'DB Error fetching suggestions' });
        }
    });

    // === ПОЛУЧИТЬ СВЯЗАННЫХ АРТИСТОВ (Исправленный маршрут) ===
    router.get('/related/:artistId', async (req, res) => {
        const { artistId } = req.params;
        const mode = req.query.mode || 'members';

        let connection = null;
        try {
            connection = await pool.getConnection();
            let query;
            let params;

            if (mode === 'groups') {
                // МЫ SOLO АРТИСТ -> ИЩЕМ ГРУППЫ, ГДЕ ОН ИГРАЛ
                query = `
                    SELECT
                        am.id,
                        am.group_artist_id as target_id,
                        am.start_year,
                        am.end_year,
                        cr.name as role_name,
                        art.name as target_name,
                        art.slug as target_slug,
                        'group' as relation_type
                    FROM artist_members am
                             JOIN artists art ON am.group_artist_id = art.id
                             LEFT JOIN credit_roles cr ON am.role_id = cr.id
                    WHERE am.member_artist_id = ?
                    ORDER BY am.start_year ASC, art.name
                `;
                params = [artistId];
            } else {
                // МЫ ГРУППА -> ИЩЕМ УЧАСТНИКОВ
                query = `
                    SELECT
                        am.id,
                        am.member_artist_id as target_id,
                        am.start_year,
                        am.end_year,
                        cr.name as role_name,
                        art.name as target_name,
                        art.slug as target_slug,
                        'member' as relation_type
                    FROM artist_members am
                             JOIN artists art ON am.member_artist_id = art.id
                             LEFT JOIN credit_roles cr ON am.role_id = cr.id
                    WHERE am.group_artist_id = ?
                    ORDER BY am.start_year ASC, art.name
                `;
                params = [artistId];
            }

            const [rows] = await connection.execute(query, params);
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'DB Error fetching relations' });
        } finally {
            if (connection) connection.release();
        }
    });

    // === ДОБАВИТЬ СВЯЗЬ (Исправленный POST) ===
    router.post('/', authenticate, async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });

        const { hostArtistId, hostType, targetName, roleName, startYear, endYear } = req.body;

        // Валидация
        if (!hostArtistId || !targetName || !roleName || !hostType) {
            return res.status(400).json({ error: 'Missing fields (hostArtistId, targetName, roleName, hostType)' });
        }

        let connection = null;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 1. Найти или создать TARGET артиста
            let targetArtistId;
            let [artists] = await connection.execute('SELECT id, artist_type FROM artists WHERE name = ?', [targetName]);

            if (artists.length > 0) {
                targetArtistId = artists[0].id;
                // Проверка, что существующий артист имеет ожидаемый тип (Solo/Group)
                const expectedType = hostType === 'solo' ? 'group' : 'solo';
                if (artists[0].artist_type && artists[0].artist_type !== expectedType) {
                    await connection.rollback();
                    return res.status(400).json({ error: `Artist "${targetName}" already exists but is type "${artists[0].artist_type}", expected "${expectedType}"` });
                }
            } else {
                const baseSlug = slugify(targetName, { lower: true, strict: true, locale: 'ru' });
                let slug = baseSlug;
                let counter = 1;
                while (true) {
                    const [slugRows] = await connection.execute('SELECT id FROM artists WHERE slug = ?', [slug]);
                    if (slugRows.length === 0) break;
                    slug = `${baseSlug}-${counter++}`;
                }
                // Если мы Solo, добавляем Группу, и наоборот
                const newType = hostType === 'solo' ? 'group' : 'solo';

                const [newArtResult] = await connection.execute(
                    'INSERT INTO artists (name, slug, artist_type) VALUES (?, ?, ?)',
                    [targetName, slug, newType]
                );
                targetArtistId = newArtResult.insertId;
            }

            // 2. Роль
            let roleId = null;
            let [roles] = await connection.execute('SELECT id FROM credit_roles WHERE name = ?', [roleName]);
            if (roles.length > 0) {
                roleId = roles[0].id;
            } else {
                const [newRole] = await connection.execute('INSERT INTO credit_roles (name) VALUES (?)', [roleName]);
                roleId = newRole.insertId;
            }

            if (targetArtistId.toString() === hostArtistId.toString()) {
                await connection.rollback();
                return res.status(400).json({ error: 'Recursive relationship not allowed' });
            }

            // 3. Определяем кто есть кто
            let groupArtistId, memberArtistId;

            if (hostType === 'group') {
                // Мы в группе, добавляем участника
                groupArtistId = hostArtistId;
                memberArtistId = targetArtistId;
            } else {
                // Мы соло артист, добавляем группу
                groupArtistId = targetArtistId;
                memberArtistId = hostArtistId;
            }

            // 4. Добавляем новую запись.
            // УДАЛЕНА ПРОВЕРКА НА ДУБЛИКАТ: Разрешаем добавление одной и той же пары с разными годами.
            await connection.execute(
                'INSERT INTO artist_members (group_artist_id, member_artist_id, role_id, start_year, end_year) VALUES (?, ?, ?, ?, ?)',
                [groupArtistId, memberArtistId, roleId, startYear || null, endYear || null]
            );


            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            if (connection) await connection.rollback();
            console.error(err);
            res.status(500).json({ error: 'Save failed', details: err.message });
        } finally {
            if (connection) connection.release();
        }
    });

    // === УДАЛИТЬ СВЯЗЬ ===
    router.delete('/:id', authenticate, async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
        let connection = null;
        try {
            connection = await pool.getConnection();
            await connection.execute('DELETE FROM artist_members WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Delete failed' });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};