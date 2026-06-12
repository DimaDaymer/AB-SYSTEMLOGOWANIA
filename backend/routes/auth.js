const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const speakeasy = require('speakeasy');
const { pool } = require('../db');
const authenticate = require('../authMiddleware');
const fs = require('fs');
const path = require('path');

let commonPasswords = [];
try {
    const filePath = path.join(__dirname, '../common_passwords.json');
    const data = fs.readFileSync(filePath, 'utf8');
    commonPasswords = JSON.parse(data);
} catch (err) {
    console.error('Błąd wczytywania common_passwords.json');
}

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!password || password.length < 12) return res.status(400).json({ error: 'Hasło min. 12 znaków' });
    if (commonPasswords.includes(password)) return res.status(400).json({ error: 'Hasło zbyt popularne' });

    try {
        const hashedPassword = await argon2.hash(password);
        await pool.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        res.status(201).json({ message: 'Zarejestrowano' });
    } catch (err) { res.status(400).json({ error: 'Użytkownik istnieje' }); }
});

router.post('/login', async (req, res) => {
    const { username, password, totpToken } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) return res.status(401).json({ error: 'Błędne dane' });
        const user = users[0];

        if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
            const remainingMs = new Date(user.lockout_until) - new Date();
            const remainingMinutes = Math.ceil(remainingMs / 60000);
            return res.status(403).json({
                error: `Konto zablokowane. Spróbuj ponownie za ${remainingMinutes} min.`
            });
        }

        const valid = await argon2.verify(user.password_hash, password);
        if (!valid) {
            const newAttempts = (user.failed_attempts || 0) + 1;
            if (newAttempts >= 5) {
                const lockout = new Date(Date.now() + 15 * 60000);
                await pool.execute('UPDATE users SET failed_attempts = ?, lockout_until = ? WHERE id = ?', [newAttempts, lockout, user.id]);
                return res.status(403).json({ error: 'Blokada 15 min' });
            }
            await pool.execute('UPDATE users SET failed_attempts = ? WHERE id = ?', [newAttempts, user.id]);
            return res.status(401).json({ error: 'Błędne dane' });
        }

        await pool.execute('UPDATE users SET failed_attempts = 0, lockout_until = NULL WHERE id = ?', [user.id]);

        if (user.two_factor_enabled) {
            if (!totpToken) return res.status(206).json({ message: '2FA' });
            const verified = speakeasy.totp.verify({ secret: user.two_factor_secret, encoding: 'base32', token: totpToken, window: 1 });
            if (!verified) return res.status(401).json({ error: 'Kod 2FA błędny' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) { res.status(500).json({ error: 'Błąd serwera' }); }
});

router.post('/2fa/setup', authenticate, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({ name: `SecureApp:${req.user.username}` });
        await pool.execute('UPDATE users SET two_factor_secret = ? WHERE id = ?', [secret.base32, req.user.id]);
        res.json({ secret: secret.base32, otpauth_url: secret.otpauth_url });
    } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

router.post('/2fa/verify', authenticate, async (req, res) => {
    const { token } = req.body;
    try {
        const [users] = await pool.execute('SELECT two_factor_secret FROM users WHERE id = ?', [req.user.id]);
        const isValid = speakeasy.totp.verify({ secret: users[0].two_factor_secret, encoding: 'base32', token, window: 1 });
        if (isValid) {
            await pool.execute('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.user.id]);
            res.json({ success: true });
        } else res.status(400).json({ error: 'Kod błędny' });
    } catch (err) { res.status(500).json({ error: 'Błąd' }); }
});

router.post('/2fa/disable', authenticate, async (req, res) => {
    try {
        await pool.execute('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?', [req.user.id]);
        res.json({ success: true, message: '2FA zostało wyłączone' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd podczas wyłączania 2FA' });
    }
});

module.exports = router;