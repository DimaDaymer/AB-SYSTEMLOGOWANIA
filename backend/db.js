require('dotenv').config();
const argon2 = require('argon2');
const mysql = require('mysql2/promise');

const baseConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
};

const poolConfig = {
    ...baseConfig,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false,
    dateStrings: true
};

async function initializeDatabase() {
    let connection;
    try {
        connection = await mysql.createConnection(baseConfig);

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'secure_auth'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await connection.query(`USE \`${process.env.DB_NAME || 'secure_auth'}\`;`);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users
            (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                username      VARCHAR(50) UNIQUE     NOT NULL,
                email         VARCHAR(100) UNIQUE    NOT NULL,
                password_hash VARCHAR(255)           NOT NULL,
                created_at    TIMESTAMP                       DEFAULT CURRENT_TIMESTAMP,
                two_factor_secret VARCHAR(255) DEFAULT NULL,
                two_factor_enabled BOOLEAN DEFAULT FALSE,
                failed_attempts INT DEFAULT 0,
                lockout_until TIMESTAMP NULL DEFAULT NULL
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS user_profiles
            (
                user_id       INT PRIMARY KEY,
                first_name    VARCHAR(100),
                last_name     VARCHAR(100),
                profile_pic   VARCHAR(255),
                banner_pic    VARCHAR(255),
                description   TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        `);

        console.log('✅ System bazy danych wyczyszczony i zainicjowany.');
    } catch (error) {
        console.error('❌ Błąd inicjalizacji bazy:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

const pool = mysql.createPool(poolConfig);
module.exports = { initializeDatabase, pool };