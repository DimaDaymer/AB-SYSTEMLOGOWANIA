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

        // Создаем и выбираем базу данных
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
        await connection.query(`USE \`${process.env.DB_NAME}\`;`);

        // === 1. ПОЛЬЗОВАТЕЛИ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
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
                movies TEXT,
                role ENUM('user', 'admin') NOT NULL DEFAULT 'user'
            );
        `);

        // === 2. СПРАВОЧНИКИ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS genres (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS credit_roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE
            );
        `);

        // === 3. АРТИСТЫ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS artists (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                slug VARCHAR(255) UNIQUE NOT NULL,
                bio TEXT,
                picture_url VARCHAR(255),
                formed_year VARCHAR(10),
                origin_country VARCHAR(100),
                description TEXT,
                albums_count INT DEFAULT 0,
                followers_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS artist_genres (
                artist_id INT NOT NULL,
                genre_id INT NOT NULL,
                PRIMARY KEY (artist_id, genre_id),
                FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
            );
        `);

        // === 4. АЛЬБОМЫ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS albums (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                artist_id INT,
                release_date DATE,
                cover_url VARCHAR(255),
                format ENUM('Album', 'EP', 'Mixtape', 'Single', 'Compilation', 'Live'),
                language VARCHAR(50),
                description TEXT,
                slug VARCHAR(255) UNIQUE NOT NULL,
                tracks_count INT DEFAULT 0,
                total_duration INT DEFAULT 0,
                avg_score DECIMAL(3, 2) DEFAULT 0.00,
                ratings_count INT DEFAULT 0,
                reviews_count INT DEFAULT 0,
                current_rank INT DEFAULT NULL,
                chart_slug VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_genres (
                album_id INT,
                genre_id INT,
                PRIMARY KEY (album_id, genre_id),
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_artists (
                album_id INT NOT NULL,
                artist_id INT NOT NULL,
                is_main BOOLEAN DEFAULT TRUE,
                PRIMARY KEY (album_id, artist_id),
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
            );
        `);

        // === 5. ТРЕКИ ===
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

        // === 6. КРЕДИТЫ (УЧАСТНИКИ) ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_credits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                album_id INT NOT NULL,
                artist_id INT NOT NULL,
                role_id INT,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES credit_roles(id) ON DELETE SET NULL
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS track_credits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                track_id INT NOT NULL,
                artist_id INT NOT NULL,
                role_id INT,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES credit_roles(id) ON DELETE SET NULL
            );
        `);

        // === 7. ОЦЕНКИ (РЕЙТИНГИ) ===
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

        await connection.query(`
            CREATE TABLE IF NOT EXISTS track_ratings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                track_id INT NOT NULL,
                score DECIMAL(3, 1) NOT NULL CHECK (score BETWEEN 0.5 AND 5.0),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY (user_id, track_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );
        `);

        // === 8. ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ И СПИСКИ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_album_tags (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                album_id INT NOT NULL,
                tag_name VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_tag (user_id, album_id, tag_name)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_album_actions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                album_id INT NOT NULL,
                action_type ENUM('listen', 'wishlist', 'like', 'add-to-list') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_album_action (user_id, album_id, action_type),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS lists (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS list_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                list_id INT NOT NULL,
                album_id INT NOT NULL,
                sort_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                UNIQUE (list_id, album_id)
            );
        `);

        // === 9. РЕЦЕНЗИИ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                album_id INT NOT NULL,
                title VARCHAR(255),
                content TEXT NOT NULL,
                parent_id INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_id) REFERENCES reviews(id) ON DELETE CASCADE
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS review_votes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                review_id INT NOT NULL,
                vote_type ENUM('like', 'dislike') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_review_vote (user_id, review_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
            );
        `);

        console.log('✅ Database initialized successfully matching init.sql');
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