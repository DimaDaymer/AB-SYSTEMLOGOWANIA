require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initializeDatabase } = require('./db');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
const albumsRoute = require('./routes/albums');
const authRoute = require('./routes/auth');
const userRoutes = require('./routes/user');
const uploadRoute = require('./routes/upload');
const ratingsRoute = require('./routes/ratings'); // Добавлен роут для оценок
const actionsRoute = require('./routes/actions');
// Добавьте в секцию Routes
const trackRatingsRoute = require('./routes/trackRatings');

// Подключите роуты
app.use('/api/track-ratings', trackRatingsRoute);
app.use('/api/albums', albumsRoute);
app.use('/api/auth', authRoute);
app.use('/user', userRoutes);
app.use('/user', uploadRoute);
app.use('/api/ratings', ratingsRoute); // Подключение роутов оценок
app.use('/api/actions', actionsRoute);

// Serve HTML files
app.get('/add_album.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/add_album.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/profile.html'));
});

app.get('/new_releases.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/new_releases.html'));
});

// Serve album pages
app.get('/release/album/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/albums.html'));
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Database initialization and server start
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