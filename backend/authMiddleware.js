//backend/authMiddleware.js
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

module.exports = async function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await pool.execute(
            'SELECT id, username FROM users WHERE id = ?',
            [payload.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        req.user = users[0];
        next();
    } catch (err) {
        console.error('Ошибка аутентификации:', err);
        res.status(401).json({ error: 'Неверный токен' });
    }
};