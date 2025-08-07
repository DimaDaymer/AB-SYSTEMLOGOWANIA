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
                                      artist VARCHAR(255) NOT NULL,
                                      release_date VARCHAR(100),
                                      cover_url VARCHAR(255),
                                      type VARCHAR(50),
                                      genres VARCHAR(255),
                                      label VARCHAR(255),
                                      language VARCHAR(50),
                                      slug VARCHAR(255) UNIQUE NOT NULL,
                                      likes INT DEFAULT 0,
                                      wishlist_count INT DEFAULT 0,
                                      in_lists_count INT DEFAULT 0,
                                      reviews_count INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tracks (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      album_id INT NOT NULL,
                                      track_number INT NOT NULL,
                                      title VARCHAR(255) NOT NULL,
                                      duration VARCHAR(50),
                                      FOREIGN KEY (album_id) REFERENCES albums(id)
);

CREATE TABLE IF NOT EXISTS ratings (
                                       id INT AUTO_INCREMENT PRIMARY KEY,
                                       user_id INT NOT NULL,
                                       album_id INT NOT NULL,
                                       score DECIMAL(2,1) NOT NULL CHECK (score BETWEEN 0.5 AND 5),
                                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                       UNIQUE KEY unique_rating (user_id, album_id),
                                       FOREIGN KEY (user_id) REFERENCES users(id),
                                       FOREIGN KEY (album_id) REFERENCES albums(id)
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

CREATE TABLE IF NOT EXISTS user_album_actions (
                                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                                  user_id INT NOT NULL,
                                                  album_id INT NOT NULL,
                                                  action_type ENUM('listen', 'wishlist', 'like') NOT NULL,
                                                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                  UNIQUE KEY unique_user_album_action (user_id, album_id, action_type),
                                                  FOREIGN KEY (user_id) REFERENCES users(id),
                                                  FOREIGN KEY (album_id) REFERENCES albums(id)
);
