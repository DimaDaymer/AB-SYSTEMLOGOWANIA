DROP DATABASE IF EXISTS `melody_rater`;
CREATE DATABASE melody_rater;
USE melody_rater;

-- === ПОЛЬЗОВАТЕЛИ ===
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

-- === СПРАВОЧНИКИ (ЖАНРЫ, РОЛИ, ФОРМАТЫ) ===

CREATE TABLE IF NOT EXISTS genres (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_roles (
                                            id INT AUTO_INCREMENT PRIMARY KEY,
                                            name VARCHAR(50) NOT NULL UNIQUE
);

-- Основной формат релиза (взаимоисключающий)
CREATE TABLE IF NOT EXISTS release_formats (
                                               id INT AUTO_INCREMENT PRIMARY KEY,
                                               name VARCHAR(50) UNIQUE NOT NULL
);

-- Наполняем базовыми форматами
INSERT INTO release_formats (name) VALUES
                                       ('Album'), ('EP'), ('Single'), ('Mixtape'), ('DJ Mix'), ('Compilation'), ('Video');

-- Дополнительные атрибуты (могут сочетаться)
CREATE TABLE IF NOT EXISTS release_attributes (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  name VARCHAR(50) UNIQUE NOT NULL
);

-- Наполняем базовыми атрибутами
INSERT INTO release_attributes (name) VALUES
                                          ('Live'), ('Soundtrack'), ('Unauthorized'), ('Demo'), ('Box Set');

-- === АРТИСТЫ ===
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

CREATE TABLE IF NOT EXISTS artist_genres (
                                             artist_id INT NOT NULL,
                                             genre_id INT NOT NULL,
                                             PRIMARY KEY (artist_id, genre_id),
                                             FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                                             FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

-- === АЛЬБОМЫ ===
CREATE TABLE IF NOT EXISTS albums (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      title VARCHAR(255) NOT NULL,
                                      slug VARCHAR(255) UNIQUE NOT NULL,
                                      release_date DATE,
                                      cover_url VARCHAR(255),

                                      release_format_id INT, -- Ссылка на основной формат (Album, EP...)

                                      label VARCHAR(100),
                                      language VARCHAR(50),
                                      description TEXT,

                                      genres TEXT, -- Денормализованное поле для упрощения

                                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                      FOREIGN KEY (release_format_id) REFERENCES release_formats(id) ON DELETE SET NULL
);

-- Связь Альбом <-> Атрибуты (Many-to-Many: Live, Bootleg...)
CREATE TABLE IF NOT EXISTS album_release_attributes (
                                                        album_id INT NOT NULL,
                                                        attribute_id INT NOT NULL,
                                                        PRIMARY KEY (album_id, attribute_id),
                                                        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                        FOREIGN KEY (attribute_id) REFERENCES release_attributes(id) ON DELETE CASCADE
);

-- === СТАТИСТИКА АЛЬБОМОВ ===
CREATE TABLE IF NOT EXISTS album_stats (
                                           album_id INT PRIMARY KEY,
                                           avg_score DECIMAL(3, 2) DEFAULT 0.00,
                                           ratings_count INT DEFAULT 0,
                                           reviews_count INT DEFAULT 0,
                                           likes_count INT DEFAULT 0,
                                           wishlist_count INT DEFAULT 0,
                                           in_lists_count INT DEFAULT 0,
                                           current_rank INT DEFAULT NULL,
                                           chart_slug VARCHAR(100) DEFAULT NULL,
                                           last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                           FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

-- === ИСПРАВЛЕННЫЙ ТРИГГЕР ===
DELIMITER //
CREATE TRIGGER after_album_insert
    AFTER INSERT ON albums
    FOR EACH ROW
BEGIN
    -- Мы передаем только ID, остальные поля заполнятся значениями DEFAULT (0, NULL и т.д.)
    INSERT INTO album_stats (album_id) VALUES (NEW.id);
END;
//
DELIMITER ;

-- Связи (Жанры, Артисты)
CREATE TABLE IF NOT EXISTS album_genres (
                                            album_id INT,
                                            genre_id INT,
                                            PRIMARY KEY (album_id, genre_id),
                                            FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                            FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS album_artists (
                                             album_id INT NOT NULL,
                                             artist_id INT NOT NULL,
                                             is_main BOOLEAN DEFAULT TRUE,
                                             PRIMARY KEY (album_id, artist_id),
                                             FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                             FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- === ТРЕКИ ===
CREATE TABLE IF NOT EXISTS tracks (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      album_id INT NOT NULL,
                                      track_number INT NOT NULL,
                                      title VARCHAR(255) NOT NULL,
                                      duration VARCHAR(50),
                                      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                      UNIQUE KEY unique_track_in_album (album_id, track_number)
);

-- === КРЕДИТЫ ===
CREATE TABLE IF NOT EXISTS album_credits (
                                             id INT AUTO_INCREMENT PRIMARY KEY,
                                             album_id INT NOT NULL,
                                             artist_id INT NOT NULL,
                                             role_id INT,
                                             FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                             FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                                             FOREIGN KEY (role_id) REFERENCES credit_roles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS track_credits (
                                             id INT AUTO_INCREMENT PRIMARY KEY,
                                             track_id INT NOT NULL,
                                             artist_id INT NOT NULL,
                                             role_id INT,
                                             FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                                             FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                                             FOREIGN KEY (role_id) REFERENCES credit_roles(id) ON DELETE SET NULL
);

-- === ОЦЕНКИ ===
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

-- === ДЕЙСТВИЯ И КОНТЕНТ ===
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

CREATE TABLE IF NOT EXISTS lists (
                                     id INT AUTO_INCREMENT PRIMARY KEY,
                                     user_id INT NOT NULL,
                                     name VARCHAR(255) NOT NULL,
                                     description TEXT,
                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS album_links (
                                           id INT AUTO_INCREMENT PRIMARY KEY,
                                           album_id INT NOT NULL,
                                           platform_name VARCHAR(50),
                                           url VARCHAR(500) NOT NULL,
                                           FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);
