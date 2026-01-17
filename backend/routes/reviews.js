const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const { createNotification } = require('./notifications');
const { getPagination } = require('../paginationHelper');

const VALID_TYPES = ['album', 'track', 'artist', 'user', 'list'];

// === FUNKCJE POMOCNICZE DLA STATYSTYK ===

async function updateAlbumReviewStats(albumId) {
    if (!albumId) return;
    try {
        await pool.query(`
            INSERT INTO album_stats (album_id, reviews_count)
            SELECT ?, (SELECT COUNT(*) FROM comments WHERE entity_type = 'album' AND entity_id = ? AND parent_id IS NULL)
            ON DUPLICATE KEY UPDATE reviews_count = VALUES(reviews_count)
        `, [albumId, albumId]);
    } catch (err) {
        console.error("Aktualizacja statystyk recenzji albumu nie powiodła się:", err);
    }
}

async function updateArtistReviewStats(artistId) {
    if (!artistId) return;
    try {
        await pool.query(`
            INSERT INTO artist_stats (artist_id, reviews_count)
            SELECT ?, (SELECT COUNT(*) FROM comments WHERE entity_type = 'artist' AND entity_id = ? AND parent_id IS NULL)
            ON DUPLICATE KEY UPDATE reviews_count = VALUES(reviews_count)
        `, [artistId, artistId]);
    } catch (err) {
        console.error("Aktualizacja statystyk recenzji artysty nie powiodła się:", err);
    }
}

async function updateTrackReviewStats(trackId) {
    if (!trackId) return;
    try {
        await pool.query(`
            INSERT INTO tracks_stats (track_id, reviews_count)
            SELECT ?, (SELECT COUNT(*) FROM comments WHERE entity_type = 'track' AND entity_id = ? AND parent_id IS NULL)
            ON DUPLICATE KEY UPDATE reviews_count = VALUES(reviews_count)
        `, [trackId, trackId]);
    } catch (err) {
        console.error("Aktualizacja statystyk recenzji utworu nie powiodła się:", err);
    }
}

async function updateListReviewStats(listId) {
    if (!listId) return;
    try {
        await pool.query(`
            INSERT INTO list_stats (list_id, reviews_count)
            SELECT ?, (SELECT COUNT(*) FROM comments WHERE entity_type = 'list' AND entity_id = ? AND parent_id IS NULL)
            ON DUPLICATE KEY UPDATE reviews_count = VALUES(reviews_count)
        `, [listId, listId]);
    } catch (err) {
        console.error("Aktualizacja statystyk recenzji listy nie powiodła się:", err);
    }
}

// === TRASY (ROUTES) ===

router.get('/thread/:parentId', async (req, res) => {
    try {
        const { parentId } = req.params;
        const sql = `
            SELECT
                c.id, c.user_id, c.content, c.created_at, c.updated_at, c.parent_id,
                u.username, up.profile_pic,
                (SELECT COUNT(*) FROM comments WHERE parent_id = c.id) as replies_count,
                (SELECT COUNT(*) FROM comment_votes WHERE comment_id = c.id AND vote_type = 'like') as likes_count
            FROM comments c
                     JOIN users u ON c.user_id = u.id
                     LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE c.id = ? OR c.parent_id = ?
            ORDER BY
                CASE WHEN c.id = ? THEN 0 ELSE 1 END,
                c.created_at ASC
        `;
        const [rows] = await pool.execute(sql, [parentId, parentId, parentId]);
        res.json(rows);
    } catch (err) {
        console.error("Błąd pobierania wątku:", err);
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

// ОБНОВЛЕННЫЙ РОУТ С ПАГИНАЦИЕЙ
router.get('/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const sortParam = req.query.sort || 'newest';

        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Nieprawidłowy typ jednostki' });
        }

        const entityId = parseInt(id);
        if (isNaN(entityId)) {
            return res.status(400).json({ error: 'ID musi być liczbą całkowitą' });
        }

        // Используем хелпер для получения параметров пагинации
        const { page, limit, offset } = getPagination(req, 5, 50);

        let orderBy = 'c.created_at DESC';
        if (sortParam === 'popular') {
            orderBy = 'likes_count DESC, c.created_at DESC';
        } else if (sortParam === 'oldest') {
            orderBy = 'c.created_at ASC';
        }

        let ratingJoin = '';
        let ratingSelect = '0 as user_rating';

        if (type === 'album') {
            ratingJoin = 'LEFT JOIN ratings r ON r.user_id = c.user_id AND r.album_id = c.entity_id';
            ratingSelect = 'COALESCE(r.score, 0) as user_rating';
        } else if (type === 'track') {
            ratingJoin = 'LEFT JOIN track_ratings r ON r.user_id = c.user_id AND r.track_id = c.entity_id';
            ratingSelect = 'COALESCE(r.score, 0) as user_rating';
        }

        // Безопасный SQL запрос с использованием плейсхолдеров для LIMIT и OFFSET
        const sql = `
            SELECT
                c.id,
                c.user_id,
                c.content,
                c.created_at,
                c.updated_at,
                u.username,
                up.profile_pic,
                ${ratingSelect},
                (SELECT COUNT(*) FROM comments WHERE parent_id = c.id) as replies_count,
                (SELECT COUNT(*) FROM comment_votes WHERE comment_id = c.id AND vote_type = 'like') as likes_count
            FROM comments c
                     JOIN users u ON c.user_id = u.id
                     LEFT JOIN user_profiles up ON u.id = up.user_id
                ${ratingJoin}
            WHERE c.entity_type = ? AND c.entity_id = ? AND c.parent_id IS NULL
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;

        // LIMIT и OFFSET должны передаваться как строки в pool.execute
        const [comments] = await pool.execute(sql, [type, entityId, limit.toString(), offset.toString()]);

        const [countData] = await pool.execute(
            `SELECT COUNT(*) as total FROM comments WHERE entity_type = ? AND entity_id = ? AND parent_id IS NULL`,
            [type, entityId]
        );

        const total = countData[0].total;

        res.json({
            comments,
            total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(total / limit)
        });

    } catch (err) {
        console.error("Błąd pobierania komentarzy:", err);
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

router.post('/:type', authenticate, async (req, res) => {
    try {
        const { type } = req.params;
        const { entityId, content, parentId } = req.body;
        const userId = req.user.id;

        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Nieprawidłowy typ jednostki' });
        }
        if (!content || !content.trim()) return res.status(400).json({ error: 'Treść jest pusta' });
        if (!entityId || isNaN(entityId)) return res.status(400).json({ error: 'ID jednostki musi być liczbą całkowitą' });

        const sql = `INSERT INTO comments (user_id, entity_type, entity_id, content, parent_id) VALUES (?, ?, ?, ?, ?)`;

        await pool.execute(sql, [userId, type, entityId, content, parentId || null]);

        // --- LOGIKA POWIADOMIEŃ ---
        try {
            if (parentId) {
                const [parent] = await pool.execute('SELECT user_id FROM comments WHERE id = ?', [parentId]);
                if (parent.length > 0 && parent[0].user_id !== userId) {
                    await createNotification(
                        parent[0].user_id,
                        userId,
                        'comment_reply',
                        `${req.user.username} odpowiedział na Twój komentarz`,
                        `user/${entityId}`
                    );
                }
            } else if (type === 'user' && parseInt(entityId) !== userId) {
                await createNotification(
                    entityId,
                    userId,
                    'new_comment',
                    `${req.user.username} zostawił wpis в Twoim profilu`,
                    `user/${req.user.username}`
                );
            }
        } catch (notifErr) {
            console.error("Powiadomienie nie powiodło się:", notifErr);
        }

        // --- AKTUALIZACJA STATYSTYK ---
        if (type === 'album') {
            await updateAlbumReviewStats(entityId);
        } else if (type === 'artist') {
            await updateArtistReviewStats(entityId);
        } else if (type === 'track') {
            await updateTrackReviewStats(entityId);
        } else if (type === 'list') {
            await updateListReviewStats(entityId);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Błąd dodawania komentarza:", err);
        res.status(500).json({ error: 'Nie udało się dodać komentarza' });
    }
});

router.post('/:type/:id/vote', authenticate, async (req, res) => {
    try {
        const { id: commentId } = req.params;
        const userId = req.user.id;

        const [exists] = await pool.execute(
            `SELECT id FROM comment_votes WHERE user_id = ? AND comment_id = ?`,
            [userId, commentId]
        );

        let action = 'added';
        if (exists.length > 0) {
            await pool.execute(
                `DELETE FROM comment_votes WHERE user_id = ? AND comment_id = ?`,
                [userId, commentId]
            );
            action = 'removed';
        } else {
            await pool.execute(
                `INSERT INTO comment_votes (user_id, comment_id, vote_type) VALUES (?, ?, 'like')`,
                [userId, commentId]
            );

            try {
                const [comment] = await pool.execute('SELECT user_id, entity_type, entity_id FROM comments WHERE id = ?', [commentId]);
                if (comment.length > 0 && comment[0].user_id !== userId) {
                    await createNotification(
                        comment[0].user_id,
                        userId,
                        'comment_like',
                        `${req.user.username} polubił Twój komentarz`,
                        `/user/${req.user.username}`
                    );
                }
            } catch (notifErr) {
                console.error("Błąd powiadomienia o polubieniu:", notifErr);
            }
        }

        res.json({ success: true, action });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Głosowanie nie powiodło się' });
    }
});

router.put('/:type/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const userId = req.user.id;

        await pool.execute(
            `UPDATE comments SET content = ? WHERE id = ? AND user_id = ?`,
            [content, id, userId]
        );
        res.json({ content });
    } catch (e) { res.status(500).json({ error: 'Błąd' }); }
});

router.delete('/:type/:id', authenticate, async (req, res) => {
    try {
        const { type, id } = req.params;
        const userId = req.user.id;

        const [comment] = await pool.execute(
            'SELECT entity_id, parent_id FROM comments WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (comment.length === 0) {
            return res.status(403).json({ error: 'Brak uprawnień lub komentarz nie istnieje' });
        }

        const { entity_id, parent_id } = comment[0];

        await pool.execute('DELETE FROM comments WHERE id = ? AND user_id = ?', [id, userId]);

        if (!parent_id) {
            if (type === 'album') await updateAlbumReviewStats(entity_id);
            else if (type === 'artist') await updateArtistReviewStats(entity_id);
            else if (type === 'track') await updateTrackReviewStats(entity_id);
            else if (type === 'list') await updateListReviewStats(entity_id);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Błąd usuwania komentarza:", err);
        res.status(500).json({ error: 'Nie udało się usunąć komentarza' });
    }
});

module.exports = router;