require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, initializeDatabase } = require('./db');
const app = express();
const port = process.env.PORT || 3000;
const path = require('path');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

const authRoute = require('./routes/auth');
const userRoutes = require('./routes/user');

app.use('/api/auth', authRoute);
app.use('/api/users', userRoutes);

app.get('/api/health', async (req, res) => {
    try {
        await pool.execute('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint API nie został znaleziony' });
});

async function startServer() {
    try {
        await initializeDatabase();
        app.listen(port, () => {
            console.log(`Serwer bezpieczeństwa działa na http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Nie udało się uruchomić serwera:', error);
        process.exit(1);
    }
}

startServer();