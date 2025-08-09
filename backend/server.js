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
app.use(express.static(path.join(__dirname, '../frontend')));

// Настройка CORS для маршрутов API
app.use(cors({
    origin: '*', // Разрешаем все источники временно
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Импортируем маршруты и передаем им объект pool
const albumsRoute = require('./routes/albums')(pool);
const authRoute = require('./routes/auth');
const userRoutes = require('./routes/user');
const uploadRoute = require('./routes/upload');
const ratingsRoute = require('./routes/ratings');
const actionsRoute = require('./routes/actions');
const trackRatingsRoute = require('./routes/trackRatings');
const genresRoute = require('./routes/genres');

app.use('/api/track-ratings', trackRatingsRoute);
app.use('/api/albums', albumsRoute);
app.use('/api/auth', authRoute);
app.use('/user', userRoutes);
app.use('/user', uploadRoute);
app.use('/api/ratings', ratingsRoute);
app.use('/api/actions', actionsRoute);
app.use('/api/genres', genresRoute);

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

app.get('/release/album/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/albums.html'));
});

app.get('/edit_album.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/edit_album.html'));
});

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));

// Middleware для логирования запросов
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// Роут для проверки базы данных
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

// Отправка index.html для всех остальных запросов
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Проверка подключения к базе данных
pool.query('SELECT 1')
    .then(() => console.log('✅ DB connection verified'))
    .catch(err => {
        console.error('❌ DB connection failed:', err);
        process.exit(1);
    });

// Запуск сервера
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