//database/init.sql
DROP DATABASE IF EXISTS `melody_rater`;

CREATE DATABASE IF NOT EXISTS mydb;
USE mydb;

CREATE TABLE IF NOT EXISTS albums (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    artist VARCHAR(255),
    release_year INT,
    genre VARCHAR(100)
);

-- users.sql
CREATE TABLE IF NOT EXISTS users (
                       id INT AUTO_INCREMENT PRIMARY KEY,
                       username VARCHAR(50) UNIQUE,
                       email VARCHAR(100) UNIQUE,
                       password_hash VARCHAR(255),
                       profile_pic VARCHAR(255),
                       description TEXT,
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- genres.sql
CREATE TABLE IF NOT EXISTS genres (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(50) UNIQUE,
                        parent_id INT,
                        FOREIGN KEY (parent_id) REFERENCES genres(id)
);

-- album_genres.sql
CREATE TABLE IF NOT EXISTS album_genres (
                              album_id INT,
                              genre_id INT,
                              PRIMARY KEY (album_id, genre_id),
                              FOREIGN KEY (album_id) REFERENCES albums(id),
                              FOREIGN KEY (genre_id) REFERENCES genres(id)
);

ALTER TABLE users
    ADD COLUMN first_name VARCHAR(100),
ADD COLUMN last_name VARCHAR(100),
ADD COLUMN birth_date DATE,
ADD COLUMN gender VARCHAR(20),
ADD COLUMN location VARCHAR(100),
ADD COLUMN country VARCHAR(100),
ADD COLUMN social VARCHAR(255),
ADD COLUMN contact_email VARCHAR(100),
ADD COLUMN music TEXT,
ADD COLUMN movies TEXT;
