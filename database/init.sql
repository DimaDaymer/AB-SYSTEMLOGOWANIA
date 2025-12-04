DROP DATABASE IF EXISTS `melody_rater`;
CREATE DATABASE melody_rater CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE melody_rater;

-- ==========================================
-- 1. ПОЛЬЗОВАТЕЛИ И ПРОФИЛИ
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
                                     id INT AUTO_INCREMENT PRIMARY KEY,
                                     username VARCHAR(50) UNIQUE NOT NULL,
                                     email VARCHAR(100) UNIQUE NOT NULL,
                                     password_hash VARCHAR(255) NOT NULL,
                                     role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
                                             user_id INT PRIMARY KEY,
                                             first_name VARCHAR(100),
                                             last_name VARCHAR(100),
                                             profile_pic VARCHAR(255),
                                             description TEXT,
                                             location VARCHAR(100),
                                             country VARCHAR(100),
                                             social VARCHAR(255),
                                             birth_date DATE,
                                             gender VARCHAR(20),
                                             contact_email VARCHAR(100),
                                             music TEXT,
                                             movies TEXT,
                                             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- 2. СПРАВОЧНИКИ (Genres, Formats, Meta)
-- ==========================================
CREATE TABLE IF NOT EXISTS genres (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS languages (
                                         id INT AUTO_INCREMENT PRIMARY KEY,
                                         name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS descriptors (
                                           id INT AUTO_INCREMENT PRIMARY KEY,
                                           name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_roles (
                                            id INT AUTO_INCREMENT PRIMARY KEY,
                                            name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS release_formats (
                                               id INT AUTO_INCREMENT PRIMARY KEY,
                                               name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO release_formats (name) VALUES
                                       ('Album'), ('EP'), ('Single'), ('Mixtape'), ('DJ Mix'), ('Compilation'), ('Video');

CREATE TABLE IF NOT EXISTS release_attributes (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO release_attributes (name) VALUES
                                          ('Live'), ('Soundtrack'), ('Unauthorized'), ('Demo'), ('Box Set');

-- ==========================================
-- 3. АРТИСТЫ
-- ==========================================
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

-- ==========================================
-- 4. АЛЬБОМЫ (Нормализованная версия)
-- ==========================================
CREATE TABLE IF NOT EXISTS albums (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      title VARCHAR(255) NOT NULL,
                                      slug VARCHAR(255) UNIQUE NOT NULL,
                                      release_date DATE,
                                      cover_url VARCHAR(255),
                                      release_format_id INT,    -- Связь 1-ко-Многим (Один формат на альбом)
                                      label VARCHAR(100),
                                      description TEXT,         -- Текстовое описание/био релиза
                                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                      FOREIGN KEY (release_format_id) REFERENCES release_formats(id) ON DELETE SET NULL
);

-- ==========================================
-- 5. СВЯЗУЮЩИЕ ТАБЛИЦЫ АЛЬБОМОВ
-- ==========================================

-- Альбом <-> Атрибуты (Live, Demo и т.д.)
CREATE TABLE IF NOT EXISTS album_release_attributes (
                                                        album_id INT NOT NULL,
                                                        attribute_id INT NOT NULL,
                                                        PRIMARY KEY (album_id, attribute_id),
                                                        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                        FOREIGN KEY (attribute_id) REFERENCES release_attributes(id) ON DELETE CASCADE
);

-- Альбом <-> Жанры
CREATE TABLE IF NOT EXISTS album_genres (
                                            album_id INT NOT NULL,
                                            genre_id INT NOT NULL,
                                            PRIMARY KEY (album_id, genre_id),
                                            FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                            FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

-- Альбом <-> Языки
CREATE TABLE IF NOT EXISTS album_languages (
                                               album_id INT NOT NULL,
                                               language_id INT NOT NULL,
                                               PRIMARY KEY (album_id, language_id),
                                               FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                               FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

-- Альбом <-> Дескрипторы (Vibe tags)
CREATE TABLE IF NOT EXISTS album_descriptors (
                                                 album_id INT NOT NULL,
                                                 descriptor_id INT NOT NULL,
                                                 PRIMARY KEY (album_id, descriptor_id),
                                                 FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                 FOREIGN KEY (descriptor_id) REFERENCES descriptors(id) ON DELETE CASCADE
);

-- Альбом <-> Артисты
CREATE TABLE IF NOT EXISTS album_artists (
                                             album_id INT NOT NULL,
                                             artist_id INT NOT NULL,
                                             is_main BOOLEAN DEFAULT TRUE,
                                             PRIMARY KEY (album_id, artist_id),
                                             FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                             FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);



-- ==========================================
-- 6. СТАТИСТИКА АЛЬБОМОВ
-- ==========================================
CREATE TABLE IF NOT EXISTS album_stats (
                                           album_id INT PRIMARY KEY,
                                           avg_score DECIMAL(3, 2) DEFAULT 0.00,
                                           ratings_count INT DEFAULT 0,
                                           reviews_count INT DEFAULT 0,
                                           likes_count INT DEFAULT 0,
                                           wishlist_count INT DEFAULT 0,
                                           listens_count INT DEFAULT 0,
                                           in_lists_count INT DEFAULT 0,
                                           chart_slug VARCHAR(100) DEFAULT NULL,
                                           last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                           FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

-- ==========================================
-- 7. ТРЕКИ И КРЕДИТЫ
-- ==========================================
CREATE TABLE IF NOT EXISTS tracks (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      album_id INT NOT NULL,
                                      track_number INT NOT NULL,
                                      title VARCHAR(255) NOT NULL,
                                      duration VARCHAR(50),
                                      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                      UNIQUE KEY unique_track_in_album (album_id, track_number)
);

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

-- ==========================================
-- 8. РЕЙТИНГИ И ОЦЕНКИ
-- ==========================================
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

-- ==========================================
-- 9. СПИСКИ (LISTS)
-- ==========================================
CREATE TABLE IF NOT EXISTS lists (
                                     id INT AUTO_INCREMENT PRIMARY KEY,
                                     user_id INT NOT NULL,
                                     name VARCHAR(255) NOT NULL,
                                     slug VARCHAR(255) UNIQUE NOT NULL,
                                     description TEXT,
                                     saved_sort_by VARCHAR(50) NOT NULL DEFAULT 'added_desc',
                                     cover_url VARCHAR(255),
                                     views_count INT DEFAULT 0,
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

-- ==========================================
-- 10. ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЕЙ (TAGS, ACTIONS)
-- ==========================================
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
                                                  action_type ENUM('listen', 'wishlist', 'like', 'add-to-list', 'tags') NOT NULL,
                                                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                  UNIQUE KEY unique_user_album_action (user_id, album_id, action_type),
                                                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

-- ==========================================
-- 11. ОТЗЫВЫ (REVIEWS)
-- ==========================================
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

-- ==========================================
-- 12. ССЫЛКИ И СОЦ. ФУНКЦИИ
-- ==========================================
CREATE TABLE IF NOT EXISTS album_links (
                                           id INT AUTO_INCREMENT PRIMARY KEY,
                                           album_id INT NOT NULL,
                                           platform_name VARCHAR(50),
                                           url VARCHAR(500) NOT NULL,
                                           FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS user_relations;
CREATE TABLE IF NOT EXISTS user_relations (
                                              id INT AUTO_INCREMENT PRIMARY KEY,
                                              follower_id INT NOT NULL,
                                              followed_id INT NOT NULL,
                                              relation_type ENUM('follow') NOT NULL DEFAULT 'follow',
                                              is_new_notification BOOLEAN DEFAULT TRUE,
                                              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                              UNIQUE KEY unique_follow (follower_id, followed_id),
                                              FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
                                              FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
                                             id INT AUTO_INCREMENT PRIMARY KEY,
                                             user_id INT NOT NULL,
                                             sender_id INT,
                                             type ENUM('new_follow', 'new_comment', 'list_update') NOT NULL,
                                             content TEXT NOT NULL,
                                             is_read BOOLEAN DEFAULT FALSE,
                                             related_slug VARCHAR(255),
                                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                             FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ==========================================
-- 13. ИНДЕКСЫ
-- ==========================================
CREATE INDEX idx_album_stats_ranking ON album_stats (avg_score DESC, ratings_count DESC);
CREATE INDEX idx_albums_release_date ON albums (release_date);
CREATE INDEX idx_ratings_album_score ON ratings (album_id, score);

-- ==========================================
-- 14. КОММЕНТАРИИ К ПРОФИЛЮ
-- ==========================================

CREATE TABLE IF NOT EXISTS user_comments (
                                             id INT AUTO_INCREMENT PRIMARY KEY,
    -- ID пользователя, которому адресован комментарий (владелец профиля)
                                             profile_user_id INT NOT NULL,
    -- ID пользователя, который оставил комментарий (автор)
                                             author_id INT NOT NULL,
    -- Содержимое комментария
                                             content TEXT NOT NULL,
    -- Статистика
                                             likes_count INT DEFAULT 0,
    -- Время создания
                                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Время последнего обновления
                                             updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                             FOREIGN KEY (profile_user_id) REFERENCES users(id) ON DELETE CASCADE,
                                             FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Таблица для лайков комментариев
CREATE TABLE IF NOT EXISTS user_comment_votes (
                                                  comment_id INT NOT NULL,
                                                  user_id INT NOT NULL,
                                                  PRIMARY KEY (comment_id, user_id),
                                                  FOREIGN KEY (comment_id) REFERENCES user_comments(id) ON DELETE CASCADE,
                                                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE user_comments ADD COLUMN parent_id INT DEFAULT NULL;
ALTER TABLE user_comments ADD FOREIGN KEY (parent_id) REFERENCES user_comments(id) ON DELETE CASCADE;