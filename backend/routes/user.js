const express = require('express');
const router = express.Router();
const authenticate = require('../authMiddleware');
const { pool } = require('../db');
const multer = require('multer');
const argon2 = require('argon2');
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

router.get('/me', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT u.id, u.username, u.email, u.two_factor_enabled,
                   p.first_name, p.last_name, p.profile_pic, p.banner_pic, p.description
            FROM users u
                     LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE u.id = ?
        `, [req.user.id]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});


router.put('/update', authenticate, async (req, res) => {
    const { first_name, last_name, description } = req.body;
    try {
        await pool.execute(`
            INSERT INTO user_profiles (user_id, first_name, last_name, description)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            first_name = VALUES(first_name), 
            last_name = VALUES(last_name), 
            description = VALUES(description)
        `, [req.user.id, first_name, last_name, description]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Błąd aktualizacji profilu' });
    }
});

router.post('/upload-avatar', authenticate, upload.single('avatar'), async (req, res) => {
    try {
        const filePath = `/uploads/${req.file.filename}`;
        await pool.execute(`
            INSERT INTO user_profiles (user_id, profile_pic)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE profile_pic = VALUES(profile_pic)
        `, [req.user.id, filePath]);

        res.json({ url: filePath });
    } catch (err) {
        res.status(500).json({ error: 'Błąd uploadu' });
    }
});

router.post('/upload-banner', authenticate, upload.single('banner'), async (req, res) => {
    try {
        const filePath = `/uploads/${req.file.filename}`;
        await pool.execute(`
            INSERT INTO user_profiles (user_id, banner_pic)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE banner_pic = VALUES(banner_pic)
        `, [req.user.id, filePath]);
        res.json({ url: filePath });
    } catch (err) { res.status(500).json({ error: 'Błąd uploadu bannera' }); }
});

let commonPasswords = [];
try {
    const filePath = path.join(__dirname, '../common_passwords.json');
    commonPasswords = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
    console.error('Błąd wczytywania czarnej listy haseł');
}

router.put('/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    try {
        const [users] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        const user = users[0];

        const validPassword = await argon2.verify(user.password_hash, currentPassword);
        if (!validPassword) {
            return res.status(401).json({ error: 'Aktualne hasło jest nieprawidłowe' });
        }

        if (newPassword.length < 12) {
            return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 12 znaków' });
        }

        if (commonPasswords.includes(newPassword.toLowerCase())) {
            return res.status(400).json({ error: 'To hasło jest zbyt popularne. Wybierz inne.' });
        }

        const hashedNewPassword = await argon2.hash(newPassword);
        await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashedNewPassword, req.user.id]);

        res.json({ success: true, message: 'Hasło zostało zmienione' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd serwera podczas zmiany hasła' });
    }
});

module.exports = router;