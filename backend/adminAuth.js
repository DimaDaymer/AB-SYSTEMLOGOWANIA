// backend/adminAuth.js
const authenticate = require('./authMiddleware');

/**
 * Мидлвар для проверки, является ли аутентифицированный пользователь администратором.
 */
function authorizeAdmin(req, res, next) {
    // Мидлвар authenticate уже должен был быть вызван и заполнить req.user
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    next();
}

/**
 * Комбинированный мидлвар: сначала аутентификация, затем авторизация.
 */
module.exports = [authenticate, authorizeAdmin];