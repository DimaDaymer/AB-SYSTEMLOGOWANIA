const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware'); // Upewnij się, że ścieżka jest poprawna
const slugify = require('slugify');

// Pomocnik do sprawdzania uprawnień administratora
const isAdmin = (req) => req.user && req.user.role === 'admin';

module.exports = (pool) => {

    // 1. Autouzupełnianie dla artystów
    router.get('/search-artists', async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 1) return res.json([]);
        try {
            const [rows] = await pool.execute(
                `SELECT id, name FROM artists WHERE name LIKE ? LIMIT 10`,
                [`%${q}%`]
            );
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 2. Autouzupełnianie dla ról
    router.get('/search-roles', async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 1) return res.json([]);
        try {
            const [rows] = await pool.execute(
                `SELECT id, name FROM credit_roles WHERE name LIKE ? LIMIT 10`,
                [`%${q}%`]
            );
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 3. Pobieranie informacji o twórcach albumu (credits)
    router.get('/album/:albumId', async (req, res) => {
        try {
            const [rows] = await pool.execute(`
                SELECT c.id,
                       c.artist_id,
                       art.name as artist_name,
                       art.slug as artist_slug,
                       c.role_id,
                       cr.name as role_name
                FROM credits c
                         JOIN artists art ON c.artist_id = art.id
                         LEFT JOIN credit_roles cr ON c.role_id = cr.id
                WHERE c.album_id = ?
                ORDER BY cr.name, art.name
            `, [req.params.albumId]);
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 4. Pobieranie powiązań artysty (Członkowie lub Grupy)
    router.get('/related/:artistId', async (req, res) => {
        const { artistId } = req.params;
        const mode = req.query.mode || 'members'; // 'members' (członkowie) lub 'groups' (grupy)

        try {
            let query;
            if (mode === 'groups') {
                // W jakich grupach był artysta (artistId to członek)
                query = `
                    SELECT c.id,
                           c.group_id as target_id,
                           c.start_year,
                           c.end_year,
                           cr.name as role_name,
                           art.name as target_name,
                           art.slug as target_slug,
                           'group' as relation_type
                    FROM credits c
                             JOIN artists art ON c.group_id = art.id
                             LEFT JOIN credit_roles cr ON c.role_id = cr.id
                    WHERE c.artist_id = ? AND c.group_id IS NOT NULL
                    ORDER BY c.start_year ASC, art.name`;
            } else {
                // Kto należy do grupy (artistId to grupa)
                query = `
                    SELECT c.id,
                           c.artist_id as target_id,
                           c.start_year,
                           c.end_year,
                           cr.name as role_name,
                           art.name as target_name,
                           art.slug as target_slug,
                           'member' as relation_type
                    FROM credits c
                             JOIN artists art ON c.artist_id = art.id
                             LEFT JOIN credit_roles cr ON c.role_id = cr.id
                    WHERE c.group_id = ? AND c.album_id IS NULL
                    ORDER BY c.start_year ASC, art.name`;
            }
            const [rows] = await pool.execute(query, [artistId]);
            res.json(rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    // 5. Dodawanie wpisu (Kredyt albumu lub powiązanie członka)
    router.post('/', authenticate, async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Brak uprawnień administratora' });

        // hostType jest używany do określenia ról podczas dodawania członka
        const {
            albumId,
            hostArtistId, hostType, // Dla powiązań (Artysta/Grupa)
            artistName, targetName, // Nazwa dodawanego obiektu
            roleName,
            startYear, endYear
        } = req.body;

        // Określamy nazwę dodawanej encji (dla albumu to artistName, dla grupy targetName)
        const nameToFind = (artistName || targetName || '').trim();
        const roleToFind = (roleName || '').trim();

        if (!nameToFind || !roleToFind) return res.status(400).json({ error: 'Nazwa i rola są wymagane' });

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // 1. Znajdź lub utwórz artystę/grupę
            let [arts] = await conn.execute('SELECT id FROM artists WHERE name = ?', [nameToFind]);
            let targetId;

            if (arts.length > 0) {
                targetId = arts[0].id;
            } else {
                // Jeśli nie istnieje, utwórz. Domyślny typ to 'solo', administrator może go zmienić później
                const slug = slugify(nameToFind, { lower: true, strict: true });
                const [ins] = await conn.execute(
                    'INSERT INTO artists (name, slug, artist_type) VALUES (?, ?, ?)',
                    [nameToFind, slug, 'solo']
                );
                targetId = ins.insertId;
            }

            // 2. Znajdź lub utwórz rolę
            let [roles] = await conn.execute('SELECT id FROM credit_roles WHERE name = ?', [roleToFind]);
            let roleId;

            if (roles.length > 0) {
                roleId = roles[0].id;
            } else {
                const [insR] = await conn.execute('INSERT INTO credit_roles (name) VALUES (?)', [roleToFind]);
                roleId = insR.insertId;
            }

            // 3. Wstaw zapis do tabeli credits
            if (albumId) {
                // To jest kredyt albumu
                await conn.execute(
                    'INSERT INTO credits (album_id, artist_id, role_id) VALUES (?, ?, ?)',
                    [albumId, targetId, roleId]
                );
            } else if (hostArtistId) {
                // To jest powiązanie (członek <-> grupa)
                // Jeśli jesteśmy na stronie grupy (hostType='group'), dodajemy członka (targetId)
                // Jeśli jesteśmy na stronie artysty (hostType='solo'), dodajemy grupę (targetId)

                let groupId, memberId;

                if (hostType === 'group') {
                    groupId = hostArtistId;
                    memberId = targetId;
                } else {
                    groupId = targetId;
                    memberId = hostArtistId;
                }

                await conn.execute(
                    `INSERT INTO credits (group_id, artist_id, role_id, start_year, end_year)
                     VALUES (?, ?, ?, ?, ?)`,
                    [groupId, memberId, roleId, startYear || null, endYear || null]
                );
            }

            await conn.commit();
            res.json({ success: true });

        } catch (e) {
            if (conn) await conn.rollback();
            console.error(e);
            res.status(500).json({ error: e.message });
        } finally {
            if (conn) conn.release();
        }
    });

    // 6. Usuwanie wpisu
    router.delete('/:id', authenticate, async (req, res) => {
        if (!isAdmin(req)) return res.status(403).json({ error: 'Brak uprawnień administratora' });
        try {
            await pool.execute('DELETE FROM credits WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Błąd bazy danych' });
        }
    });

    return router;
};