// backend/server.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initializeDatabase } = require('./db');
const app = express();
const port = process.env.PORT || 3000;

console.log('Środowisko:', process.env.NODE_ENV);
console.log('Baza danych:', process.env.DB_NAME);

app.use(express.json());

// Pliki statyczne Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Pliki publiczne (upload)
const PUBLIC_DIR = path.join(__dirname, 'routes', 'public');
app.use('/public', express.static(PUBLIC_DIR));
const UPLOAD_DIR = path.join(__dirname, 'routes', 'public', 'uploads', 'avatars');
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/img/avatars', express.static(path.join(__dirname, '../frontend/img/avatars')));
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logowanie zapytań
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// ------------------------------------------------
// --- 1. ŚCIEŻKI API (ROUTES) ---
// ------------------------------------------------
const albumsRoute = require('./routes/albums')(pool);
const authRoute = require('./routes/auth');
const userRoutes = require('./routes/user');
const ratingsRoute = require('./routes/ratings');
const actionsRoute = require('./routes/actions');
const trackRatingsRoute = require('./routes/trackRatings')(pool);
const filtersRoute = require('./routes/filters')(pool);
const userListsRoutes = require('./routes/userLists');
const artistRoutes = require('./routes/artist')(pool);
const tagsRouter = require('./routes/tags');
const uploadRoute = require('./routes/upload');
const reviewsRoutes = require('./routes/reviews');
const creditsRoutes = require('./routes/credits')(pool);
const trackRouter = require('./routes/tracks')(pool);
const similarRoutes = require('./routes/similar');
const { router: notificationRoutes } = require('./routes/notifications');
const searchRoute = require('./routes/search')(pool);

app.use('/api/albums', albumsRoute);
app.use('/api/auth', authRoute);
app.use('/api/users', userRoutes);
app.use('/api/ratings', ratingsRoute);
app.use('/api/actions', actionsRoute);
app.use('/api/track-ratings', trackRatingsRoute);
app.use('/api/filters', filtersRoute);
app.use('/api/user-lists', userListsRoutes);
app.use('/api/artist', artistRoutes);
app.use('/api/tags', tagsRouter);
app.use('/api/users/upload', uploadRoute);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/members', creditsRoutes);
app.use('/api/tracks', trackRouter);
app.use('/api/similar', similarRoutes(pool));
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoute);
app.use('/api/search', searchRoute);

// Debugowanie API
app.get('/api/debug/db-check', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT 1 + 1 AS solution');
        res.json({ dbConnected: true, solution: rows[0].solution });
    } catch (error) {
        res.status(500).json({ dbConnected: false, error: error.message });
    }
});

// Obsługa błędów API 404
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint API nie został znaleziony' });
});

// ------------------------------------------------
// --- 2. ŚCIEŻKI HTML (STRONY) ---
// ------------------------------------------------

// == PROFIL UŻYTKOWNIKA (Znormalizowany) ==
// Obsługuje /user/123, /user/daymeeer oraz stary /profile
const serveProfile = (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/profile.html'));
};


app.get('/user/:id', serveProfile); // Teraz jest to główna ścieżka

// Pozostałe strony
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '../frontend/register.html')));
app.get('/add_album.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/add_album.html')));
app.get('/chart-page.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/chart-page.html')));
app.get('/release/album/:slug', (req, res) => res.sendFile(path.join(__dirname, '../frontend/albums.html')));
app.get('/edit_album.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/edit_album.html')));
app.get('/list.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/components/lists/list.html')));
app.get('/global_lists.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/components/lists/global_lists.html')));
app.get('/list/:slug', (req, res) => res.sendFile(path.join(__dirname, '../frontend/components/lists/list.html')));
app.get('/artist/:slug', (req, res) => res.sendFile(path.join(__dirname, '../frontend/artist.html')));
app.get('/track/:trackSlug', (req, res) => res.sendFile(path.join(__dirname, '../frontend/track.html')));

// Catch-all (wszystkie pozostałe zapytania)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Uruchomienie serwera
async function setupServer() {
    try {
        await initializeDatabase();
        app.listen(port, () => {
            console.log(`🚀 Serwer działa pod adresem http://localhost:${port}`);
        });
    } catch (error) {
        console.error('❌ Nie udało się uruchomić serwera:', error);
        process.exit(1);
    }
}
setupServer();