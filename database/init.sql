DROP DATABASE IF EXISTS `melody_rater`;
CREATE DATABASE melody_rater;
USE melody_rater;

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

CREATE TABLE IF NOT EXISTS albums (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      title VARCHAR(255) NOT NULL,
    -- СТОЛБЕЦ 'artist' УДАЛЕН. Теперь он в таблице 'album_artists'.
                                      release_date VARCHAR(100),
                                      cover_url VARCHAR(255),
                                      type VARCHAR(50),
                                      genres VARCHAR(255),
                                      label VARCHAR(255),
                                      language VARCHAR(50),
                                      description VARCHAR(250),
                                      slug VARCHAR(255) UNIQUE NOT NULL,
                                      likes INT DEFAULT 0,
                                      wishlist_count INT DEFAULT 0,
                                      in_lists_count INT DEFAULT 0,
                                      reviews_count INT DEFAULT 0
);

-- Таблица для хранения треков
CREATE TABLE IF NOT EXISTS tracks (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      album_id INT NOT NULL,
                                      track_number INT NOT NULL,
                                      title VARCHAR(255) NOT NULL,
                                      duration VARCHAR(50), -- Например, '3:45'
                                      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                      UNIQUE KEY unique_track_in_album (album_id, track_number)
);

-- Таблица для хранения оценок альбомов
CREATE TABLE IF NOT EXISTS ratings (
                                       id INT AUTO_INCREMENT PRIMARY KEY,
                                       user_id INT NOT NULL,
                                       album_id INT NOT NULL,
                                       score DECIMAL(3, 1) NOT NULL, -- Оценка, например, 5.0, 4.5
                                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                       FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                       UNIQUE KEY unique_user_album_rating (user_id, album_id) -- Один пользователь = одна оценка
);

CREATE TABLE IF NOT EXISTS track_ratings (
                                             id INT AUTO_INCREMENT PRIMARY KEY,
                                             user_id INT NOT NULL,
                                             track_id INT NOT NULL,
                                             rating FLOAT NOT NULL CHECK (rating BETWEEN 0.5 AND 5.0),
                                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                             updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                             UNIQUE KEY (user_id, track_id),
                                             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                             FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS genres (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS album_genres (
                                            album_id INT,
                                            genre_id INT,
                                            PRIMARY KEY (album_id, genre_id),
                                            FOREIGN KEY (album_id) REFERENCES albums(id),
                                            FOREIGN KEY (genre_id) REFERENCES genres(id)
);

-- Таблица для хранения действий пользователей с альбомами
CREATE TABLE IF NOT EXISTS user_album_actions (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  user_id INT NOT NULL,
                                                  album_id INT NOT NULL,
                                                  action_type ENUM('listen', 'wishlist', 'like', 'add-to-list') NOT NULL,
                                                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                  UNIQUE KEY unique_user_album_action (user_id, album_id, action_type),
                                                  FOREIGN KEY (user_id) REFERENCES users(id),
                                                  FOREIGN KEY (album_id) REFERENCES albums(id)
);

-- Таблица для хранения списков
CREATE TABLE IF NOT EXISTS lists (
                                     id INT AUTO_INCREMENT PRIMARY KEY,
                                     user_id INT NOT NULL,
                                     name VARCHAR(255) NOT NULL,
                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Таблица для связывания альбомов со списками
CREATE TABLE IF NOT EXISTS list_items (
                                          id INT AUTO_INCREMENT PRIMARY KEY,
                                          list_id INT NOT NULL,
                                          album_id INT NOT NULL,
                                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                          FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
                                          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                          UNIQUE (list_id, album_id) -- Гарантирует, что один альбом не может быть добавлен в один и тот же список дважды
);

-- Таблица для хранения рецензий пользователей на альбомы
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
                                       UNIQUE KEY unique_review (user_id, album_id) -- Гарантирует одну рецензию на один альбом от одного пользователя
);

ALTER TABLE albums
    ADD COLUMN popularity INT DEFAULT 0,
    ADD COLUMN avg_rating DECIMAL(3,2) DEFAULT NULL,
    ADD COLUMN rating_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS artists (
                                       id INT AUTO_INCREMENT PRIMARY KEY,
                                       name VARCHAR(255) NOT NULL UNIQUE, -- Имя исполнителя
                                       slug VARCHAR(255) UNIQUE NOT NULL, -- Человекопонятный URL-идентификатор
                                       bio TEXT,                          -- Биография
                                       picture_url VARCHAR(255),          -- Ссылка на фото
                                       formed_year VARCHAR(10),           -- Год основания
                                       origin_country VARCHAR(100),       -- Страна происхождения
                                       genres_main VARCHAR(255),          -- Основные жанры (для быстрого поиска)
                                       description TEXT,                  -- Дополнительное описание/дескрипторы
    -- Статистические счетчики (опционально, для кэширования)
                                       albums_count INT DEFAULT 0,
                                       followers_count INT DEFAULT 0,
                                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Таблица для связи альбомов с исполнителями (основной/приглашенный)
CREATE TABLE IF NOT EXISTS album_artists (
                                             album_id INT NOT NULL,
                                             artist_id INT NOT NULL,
                                             is_main BOOLEAN DEFAULT TRUE, -- Флаг, является ли исполнитель основным (например, The Main Artist feat. Guest Artist)
                                             PRIMARY KEY (album_id, artist_id),
                                             FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                             FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);