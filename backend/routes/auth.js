// backend/routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // *** ДОБАВЛЕННЫЙ КОД: Валидация ввода ***
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields (username, email, password) are required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        // Базовая проверка формата email (можно улучшить более сложным RegEx)
        if (!/\S+@\S+\.\S+/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }
        // *** КОНЕЦ ДОБАВЛЕННОГО КОДА ***

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );

        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        console.error(err);
        // *** ИЗМЕНЕННЫЙ КОД: Обработка конфликта (дублирование) ***
        if (err.code === 'ER_DUP_ENTRY') {
            // Код ошибки MySQL для дублирующейся записи
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});


router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // *** ДОБАВЛЕННЫЙ КОД: Валидация логина ***
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required for login.' });
        }
        // *** КОНЕЦ ДОБАВЛЕННОГО КОДА ***

        const [users] = await pool.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, users[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Увеличено время жизни токена до 7 дней
        const token = jwt.sign(
            { id: users[0].id, username: users[0].username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, username: users[0].username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

module.exports = router;