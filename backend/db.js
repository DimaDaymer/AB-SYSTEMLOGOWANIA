//backend/db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function initializeDatabase() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT || 3306
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
        await connection.query(`USE \`${process.env.DB_NAME}\`;`);

        // ✅ Создание таблицы users с полями профиля
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE,
                email VARCHAR(100) UNIQUE,
                password_hash VARCHAR(255),
                profile_pic VARCHAR(255),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                birth_date DATE,
                gender VARCHAR(20),
                location VARCHAR(100),
                country VARCHAR(100),
                social VARCHAR(255),
                contact_email VARCHAR(100),
                music TEXT,
                movies TEXT
            );
        `);

        // ✅ Создание таблицы albums
        await connection.query(`
            CREATE TABLE IF NOT EXISTS albums (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                artist VARCHAR(255) NOT NULL,
                release_year INT,
                genre VARCHAR(100)
            );
        `);

        // ✅ Создание таблицы ratings
        await connection.query(`
            CREATE TABLE IF NOT EXISTS ratings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                album_id INT NOT NULL,
                score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_rating (user_id, album_id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (album_id) REFERENCES albums(id)
            );
        `);

        // ✅ Таблица жанров
        await connection.query(`
            CREATE TABLE IF NOT EXISTS genres (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL
            );
        `);

        // ✅ Связь альбомов и жанров
        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_genres (
                album_id INT,
                genre_id INT,
                PRIMARY KEY (album_id, genre_id),
                FOREIGN KEY (album_id) REFERENCES albums(id),
                FOREIGN KEY (genre_id) REFERENCES genres(id)
            );
        `);

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = {
    pool,
    initializeDatabase
};
