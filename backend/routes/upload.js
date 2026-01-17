// backend/routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

// Ścieżka do folderu z awatarami w frontendzie
const UPLOADS_DIR = path.join(__dirname, '../../frontend/img/avatars');

// Tworzenie folderu, jeśli nie istnieje
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit rozmiaru pliku: 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Dozwolone są tylko obrazy'), false);
        }
    }
});

// Ścieżka: POST /api/upload/avatar
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nie przesłano żadnego pliku' });
        }

        const userId = req.user.id;
        // Ścieżka do zapisu w bazie danych (względem katalogu głównego witryny)
        const fileUrl = `/img/avatars/${req.file.filename}`;

        // Aktualizacja profilu użytkownika
        const sql = `
            INSERT INTO user_profiles (user_id, profile_pic)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE profile_pic = VALUES(profile_pic)
        `;
        await pool.execute(sql, [userId, fileUrl]);

        res.json({ success: true, url: fileUrl });
    } catch (err) {
        console.error('Błąd przesyłania:', err);
        res.status(500).json({ error: 'Błąd bazy danych' });
    }
});

module.exports = router;