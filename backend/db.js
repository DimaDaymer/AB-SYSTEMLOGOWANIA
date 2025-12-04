require('dotenv').config();
const mysql = require('mysql2/promise');

// === КОНФИГУРАЦИЯ БАЗЫ ДАННЫХ ===
const baseConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
};

// Конфигурация для *пула* (С 'init')
const poolConfig = {
    ...baseConfig,
    database: process.env.DB_NAME || 'melody_rater',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
};

async function initializeDatabase() {
    let connection;
    try {
        // Создаем подключение, используя ТОЛЬКО baseConfig.
        connection = await mysql.createConnection(baseConfig);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
        await connection.query(`USE \`${process.env.DB_NAME}\`;`);

        // === УСТАНОВКА SQL РЕЖИМА ДЛЯ ТЕКУЩЕГО СОЕДИНЕНИЯ ===
        await connection.query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''));");

        // === 1. ПОЛЬЗОВАТЕЛИ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                                                 id INT AUTO_INCREMENT PRIMARY KEY,
                                                 username VARCHAR(50) UNIQUE NOT NULL,
                                                 email VARCHAR(100) UNIQUE NOT NULL,
                                                 password_hash VARCHAR(255) NOT NULL,
                                                 role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
                                                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_profiles (
                                                         user_id INT PRIMARY KEY,
                                                         profile_pic VARCHAR(255),
                                                         description TEXT,
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
                                                         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // === 2. АРТИСТЫ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS artists (
                                                   id INT AUTO_INCREMENT PRIMARY KEY,
                                                   name VARCHAR(255) UNIQUE NOT NULL,
                                                   slug VARCHAR(255) UNIQUE NOT NULL,
                                                   bio TEXT,
                                                   image_url VARCHAR(255),
                                                   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // === 3. СПРАВОЧНИКИ ===

        await connection.query(`
            CREATE TABLE IF NOT EXISTS genres (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  name VARCHAR(100) UNIQUE NOT NULL,
                                                  description TEXT,
                                                  slug VARCHAR(100) UNIQUE NOT NULL
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS release_formats (
                                                           id INT AUTO_INCREMENT PRIMARY KEY,
                                                           name VARCHAR(50) UNIQUE NOT NULL,
                                                           description TEXT
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS release_attributes (
                                                              id INT AUTO_INCREMENT PRIMARY KEY,
                                                              name VARCHAR(100) UNIQUE NOT NULL,
                                                              description TEXT
            );
        `);


        // === 4. АЛЬБОМЫ ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS albums (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  title VARCHAR(255) NOT NULL,
                                                  slug VARCHAR(255) UNIQUE NOT NULL,
                                                  release_date DATE,
                                                  cover_url VARCHAR(255),
                                                  release_format_id INT,
                                                  genres TEXT, /* Храним жанры как строку для простоты */
                                                  description TEXT, /* Храним дескрипторы как строку */
                                                  label VARCHAR(255),
                                                  language VARCHAR(100),
                                                  added_by_user_id INT,
                                                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                                  FOREIGN KEY (release_format_id) REFERENCES release_formats(id) ON DELETE SET NULL,
                                                  FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL
            );
        `);

        // Связь многие-ко-многим для артистов и альбомов
        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_artists (
                                                         album_id INT NOT NULL,
                                                         artist_id INT NOT NULL,
                                                         PRIMARY KEY (album_id, artist_id),
                                                         FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                         FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
            );
        `);

        // Связь для атрибутов релиза
        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_release_attributes (
                                                                    album_id INT NOT NULL,
                                                                    attribute_id INT NOT NULL,
                                                                    PRIMARY KEY (album_id, attribute_id),
                                                                    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                                    FOREIGN KEY (attribute_id) REFERENCES release_attributes(id) ON DELETE CASCADE
            );
        `);

        // Ссылки на стриминговые сервисы и магазины
        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_links (
                                                       id INT AUTO_INCREMENT PRIMARY KEY,
                                                       album_id INT NOT NULL,
                                                       platform_name VARCHAR(100) NOT NULL,
                                                       url VARCHAR(255) NOT NULL,
                                                       FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            );
        `);

        // Треклист
        await connection.query(`
            CREATE TABLE IF NOT EXISTS tracks (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  album_id INT NOT NULL,
                                                  track_number INT NOT NULL,
                                                  title VARCHAR(255) NOT NULL,
                                                  duration TIME,
                                                  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                  UNIQUE KEY unique_track (album_id, track_number)
            );
        `);

        // === 5. СТАТИСТИКА И ДЕЙСТВИЯ ===

        // Сводная таблица статистики альбомов
        await connection.query(`
            CREATE TABLE IF NOT EXISTS album_stats (
                                                       album_id INT PRIMARY KEY,
                                                       avg_score DECIMAL(3, 2) DEFAULT 0.00,
                                                       ratings_count INT DEFAULT 0,
                                                       reviews_count INT DEFAULT 0,
                                                       likes_count INT DEFAULT 0,
                                                       in_lists_count INT DEFAULT 0,
                                                       wishlist_count INT DEFAULT 0,
                                                       current_rank INT,
                                                       chart_slug VARCHAR(255),
                                                       FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            );
        `);

        // Оценки альбомов
        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_album_ratings (
                                                              user_id INT NOT NULL,
                                                              album_id INT NOT NULL,
                                                              score DECIMAL(2, 1) NOT NULL,
                                                              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                                              PRIMARY KEY (user_id, album_id),
                                                              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                              FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            );
        `);

        // Отметки действий (Прослушано, Лайк, Вишлист, Теги)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_album_actions (
                                                              id INT AUTO_INCREMENT PRIMARY KEY,
                                                              user_id INT NOT NULL,
                                                              album_id INT NOT NULL,
                                                              action_type ENUM('listen', 'wishlist', 'like', 'add-to-list', 'tags') NOT NULL,
                                                              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                              UNIQUE KEY unique_action (user_id, album_id, action_type),
                                                              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                              FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            );
        `);

        // === 6. СПИСКИ ПОЛЬЗОВАТЕЙ (Lists) ===
        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_lists (
                                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                                      user_id INT NOT NULL,
                                                      title VARCHAR(255) NOT NULL,
                                                      slug VARCHAR(255) NOT NULL,
                                                      description TEXT,
                                                      is_public BOOLEAN DEFAULT TRUE,
                                                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                                      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                      UNIQUE KEY unique_list_slug (user_id, slug)
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS list_items (
                                                      list_id INT NOT NULL,
                                                      album_id INT NOT NULL,
                                                      item_order INT NOT NULL,
                                                      comment TEXT,
                                                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                      PRIMARY KEY (list_id, album_id),
                                                      FOREIGN KEY (list_id) REFERENCES user_lists(id) ON DELETE CASCADE,
                                                      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
            );
        `);

        /* Добавление таблиц для отслеживания (Followers) и уведомлений */
        await connection.query(`
            CREATE TABLE IF NOT EXISTS followers (
                                                     follower_id INT NOT NULL,
                                                     followed_id INT NOT NULL,
                                                     is_new_notification BOOLEAN DEFAULT TRUE, /* Для уведомлений */
                                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                     UNIQUE KEY unique_follow (follower_id, followed_id),
                                                     FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
                                                     FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                                                         id INT AUTO_INCREMENT PRIMARY KEY,
                                                         user_id INT NOT NULL, /* Получатель */
                                                         sender_id INT, /* Отправитель (если есть) */
                                                         type ENUM('new_follow', 'new_comment', 'list_update') NOT NULL,
                                                         content TEXT NOT NULL,
                                                         is_read BOOLEAN DEFAULT FALSE,
                                                         related_slug VARCHAR(255),
                                                         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                         FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
            );
        `);

    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

const pool = mysql.createPool(poolConfig);

pool.on('connection', async (conn) => {
    try {
        await conn.promise().query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''));");
    } catch (err) {
        console.error('❌ Failed to set SQL mode for new connection:', err);
    }
});

module.exports = {
    initializeDatabase,
    pool
};