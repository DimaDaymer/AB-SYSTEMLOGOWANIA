// backend/authMiddleware.js
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

module.exports = async function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Wymagana autoryzacja' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await pool.execute(
            'SELECT id, username, role FROM users WHERE id = ?',
            [payload.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Użytkownik nie został znaleziony' });
        }

        req.user = users[0];
        next();
    } catch (err) {
        console.error('Błąd uwierzytelniania:', err);
        res.status(401).json({ error: 'Nieprawidłowy token' });
    }
};