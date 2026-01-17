// backend/routes/ratings.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Upewnij się, że ścieżka do db jest poprawna
const authenticate = require('../authMiddleware');

/**
 * Funkcja aktualizująca statystyki albumu wewnątrz aktywnej transakcji.
 * Nie tworzy nowego połączenia, używa tego, które zostało przekazane.
 */
async function updateAlbumStatsInTransaction(connection, albumId) {
    await connection.execute(`
        INSERT INTO album_stats (album_id, ratings_count, avg_score, reviews_count, likes_count, listens_count, wishlist_count)
        SELECT
            ? as album_id,
            (SELECT COUNT(*) FROM ratings WHERE album_id = ?) as ratings_count,
            (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE album_id = ?) as avg_score,
            (SELECT COUNT(*) FROM comments WHERE entity_id = ? AND entity_type = 'album' AND parent_id IS NULL) as reviews_count,
            (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'like') as likes_count,
            (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'listen') as listens_count,
            (SELECT COUNT(*) FROM user_album_actions WHERE album_id = ? AND action_type = 'wishlist') as wishlist_count
        ON DUPLICATE KEY UPDATE
                             ratings_count = VALUES(ratings_count),
                             avg_score = VALUES(avg_score),
                             reviews_count = VALUES(reviews_count),
                             likes_count = VALUES(likes_count),
                             listens_count = VALUES(listens_count),
                             wishlist_count = VALUES(wishlist_count)
    `, [albumId, albumId, albumId, albumId, albumId, albumId, albumId]);
}

// 1. Dodaj lub zaktualizuj ocenę (Zoptymalizowane transakcją + Automatyczne 'listen')
router.post('/:albumId/ratings', authenticate, async (req, res) => {
    let connection = null;
    try {
        const { albumId } = req.params;
        const userId = req.user.id;

        let rawScore = req.body.score !== undefined ? req.body.score : req.body.rating;
        const scoreVal = parseFloat(rawScore);

        if (isNaN(scoreVal) || scoreVal < 0.5 || scoreVal > 5.0) {
            return res.status(400).json({ error: 'Nieprawidłowa ocena. Wymagana wartość od 0.5 do 5.0' });
        }

        // Pobieramy połączenie z puli
        connection = await pool.getConnection();

        // Rozpoczynamy transakcję
        await connection.beginTransaction();

        // 1. Zapisujemy ocenę
        await connection.execute(
            `INSERT INTO ratings (user_id, album_id, score) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE score = VALUES(score)`,
            [userId, albumId, scoreVal]
        );

        // НОВОЕ: Автоматически добавляем действие 'listen', если его еще нет
        await connection.execute(
            `INSERT IGNORE INTO user_album_actions (user_id, album_id, action_type) VALUES (?, ?, 'listen')`,
            [userId, albumId]
        );

        // 2. Aktualizujemy statystyki w tej samej transakcji (теперь учтет и новый listen)
        await updateAlbumStatsInTransaction(connection, albumId);

        // Zatwierdzamy zmiany
        await connection.commit();

        res.json({ message: 'Ocena albumu została zapisana i album oznaczony jako przesłuchany', score: scoreVal });
    } catch (err) {
        // Wycofujemy zmiany w przypadku błędu
        if (connection) await connection.rollback();
        console.error("[Błąd Oceny Albumu]:", err);
        res.status(500).json({ error: 'Nie udało się zapisać oceny' });
    } finally {
        // Zawsze zwalniamy połączenie
        if (connection) connection.release();
    }
});

// 2. Usuń ocenę (Zoptymalizowane transakcją)
router.delete('/:albumId/ratings', authenticate, async (req, res) => {
    let connection = null;
    try {
        const { albumId } = req.params;
        const userId = req.user.id;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute('DELETE FROM ratings WHERE user_id = ? AND album_id = ?', [userId, albumId]);

        // Przelicz statystyki po usunięciu
        await updateAlbumStatsInTransaction(connection, albumId);

        await connection.commit();

        res.json({ success: true, message: 'Ocena została usunięta' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("[Błąd Usuwania Oceny]:", err);
        res.status(500).json({ error: 'Nie udało się usunąć oceny' });
    } finally {
        if (connection) connection.release();
    }
});

// 3. Pobierz ocenę użytkownika (Odczyt - bez transakcji, szybki SELECT)
router.get('/:albumId/user-rating', authenticate, async (req, res) => {
    try {
        const { albumId } = req.params;
        const userId = req.user.id;

        const [rows] = await pool.execute(
            'SELECT score FROM ratings WHERE album_id = ? AND user_id = ?',
            [albumId, userId]
        );
        res.json({ score: rows[0]?.score ? parseFloat(rows[0].score) : null });
    } catch (err) {
        console.error("[Błąd Pobierania Oceny]:", err);
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

// 4. Pobierz statystyki albumu (Odczyt z tabeli cache - bardzo szybkie)
router.get('/album/:albumId/stats', async (req, res) => {
    try {
        const { albumId } = req.params;
        // Pobieramy gotowe dane z album_stats, zamiast liczyć je w locie
        const [rows] = await pool.execute(`
            SELECT avg_score, ratings_count, reviews_count, likes_count, listens_count, wishlist_count
            FROM album_stats WHERE album_id = ?
        `, [albumId]);

        const stats = rows[0] || {
            avg_score: 0,
            ratings_count: 0,
            reviews_count: 0,
            likes_count: 0,
            listens_count: 0,
            wishlist_count: 0
        };

        // Formatowanie wyniku
        stats.avg_score = parseFloat(stats.avg_score || 0).toFixed(2);

        res.json(stats);
    } catch (err) {
        console.error("[Błąd Statystyk]:", err);
        res.status(500).json({ error: 'Błąd statystyk' });
    }
});

// 5. Histogram (Odczyt)
router.get('/album/:albumId/histogram', async (req, res) => {
    try {
        const { albumId } = req.params;
        const [rows] = await pool.execute(`
            SELECT score, COUNT(*) as count
            FROM ratings
            WHERE album_id = ?
            GROUP BY score
            ORDER BY score DESC
        `, [albumId]);

        res.json(rows);
    } catch (err) {
        console.error("[Błąd Histogramu]:", err);
        res.status(500).json({ error: 'Błąd histogramu' });
    }
});

module.exports = router;