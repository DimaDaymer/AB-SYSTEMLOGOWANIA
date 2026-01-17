const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Wszystkie pola (nazwa użytkownika, e-mail, hasło) są wymagane.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Hasło musi mieć co najmniej 6 znaków.' });
        }

        if (!/\S+@\S+\.\S+/.test(email)) {
            return res.status(400).json({ error: 'Nieprawidłowy format adresu e-mail.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.execute(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, 'user']
        );

        res.status(201).json({ message: 'Użytkownik zarejestrowany pomyślnie' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Nazwa użytkownika lub adres e-mail już istnieje' });
        }
        console.error('Błąd rejestracji:', err);
        res.status(500).json({ error: 'Rejestracja nie powiodła się' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Nazwa użytkownika i hasło są wymagane do logowania.' });
        }

        const [users] = await pool.execute(
            'SELECT id, username, password_hash, role FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Nieprawidłowe dane logowania' });
        }

        const user = users[0];
        const { password_hash: storedHash } = user;
        const validPassword = await bcrypt.compare(password, storedHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Nieprawidłowe dane logowania' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, role: user.role });
    } catch (err) {
        console.error('Błąd logowania:', err);
        res.status(500).json({ error: 'Logowanie nie powiodło się' });
    }
});

module.exports = router;