/**
 * Oblicza parametry paginacji na podstawie żądania (request).
 * @param {Object} req - Obiekt żądania Express.
 * @param {number} defaultLimit - Domyślna liczba elementów na stronę (domyślnie: 20).
 * @param {number} maxLimit - Opcjonalny limit maksymalny, aby zapobiec ogromnym zapytaniom (domyślnie: 100).
 * @returns {Object} { page, limit, offset }
 */
const getPagination = (req, defaultLimit = 20, maxLimit = 100) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    let limit = Math.max(1, parseInt(req.query.limit, 10) || defaultLimit);

    // Opcjonalnie: ogranicz limit, aby zapobiec przeciążeniu serwera
    if (limit > maxLimit) limit = maxLimit;

    const offset = (page - 1) * limit;

    return { page, limit, offset };
};

/**
 * Generuje standardowy obiekt metadanych dla odpowiedzi z paginacją.
 * @param {number} total - Całkowita liczba elementów.
 * @param {number} page - Aktualna strona.
 * @param {number} limit - Liczba elementów na stronę.
 * @returns {Object} { total, page, limit, total_pages }
 */
const getMeta = (total, page, limit) => {
    return {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1
    };
};

module.exports = { getPagination, getMeta };