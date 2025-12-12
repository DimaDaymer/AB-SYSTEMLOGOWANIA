// backend/server.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initializeDatabase } = require('./db');
const app = express();
const port = process.env.PORT || 3000;

console.log('Environment:', process.env.NODE_ENV);
console.log('Database:', process.env.DB_NAME);
console.log('JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');

app.use(express.json());
// Статическая раздача файлов фронтенда
app.use(express.static(path.join(__dirname, '../frontend')));
const PUBLIC_DIR = path.join(__dirname, 'routes', 'public');
app.use('/public', express.static(PUBLIC_DIR));
const UPLOAD_DIR = path.join(__dirname, 'routes', 'public', 'uploads', 'avatars');

app.use('/uploads', express.static(UPLOAD_DIR));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

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
const creditsRoutes = require('./routes/credits');
const membersRouter = require('./routes/members')(pool);
const trackRouter = require('./routes/tracks')(pool);


// --- ИСПОЛЬЗОВАНИЕ РОУТОВ ---
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
app.use('/api/credits', creditsRoutes(pool));
app.use('/api/members', membersRouter);
app.use('/api/tracks', trackRouter);

app.get('/add_album.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/add_album.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

// Маршрут для "Мой профиль"
app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/profile.html'));
});

app.get('/user/:username', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/profile.html'));
});

app.get('/chart-page.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/chart-page.html'));
});

app.get('/release/album/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/albums.html'));
});

app.get('/edit_album.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/edit_album.html'));
});

app.get('/list.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/components/lists/list.html'));
});

app.get('/global_lists.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/components/lists/global_lists.html'));
});

app.get('/list/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/components/lists/list.html'));
});

app.get('/artist/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/artist.html'));
});

app.get('/track/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/track.html'));
});

app.get('/credits-tab.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/components/albums/credits.html'));
});

app.use('/uploads', express.static('uploads'));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));

app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

app.get('/api/debug/db-check', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT 1 + 1 AS solution');
        res.json({
            dbConnected: true,
            solution: rows[0].solution,
            albumsCount: (await pool.execute('SELECT COUNT(*) FROM albums'))[0][0]['COUNT(*)']
        });
    } catch (error) {
        res.status(500).json({ dbConnected: false, error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

pool.query('SELECT 1')
    .then(() => console.log('✅ DB connection verified'))
    .catch(err => {
        console.error('❌ DB connection failed:', err);
        process.exit(1);
    });

async function setupServer() {
    try {
        await initializeDatabase();
        const conn = await pool.getConnection();
        console.log('✅ Database connection established');
        conn.release();
        app.listen(port, () => {
            console.log(`🚀 Server running at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
setupServer();