const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pool } = require('../db');
const authenticate = require('../authMiddleware');

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads', 'avatars');

// === 1. НАСТРОЙКА ХРАНИЛИЩА (MULTER) ===
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Используем полный путь для надежности
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files (jpg, png, gif, webp) are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Лимит 5MB
    fileFilter: fileFilter
});

// === 2. РОУТ ЗАГРУЗКИ АВАТАРА ===
router.post('/avatar', authenticate, (req, res, next) => {
    // Используем функцию-обертку, чтобы поймать ошибки Multer
    upload.single('avatar')(req, res, async (err) => {
        try {
            if (err instanceof multer.MulterError || (err && err.message.includes('Only image files'))) {
                console.error('Multer Error:', err.message);
                return res.status(400).json({ error: err.message });
            }
            if (err) {
                throw err;
            }

            if (!req.user || !req.user.id) {
                return res.status(401).json({ error: 'Authentication failed' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const userId = req.user.id;
            const fileUrl = `/uploads/${req.file.filename}`;

            // === SQL-ЗАПРОС ===
            const sql = `
                INSERT INTO user_profiles (user_id, profile_pic)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE profile_pic = VALUES(profile_pic)
            `;

            await pool.execute(sql, [userId, fileUrl]);

            res.json({ success: true, url: fileUrl });

        } catch (err) {
            console.error('Upload error (Database/General):', err);
            res.status(500).json({ error: 'Internal server error during upload' });
        }
    });
});

module.exports = router;