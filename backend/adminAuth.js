// backend/adminAuth.js
const authenticate = require('./authMiddleware');

function authorizeAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Dostęp zabroniony. Wymagane uprawnienia administratora.' });
    }
    next();
}

module.exports = [authenticate, authorizeAdmin];