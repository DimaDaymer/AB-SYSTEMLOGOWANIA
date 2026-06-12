const jwt = require('jsonwebtoken');
const { pool } = require('./db');

module.exports = async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Wymagana autoryzacja' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await pool.execute(
            'SELECT id, username FROM users WHERE id = ?',
            [payload.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Użytkownik nie istnieje' });
        }

        req.user = users[0];
        next();
    } catch (err) {
        res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
    }
};