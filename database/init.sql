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
                                             social TEXT,
                                             birth_date DATE,
                                             gender VARCHAR(20),
                                             contact_email VARCHAR(100),
                                             music TEXT,
                                             movies TEXT,
                                             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- ==========================================
-- 2. СПРАВОЧНИКИ
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

CREATE TABLE IF NOT EXISTS release_attributes (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  name VARCHAR(50) UNIQUE NOT NULL
);

-- ==========================================
-- 3. АРТИСТЫ И ЛОКАЦИИ
-- ==========================================
CREATE TABLE IF NOT EXISTS locations (
                                         id INT AUTO_INCREMENT PRIMARY KEY,
                                         name VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
                                       id INT AUTO_INCREMENT PRIMARY KEY,
                                       name VARCHAR(255) NOT NULL UNIQUE,
                                       slug VARCHAR(255) UNIQUE NOT NULL,
                                       bio TEXT,
                                       picture_url VARCHAR(255),
                                       formed_year INT,
                                       disbanded_year INT DEFAULT NULL,
                                       artist_type ENUM('solo', 'group') NOT NULL DEFAULT 'solo',
                                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Связующая таблица (как album_genres)
CREATE TABLE IF NOT EXISTS artist_locations (
                                                artist_id INT NOT NULL,
                                                location_id INT NOT NULL,
                                                PRIMARY KEY (artist_id, location_id),
                                                FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                                                FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artist_stats (
                                            artist_id INT PRIMARY KEY,
                                            avg_score DECIMAL(3, 2) DEFAULT 0.00,
                                            albums_count INT DEFAULT 0,
                                            followers_count INT DEFAULT 0,
                                            reviews_count INT DEFAULT 0,
                                            in_lists_count INT DEFAULT 0,
                                            chart_slug VARCHAR(100) DEFAULT NULL,
                                            FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- ==========================================
-- 4. АЛЬБОМЫ И СВЯЗИ
-- ==========================================
CREATE TABLE IF NOT EXISTS albums (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      title VARCHAR(255) NOT NULL,
                                      slug VARCHAR(255) UNIQUE NOT NULL,
                                      release_date DATE,
                                      cover_url VARCHAR(255),
                                      label VARCHAR(100),
                                      release_format_id INT,
                                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                      FOREIGN KEY (release_format_id) REFERENCES release_formats(id) ON DELETE SET NULL
);

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
                                           FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS album_artists (
                                             album_id INT NOT NULL,
                                             artist_id INT NOT NULL,
                                             is_main BOOLEAN DEFAULT TRUE,
                                             PRIMARY KEY (album_id, artist_id),
                                             FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                             FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- Таблицы связей, которые отсутствовали в схеме, но нужны для работы функций
CREATE TABLE IF NOT EXISTS album_genres (
                                            album_id INT NOT NULL,
                                            genre_id INT NOT NULL,
                                            PRIMARY KEY (album_id, genre_id),
                                            FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                            FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS album_languages (
                                               album_id INT NOT NULL,
                                               language_id INT NOT NULL,
                                               PRIMARY KEY (album_id, language_id),
                                               FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                               FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS album_descriptors (
                                                 album_id INT NOT NULL,
                                                 descriptor_id INT NOT NULL,
                                                 PRIMARY KEY (album_id, descriptor_id),
                                                 FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                 FOREIGN KEY (descriptor_id) REFERENCES descriptors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS album_release_attributes (
                                                        album_id INT NOT NULL,
                                                        attribute_id INT NOT NULL,
                                                        PRIMARY KEY (album_id, attribute_id),
                                                        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                        FOREIGN KEY (attribute_id) REFERENCES release_attributes(id) ON DELETE CASCADE
);

-- ==========================================
-- 5. ТРЕКИ
-- ==========================================
CREATE TABLE IF NOT EXISTS tracks (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      album_id INT NOT NULL,
                                      title VARCHAR(255) NOT NULL,
                                      slug VARCHAR(255) UNIQUE NOT NULL,
                                      track_number INT NOT NULL,
                                      duration VARCHAR(10) NULL,
                                      lyrics TEXT,
                                      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                      UNIQUE KEY (album_id, track_number)
);

CREATE TABLE IF NOT EXISTS tracks_stats (
                                            track_id INT PRIMARY KEY,
                                           avg_score DECIMAL(3, 2) DEFAULT 0.00,
                                           ratings_count INT DEFAULT 0,
                                           reviews_count INT DEFAULT 0,
                                           in_lists_count INT DEFAULT 0,
                                           chart_slug VARCHAR(100) DEFAULT NULL,
                                           FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- ==========================================
-- 6. РЕЙТИНГИ (Исправлен синтаксис)
-- ==========================================
CREATE TABLE IF NOT EXISTS ratings (
                                       user_id INT NOT NULL,
                                       album_id INT NOT NULL,
                                       score DECIMAL(3, 1) NOT NULL,
                                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                       PRIMARY KEY (user_id, album_id),
                                       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                       FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                       CONSTRAINT chk_score_album CHECK (score >= 0.5 AND score <= 5.0)
);

CREATE TABLE IF NOT EXISTS track_ratings (
                                             user_id INT NOT NULL,
                                             track_id INT NOT NULL,
                                             score DECIMAL(3, 1) NOT NULL,
                                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                             updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                             PRIMARY KEY (user_id, track_id),
                                             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                             FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
                                             CONSTRAINT chk_score_track CHECK (score >= 0.5 AND score <= 5.0)
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
                                     cover_url VARCHAR(255),
                                     type ENUM('album', 'track', 'artist', 'user') NOT NULL DEFAULT 'album',
                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS list_stats (
                                          list_id INT PRIMARY KEY,
                                            avg_score DECIMAL(3, 2) DEFAULT 0.00,
                                          likes_count INT DEFAULT 0,
                                            reviews_count INT DEFAULT 0,
                                            chart_slug VARCHAR(100) DEFAULT NULL,
                                            FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS list_items (
                                          id INT AUTO_INCREMENT PRIMARY KEY,
                                          list_id INT NOT NULL,
                                          entity_id INT NOT NULL,
                                          sort_order INT DEFAULT 0,
                                          FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
                                          UNIQUE (list_id, entity_id),
                                          INDEX idx_entity (entity_id)
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
                                                  album_id INT DEFAULT NULL,
                                                  artist_id INT DEFAULT NULL,
                                                  list_id INT NULL,
                                                  action_type ENUM('listen', 'wishlist', 'like', 'add-to-list', 'tags', 'follow') NOT NULL,
                                                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                  UNIQUE KEY unique_user_album_action (user_id, album_id, action_type),
                                                  UNIQUE KEY unique_user_artist_action (user_id, artist_id, action_type),
                                                  UNIQUE KEY unique_user_list_action (user_id, list_id, action_type),
                                                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                                  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                                                  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE

);

-- Создаем единую таблицу credits
CREATE TABLE IF NOT EXISTS credits (
                                       id INT AUTO_INCREMENT PRIMARY KEY,
                                       artist_id INT NOT NULL,           -- Артист, которого кредитуем (или участник группы)
                                       role_id INT DEFAULT NULL,         -- ID роли

                                       album_id INT DEFAULT NULL,
                                       group_id INT DEFAULT NULL,
                                       start_year INT DEFAULT NULL,
                                       end_year INT DEFAULT NULL,
                                       FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
                                       FOREIGN KEY (role_id) REFERENCES credit_roles(id) ON DELETE SET NULL,
                                       FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
                                       FOREIGN KEY (group_id) REFERENCES artists(id) ON DELETE CASCADE,

                                       CONSTRAINT chk_credit_target CHECK (
                                           (album_id IS NOT NULL AND group_id IS NULL) OR
                                           (album_id IS NULL AND group_id IS NOT NULL)
                                           )
);

-- ==========================================
-- 11. ОТЗЫВЫ И КОММЕНТАРИИ
-- ==========================================
CREATE TABLE IF NOT EXISTS comments (
                                        id INT AUTO_INCREMENT PRIMARY KEY,
                                        user_id INT NOT NULL,
                                        entity_type ENUM('album', 'track', 'artist', 'user', 'list') NOT NULL,
                                        entity_id INT NOT NULL,
                                        content TEXT NOT NULL,
                                        parent_id INT DEFAULT NULL,
                                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
                                        INDEX idx_entity (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS comment_votes (
                                             id INT AUTO_INCREMENT PRIMARY KEY,
                                             user_id INT NOT NULL,
                                             comment_id INT NOT NULL,
                                             vote_type ENUM('like', 'dislike') NOT NULL DEFAULT 'like',
                                             UNIQUE KEY unique_user_comment_vote (user_id, comment_id),
                                             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                             FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- ==========================================
-- 12. ССЫЛКИ И СОЦ. ФУНКЦИИ
-- ==========================================

CREATE TABLE album_links (
                             id INT AUTO_INCREMENT PRIMARY KEY,
                             album_id INT NOT NULL,
                             platform_id VARCHAR(50) NOT NULL, -- 'spotify', 'soundcloud', etc.
                             url TEXT NOT NULL,
                             FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE

);

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
                                             user_id INT NOT NULL,          -- Кому придет уведомление
                                             sender_id INT,                 -- Кто инициировал (может быть NULL для системных)
                                             type ENUM('new_follow', 'new_comment', 'comment_like', 'comment_reply', 'new_release') NOT NULL,
                                             content TEXT NOT NULL,         -- Текст уведомления
                                             is_read BOOLEAN DEFAULT FALSE,
                                             related_slug VARCHAR(255),     -- Ссылка на объект (альбом, артист, юзер)
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
CREATE FULLTEXT INDEX ft_albums_title ON albums(title);
CREATE FULLTEXT INDEX ft_artists_name ON artists(name);
CREATE INDEX idx_aa_artist_id ON album_artists(artist_id);
CREATE INDEX idx_ag_genre_id ON album_genres(genre_id);
CREATE INDEX idx_ad_descriptor_id ON album_descriptors(descriptor_id);
CREATE INDEX idx_al_language_id ON album_languages(language_id);
CREATE INDEX idx_ara_attribute_id ON album_release_attributes(attribute_id);
CREATE INDEX idx_tracks_album_id ON tracks(album_id);
CREATE INDEX idx_artist_stats_score ON artist_stats(avg_score DESC);
CREATE INDEX idx_artist_stats_followers ON artist_stats(followers_count DESC);
CREATE INDEX idx_user_album_actions_lookup ON user_album_actions(user_id, album_id, action_type);
CREATE INDEX idx_user_album_actions_artist ON user_album_actions(user_id, artist_id, action_type);
