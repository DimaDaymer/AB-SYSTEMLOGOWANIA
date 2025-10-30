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

        await connection.query(`
            CREATE TABLE IF NOT EXISTS albums (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                artist VARCHAR(255) NOT NULL,
                release_date VARCHAR(100),
                cover_url VARCHAR(255),
                type VARCHAR(50),
                genres VARCHAR(255),
                label VARCHAR(255),
                language VARCHAR(50),
                description TEXT,
                slug VARCHAR(255) UNIQUE NOT NULL,
                likes INT DEFAULT 0,
                wishlist_count INT DEFAULT 0,
                in_lists_count INT DEFAULT 0,
                reviews_count INT DEFAULT 0,
                popularity INT DEFAULT 0,
                avg_rating DECIMAL(3,2) DEFAULT NULL,
                rating_count INT DEFAULT 0
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_lists (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                slug VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_list_albums (
                id INT AUTO_INCREMENT PRIMARY KEY,
                list_id INT NOT NULL,
                album_id INT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sort_order INT,
                FOREIGN KEY (list_id) REFERENCES user_lists(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                UNIQUE KEY unique_list_album (list_id, album_id)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_album_actions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                album_id INT NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                UNIQUE (user_id, album_id, action_type)
            );
        `);


        await connection.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                album_id INT NOT NULL,
                title VARCHAR(255),
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                UNIQUE KEY unique_review (user_id, album_id)
            );
        `);

        // ... (после CREATE TABLE IF NOT EXISTS albums)

        await connection.query(`
            CREATE TABLE IF NOT EXISTS tracks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                album_id INT NOT NULL,
                track_number INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                duration VARCHAR(50),
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                UNIQUE KEY unique_track_in_album (album_id, track_number)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS ratings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                album_id INT NOT NULL,
                score DECIMAL(3, 1) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_album_rating (user_id, album_id)
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
    initializeDatabase,
    pool
};