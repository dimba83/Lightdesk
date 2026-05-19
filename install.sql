SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- 1. Users Table (Photographer & Clients)
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','client') NOT NULL DEFAULT 'client',
  `submitted_at` DATETIME DEFAULT NULL,
  `selection_quota` INT DEFAULT NULL,
  `allow_download` TINYINT(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Images Table
CREATE TABLE `client_images` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `color_label` varchar(255) DEFAULT NULL,
  `upload_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Interactions (Ratings, Comments, Scribbles)
CREATE TABLE `image_interactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `image_id` int(11) NOT NULL,
  `sub_user_name` varchar(100) NOT NULL,
  `rating` int(1) DEFAULT 0,
  `is_selected` tinyint(1) DEFAULT 0,
  `comment` text,
  `scribble_data` longtext,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`image_id`) REFERENCES `client_images` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Logs
CREATE TABLE `login_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `sub_user_name` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) NOT NULL,
  `login_time` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Create Default Admin User (User: admin / Pass: admin123)
-- IMPORTANT: Tell users to change this immediately!
INSERT INTO `users` (`username`, `password`, `role`) VALUES
('admin', '$2y$10$wW55.f.jG.7q.7q.7q.7q.7q.7q.7q.7q.7q.7q.7q.7q.7q.7q', 'admin');

-- Indexes (also run these on existing installs via phpMyAdmin)
ALTER TABLE `client_images`       ADD INDEX `idx_user`       (`user_id`);
ALTER TABLE `image_interactions`  ADD INDEX `idx_image_user` (`image_id`, `sub_user_name`);
ALTER TABLE `login_logs`          ADD INDEX `idx_user_ip`    (`username`, `ip_address`);

-- For existing installs, run these manually:
-- ALTER TABLE `users` ADD COLUMN `submitted_at` DATETIME DEFAULT NULL;
-- ALTER TABLE `users` ADD COLUMN `selection_quota` INT DEFAULT NULL;
-- ALTER TABLE `users` ADD COLUMN `allow_download` TINYINT(1) DEFAULT 0;