require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initializeDatabase } = require('./db'); // Деструктуризация импорта
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

app.use('/api/albums', albumsRoute);
app.use('/api/auth', authRoute);
app.use('/user', userRoutes);
app.use('/user', uploadRoute);

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
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ✅ Этот роут должен быть ПОСЛЕ всех остальных
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


// Добавить явное указание для папки js
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
// Database initialization and server start
async function setupServer() {
    try {
        // Инициализация БД и таблиц
        await initializeDatabase();

        // Проверка соединения
        const conn = await pool.getConnection();
        console.log('✅ Database connection established');
        conn.release();

        // Запуск сервера
        app.listen(port, () => {
            console.log(`🚀 Server running at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Запускаем весь процесс
setupServer();