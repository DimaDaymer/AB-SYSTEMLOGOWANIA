// backend/routes/notifications.js
const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware');
const { pool } = require('../db');

/**
 * Uniwersalna funkcja tworzenia powiadomienia
 * Format treści obsługuje teraz linki wewnątrz tekstu: [Tekst](Link)
 */
const createNotification = async (recipientId, senderId, type, content, slug = null) => {
    try {
        // Nie powiadamiamy samego siebie (z wyjątkiem nowych wydań)
        if (recipientId == senderId && type !== 'new_release') return;

        await pool.execute(
            `INSERT INTO notifications (user_id, sender_id, type, content, related_slug)
             VALUES (?, ?, ?, ?, ?)`,
            [recipientId, senderId, type, content, slug]
        );
    } catch (err) {
        console.error("Błąd pomocnika powiadomień (Notification Helper):", err);
    }
};

// Pobieranie listy powiadomień użytkownika
router.get('/my', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT n.*, u.username as sender_username, p.profile_pic as sender_pic
            FROM notifications n
                     LEFT JOIN users u ON n.sender_id = u.id
                     LEFT JOIN user_profiles p ON n.sender_id = p.user_id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC LIMIT 50
        `, [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

// Oznacz wszystkie powiadomienia jako przeczytane
router.post('/read-all', authenticate, async (req, res) => {
    try {
        await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

module.exports = {
    router,
    createNotification
};