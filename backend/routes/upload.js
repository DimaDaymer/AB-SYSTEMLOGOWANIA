// backend/routes/upload.js
const express = require('express');
const router = express.Router();
const upload = require('../upload'); // make sure this exists and exports multer middleware
const authenticate = require('../authMiddleware');
const { pool } = require('../db');
const path = require('path');

router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
    try {
        const filePath = `/uploads/avatars/${req.file.filename}`;
        await pool.execute('UPDATE users SET profile_pic = ? WHERE username = ?', [
            filePath,
            req.user.username
        ]);
        res.json({ success: true, url: filePath });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

module.exports = router;
