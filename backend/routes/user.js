// backend/routes/user.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const authorizeAdmin = require('../adminAuth');
const { createNotification } = require('./notifications');
const { getPagination } = require('../paginationHelper');

const PUBLIC_PROFILE_FIELDS = `
    u.id, u.username, u.role, u.created_at,
    p.first_name, p.last_name, p.birth_date, p.gender,
    p.location, p.country, p.social, p.description,
    p.music, p.movies, p.profile_pic, p.contact_email
`;

const PRIVATE_PROFILE_FIELDS = `${PUBLIC_PROFILE_FIELDS}, u.email, p.contact_email`;

function processProfileData(user) {
    if (!user) return null;
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const nickname = fullName || user.username;
    let social = {};
    try {
        if (user.social) {
            social = typeof user.social === 'string' ? JSON.parse(user.social) : user.social;
        }
    } catch (e) {
        social = {};
    }
    return { ...user, social, nickname };
}

async function resolveUserId(identifier, currentUserId = null) {
    if (!identifier || identifier === 'me') return currentUserId;
    if (!isNaN(identifier)) return parseInt(identifier);
    const [rows] = await pool.execute('SELECT id FROM users WHERE username = ?', [identifier]);
    return rows[0] ? rows[0].id : null;
}

// --- TRASY DLA ZALOGOWANEGO UŻYTKOWNIKA ---

router.get('/me', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT ${PRIVATE_PROFILE_FIELDS} FROM users u LEFT JOIN user_profiles p ON u.id = p.user_id WHERE u.id = ?`,
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Użytkownik nie został znaleziony' });
        res.json(processProfileData(rows[0]));
    } catch (err) {
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

router.put('/profile/update', authenticate, async (req, res) => {
    const userId = req.user.id;
    try {
        let {
            firstName, lastName, birthDate, gender,
            location, country, social, contactEmail,
            description, music, movies, profilePic
        } = req.body;

        const formattedBirthDate = (birthDate && birthDate.includes('T')) ? birthDate.split('T')[0] : birthDate;
        let socialStr = '{}';
        if (social) socialStr = typeof social === 'object' ? JSON.stringify(social) : social;

        await pool.execute(
            `INSERT INTO user_profiles (user_id, first_name, last_name, profile_pic, description, location, country, social, birth_date, gender, contact_email, music, movies)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                                  first_name=VALUES(first_name), last_name=VALUES(last_name), profile_pic=VALUES(profile_pic),
                                  description=VALUES(description), location=VALUES(location), country=VALUES(country),
                                  social=VALUES(social), birth_date=VALUES(birth_date), gender=VALUES(gender),
                                  contact_email=VALUES(contact_email), music=VALUES(music), movies=VALUES(movies)`,
            [userId, firstName, lastName, profilePic, description, location, country, socialStr, formattedBirthDate || null, gender, contactEmail, music, movies]
        );
        res.json({ success: true, message: 'Profil zaktualizowany' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd aktualizacji' });
    }
});

router.post('/notifications/read', authenticate, async (req, res) => {
    try {
        await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

router.get('/tags', authenticate, (req, res) => fetchUserTags(req.user.id, req, res));
router.get('/lists', authenticate, (req, res) => fetchUserLists(req.user.id, req, res));
router.get('/rated-albums', authenticate, (req, res) => fetchRatedAlbums(req.user.id, req, res));
router.get('/track-ratings', authenticate, (req, res) => fetchTrackRatings(req.user.id, res));
router.get('/reviews', authenticate, (req, res) => fetchUserReviews(req.user.id, req, res));
router.get('/me/stats/ratings', authenticate, (req, res) => getUserRatingStats(req.user.id, res));

// --- PROFIL PUBLICZNY ---

router.get('/:identifier', async (req, res) => {
    try {
        const userId = await resolveUserId(req.params.identifier);
        if (!userId) return res.status(404).json({ error: 'Nie znaleziono' });
        const [rows] = await pool.execute(
            `SELECT ${PUBLIC_PROFILE_FIELDS} FROM users u LEFT JOIN user_profiles p ON u.id = p.user_id WHERE u.id = ?`,
            [userId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Nie znaleziono' });
        res.json(processProfileData(rows[0]));
    } catch (err) {
        res.status(500).json({ error: 'Błąd' });
    }
});

router.post('/:identifier/follow', authenticate, async (req, res) => {
    try {
        const targetId = await resolveUserId(req.params.identifier);
        if (!targetId || targetId === req.user.id) return res.status(400).json({ error: "Błąd" });
        const [existing] = await pool.execute('SELECT 1 FROM user_relations WHERE follower_id = ? AND followed_id = ?', [req.user.id, targetId]);
        if (existing.length > 0) {
            await pool.execute('DELETE FROM user_relations WHERE follower_id = ? AND followed_id = ?', [req.user.id, targetId]);
            res.json({ status: 'unfollowed' });
        } else {
            await pool.execute('INSERT INTO user_relations (follower_id, followed_id) VALUES (?, ?)', [req.user.id, targetId]);
            await createNotification(targetId, req.user.id, 'new_follow', `Użytkownik /user/${req.user.username} zaczął Cię obserwować`, `/user/${req.user.username}`);
            res.json({ status: 'followed' });
        }
    } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

router.get('/:identifier/is-following', authenticate, async (req, res) => {
    const followedId = await resolveUserId(req.params.identifier);
    if (!followedId) return res.json({ isFollowing: false });
    const [rows] = await pool.execute('SELECT 1 FROM user_relations WHERE follower_id = ? AND followed_id = ?', [req.user.id, followedId]);
    res.json({ isFollowing: rows.length > 0 });
});

router.get('/:identifier/friends', async (req, res) => {
    const userId = await resolveUserId(req.params.identifier);
    if (!userId) return res.status(404).json({ error: 'Błąd' });
    const { page, limit, offset } = getPagination(req, 10, 50);
    const [rows] = await pool.execute(`
        SELECT u.id, u.username, p.profile_pic 
        FROM user_relations r1 
        JOIN user_relations r2 ON r1.followed_id = r2.follower_id AND r1.follower_id = r2.followed_id 
        JOIN users u ON u.id = r1.followed_id 
        LEFT JOIN user_profiles p ON u.id = p.user_id 
        WHERE r1.follower_id = ? LIMIT ${limit} OFFSET ${offset}`, [userId]);
    res.json({ items: rows, page, limit });
});

router.get('/:identifier/actions/:type', async (req, res) => {
    const userId = await resolveUserId(req.params.identifier);
    if (!userId) return res.status(404).json({ error: 'Błąd' });
    const type = req.params.type;
    const sort = req.query.sort || 'newest';
    let orderBy = 'MAX(uaa.created_at) DESC';
    if (sort === 'release_date') orderBy = 'a.release_date DESC';
    else if (sort === 'alphabetical') orderBy = 'a.title ASC';

    const [rows] = await pool.execute(`
        SELECT a.id, a.title, GROUP_CONCAT(art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist, a.cover_url, a.slug
        FROM user_album_actions uaa JOIN albums a ON uaa.album_id = a.id 
        LEFT JOIN album_artists aa ON a.id = aa.album_id LEFT JOIN artists art ON aa.artist_id = art.id
        WHERE uaa.user_id = ? AND uaa.action_type = ? GROUP BY a.id ORDER BY ${orderBy}`, [userId, type]);
    res.json(rows);
});

router.get('/:identifier/comments', async (req, res) => {
    const profileId = await resolveUserId(req.params.identifier);
    if (!profileId) return res.status(404).json({ error: 'Błąd' });
    const { page, limit, offset } = getPagination(req, 10);
    const [count] = await pool.execute("SELECT COUNT(*) as total FROM comments WHERE entity_id = ? AND entity_type = 'user' AND parent_id IS NULL", [profileId]);
    const [rows] = await pool.execute(`
        SELECT c.*, u.username, p.profile_pic, (SELECT COUNT(*) FROM comments WHERE parent_id = c.id) as replies_count
        FROM comments c JOIN users u ON c.user_id = u.id LEFT JOIN user_profiles p ON u.id = p.user_id
        WHERE c.entity_id = ? AND c.entity_type = 'user' AND c.parent_id IS NULL ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [profileId]);
    res.json({ items: rows, total: count[0].total, page, limit });
});

router.post('/:identifier/comments', authenticate, async (req, res) => {
    const profileId = await resolveUserId(req.params.identifier);
    if (!profileId) return res.status(404).json({ error: 'Błąd' });
    await pool.execute('INSERT INTO comments (entity_id, entity_type, user_id, content, parent_id) VALUES (?, \'user\', ?, ?, ?)', [profileId, req.user.id, req.body.content, req.body.parentId || null]);
    if (profileId !== req.user.id) await createNotification(profileId, req.user.id, 'new_comment', `Komentarz od ${req.user.username}`, `/user/${req.user.username}`);
    res.json({ success: true });
});


router.get('/:identifier/followed-artists', async (req, res) => {
    const userId = await resolveUserId(req.params.identifier);
    if (!userId) return res.status(404).json({ error: 'Użytkownik nie został znaleziony' });

    try {
        const { page, limit, offset } = getPagination(req, 10, 50);
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM user_album_actions WHERE user_id = ? AND action_type = 'follow' AND artist_id IS NOT NULL`,
            [userId]
        );
        const [rows] = await pool.execute(`
            SELECT a.id, a.name, a.slug, a.picture_url as image
            FROM user_album_actions uaa
            JOIN artists a ON uaa.artist_id = a.id
            WHERE uaa.user_id = ? AND uaa.action_type = 'follow'
            ORDER BY uaa.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `, [userId]);
        res.json({ items: rows, total: countResult[0].total, page, limit });
    } catch (err) {
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

router.get('/:identifier/rated-albums', async (req, res) => fetchRatedAlbums(await resolveUserId(req.params.identifier), req, res));
router.get('/:identifier/track-ratings', async (req, res) => fetchTrackRatings(await resolveUserId(req.params.identifier), res));
router.get('/:identifier/reviews', async (req, res) => fetchUserReviews(await resolveUserId(req.params.identifier), req, res));
router.get('/:identifier/tags', async (req, res) => fetchUserTags(await resolveUserId(req.params.identifier), req, res));
router.get('/:identifier/lists', async (req, res) => fetchUserLists(await resolveUserId(req.params.identifier), req, res));
router.get('/:identifier/stats/ratings', async (req, res) => getUserRatingStats(await resolveUserId(req.params.identifier), res));

// --- HELPERY ---

async function fetchRatedAlbums(userId, req, res) {
    if (!userId) return res.status(404).json({error: 'Not found'});
    const { page, limit, offset } = getPagination(req);
    const score = req.query.score;
    let where = 'WHERE r.user_id = ?';
    let params = [userId];
    if (score) { where += ' AND r.score = ?'; params.push(score); }

    const [count] = await pool.execute(`SELECT COUNT(*) as total FROM ratings r ${where}`, params);
    const [rows] = await pool.execute(`
        SELECT a.id, a.title, a.slug, a.cover_url, a.release_date, r.score, r.created_at,
        (SELECT name FROM artists JOIN album_artists aa ON artists.id = aa.artist_id WHERE aa.album_id = a.id LIMIT 1) as artist
        FROM ratings r JOIN albums a ON r.album_id = a.id ${where} ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ items: rows, total: count[0].total, page, limit });
}

// OPTIMIZED: Uses JSON_ARRAYAGG to prevent N+1 queries
async function fetchTrackRatings(userId, res) {
    if (!userId) return res.status(404).json({error: 'Not found'});
    try {
        const [rows] = await pool.execute(`
            SELECT
                a.id, a.title, a.cover_url, a.slug, a.release_date,
                GROUP_CONCAT(DISTINCT art.name ORDER BY aa.is_main DESC SEPARATOR ', ') AS artist,
                JSON_ARRAYAGG(JSON_OBJECT(
                        'id', t.id,
                        'track_number', t.track_number,
                        'title', t.title,
                        'duration', t.duration,
                        'user_rating', tr.score
                              )) as tracks
            FROM track_ratings tr
                     JOIN tracks t ON tr.track_id = t.id
                     JOIN albums a ON t.album_id = a.id
                     LEFT JOIN album_artists aa ON a.id = aa.album_id
                     LEFT JOIN artists art ON aa.artist_id = art.id
            WHERE tr.user_id = ?
            GROUP BY a.id, a.title, a.cover_url, a.slug, a.release_date
            ORDER BY MAX(tr.created_at) DESC
        `, [userId]);

        const result = rows.map(r => ({
            ...r,
            tracks: typeof r.tracks === 'string' ? JSON.parse(r.tracks) : r.tracks
        }));
        // Сортировка треков внутри альбома по номеру (JSON_ARRAYAGG не гарантирует порядок)
        result.forEach(album => {
            if(Array.isArray(album.tracks)) {
                album.tracks.sort((a,b) => a.track_number - b.track_number);
            }
        });

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
}

async function fetchUserReviews(userId, req, res) {
    if (!userId) return res.status(404).json({error: 'Not found'});
    const { page, limit, offset } = getPagination(req);
    const [count] = await pool.execute("SELECT COUNT(*) as total FROM comments WHERE user_id = ? AND entity_type = 'album' AND parent_id IS NULL", [userId]);
    const [rows] = await pool.execute(`
        SELECT c.id, c.content, c.created_at, a.title as album_title, a.slug, a.cover_url, rt.score as user_score
        FROM comments c JOIN albums a ON c.entity_id = a.id LEFT JOIN ratings rt ON c.user_id = rt.user_id AND c.entity_id = rt.album_id
        WHERE c.user_id = ? AND c.entity_type = 'album' AND c.parent_id IS NULL ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [userId]);
    res.json({ items: rows, total: count[0].total, page, limit });
}

async function getUserRatingStats(userId, res) {
    if (!userId) return res.status(404).json({error: 'Not found'});
    const [rows] = await pool.execute('SELECT score, COUNT(*) as count FROM ratings WHERE user_id = ? GROUP BY score', [userId]);
    const stats = {};
    let total = 0;
    rows.forEach(r => { stats[parseFloat(r.score).toFixed(1)] = r.count; total += r.count; });
    res.json({ stats, totalRatings: total });
}

async function fetchUserTags(userId, req, res) {
    if (!userId) return res.status(404).json({error: 'Not found'});
    const { page, limit, offset } = getPagination(req);
    const [count] = await pool.execute('SELECT COUNT(*) as total FROM user_album_tags WHERE user_id = ?', [userId]);
    const [rows] = await pool.execute(`
        SELECT uat.tag_name, a.title, a.cover_url, a.slug, ar.name as artist_name
        FROM user_album_tags uat JOIN albums a ON uat.album_id = a.id
        LEFT JOIN album_artists aa ON a.id = aa.album_id AND aa.is_main = 1 LEFT JOIN artists ar ON aa.artist_id = ar.id
        WHERE uat.user_id = ? ORDER BY uat.tag_name, a.title LIMIT ${limit} OFFSET ${offset}`, [userId]);
    res.json({ items: rows, total: count[0].total, page, limit });
}

async function fetchUserLists(userId, req, res) {
    if (!userId) return res.status(404).json({error: 'Not found'});
    const { page, limit, offset } = getPagination(req);
    const [count] = await pool.execute('SELECT COUNT(*) as total FROM lists WHERE user_id = ?', [userId]);
    const [rows] = await pool.execute(`
        SELECT l.*, (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS items_count
        FROM lists l WHERE user_id = ? ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [userId]);
    res.json({ items: rows, total: count[0].total, page, limit });
}

module.exports = router;