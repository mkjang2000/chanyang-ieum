CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  color CHAR(7) NOT NULL DEFAULT '#d9a441',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_event_dates CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'leader', 'accompanist', 'member') NOT NULL DEFAULT 'leader',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'leader', 'accompanist', 'member') NOT NULL DEFAULT 'leader';

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NULL,
  username VARCHAR(64) NOT NULL DEFAULT '',
  success TINYINT(1) NOT NULL DEFAULT 0,
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_login_records_created (created_at),
  KEY idx_login_records_user (user_id, created_at),
  KEY idx_login_records_success (success, created_at),
  CONSTRAINT fk_login_records_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_presets (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  short_label VARCHAR(20) NOT NULL DEFAULT '',
  default_time TIME NULL,
  color CHAR(7) NOT NULL DEFAULT '#64748b',
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_service_presets_order (active, sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO service_presets
  (id, name, short_label, default_time, color, sort_order, active)
VALUES
  ('sunday-morning', '주일낮예배', '낮', '10:50:00', '#f97316', 10, 1),
  ('sunday-praise', '주일찬양예배', '찬양', '15:45:00', '#8b5cf6', 20, 1),
  ('wednesday', '수요예배', '수', '19:45:00', '#0ea5e9', 30, 1),
  ('friday', '금요예배', '금', '19:45:00', '#10b981', 40, 1),
  ('other', '기타예배', '기타', NULL, '#64748b', 50, 1);

CREATE TABLE IF NOT EXISTS flow_signal_presets (
  id VARCHAR(64) PRIMARY KEY,
  label VARCHAR(30) NOT NULL,
  short_label VARCHAR(12) NOT NULL,
  icon VARCHAR(32) NOT NULL DEFAULT 'music-2',
  color CHAR(7) NOT NULL DEFAULT '#93c5fd',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_flow_signal_order (sort_order, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO flow_signal_presets
  (id, label, short_label, icon, color, sort_order)
VALUES
  ('finish', '곡 마침', '곡 마침', 'circle-stop', '#fca5a5', 10),
  ('restart', '처음으로 돌아가기', '처음으로', 'rotate-ccw', '#93c5fd', 20),
  ('chorus', '후렴으로 돌아가기', '후렴으로', 'repeat-2', '#c4b5fd', 30),
  ('interlude', '간주 넣기', '간주 넣기', 'music-2', '#86efac', 40);

CREATE TABLE IF NOT EXISTS songs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  normalized_title VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_songs_normalized_title (normalized_title),
  KEY idx_songs_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS images (
  id CHAR(36) PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(32) NOT NULL DEFAULT 'upload',
  source_url TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 악보 자체의 Key. 같은 악보를 다시 쓸 때 함께 불러온다.
  key_name VARCHAR(32) NOT NULL DEFAULT '',
  -- omr: 조표 자동 인식 / manual: 사용자가 직접 입력 / '' : 아직 없음
  key_source VARCHAR(16) NOT NULL DEFAULT '',
  -- pending: 분석 대기 / done: 완료 / failed: 실패 / skipped: 대상 아님
  key_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  key_checked_at DATETIME(3) NULL,
  UNIQUE KEY uq_images_checksum (checksum),
  KEY idx_images_key_status (key_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기존 설치본 대응: 컬럼이 없을 때만 추가한다.
-- (DELIMITER 는 클라이언트 전용이라 스크립트 실행에서는 쓸 수 없어 IF NOT EXISTS 로 처리)
ALTER TABLE images ADD COLUMN IF NOT EXISTS key_name VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE images ADD COLUMN IF NOT EXISTS key_source VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE images ADD COLUMN IF NOT EXISTS key_status VARCHAR(16) NOT NULL DEFAULT 'pending';
ALTER TABLE images ADD COLUMN IF NOT EXISTS key_checked_at DATETIME(3) NULL;
ALTER TABLE images ADD INDEX IF NOT EXISTS idx_images_key_status (key_status, created_at);

CREATE TABLE IF NOT EXISTS song_images (
  song_id BIGINT UNSIGNED NOT NULL,
  image_id CHAR(36) NOT NULL,
  use_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (song_id, image_id),
  KEY idx_song_images_recent (song_id, last_used_at),
  CONSTRAINT fk_song_images_song FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  CONSTRAINT fk_song_images_image FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contis (
  id VARCHAR(64) PRIMARY KEY,
  owner_user_id CHAR(36) NULL,
  mode ENUM('regular', 'event') NOT NULL,
  event_id VARCHAR(64) NULL,
  worship_date DATE NOT NULL,
  worship_time TIME NULL,
  service_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  leader VARCHAR(255) NOT NULL DEFAULT '',
  memo TEXT NOT NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_contis_date (worship_date),
  KEY idx_contis_event_date (event_id, worship_date),
  KEY idx_contis_owner (owner_user_id),
  CONSTRAINT fk_contis_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_contis_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE contis
  ADD COLUMN IF NOT EXISTS owner_user_id CHAR(36) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS worship_time TIME NULL AFTER worship_date,
  ADD INDEX IF NOT EXISTS idx_contis_owner (owner_user_id);

-- 시간이 없던 기존 일반 콘티는 예배 종류별 기본 시간으로 한 번만 보정한다.
UPDATE contis
   SET worship_time = CASE service_type
     WHEN 'sunday-morning' THEN '10:50:00'
     WHEN 'sunday-praise' THEN '15:45:00'
     WHEN 'wednesday' THEN '19:45:00'
     WHEN 'friday' THEN '19:45:00'
     ELSE worship_time
   END
 WHERE mode = 'regular'
   AND worship_time IS NULL
   AND service_type IN ('sunday-morning', 'sunday-praise', 'wednesday', 'friday');

-- 기존 콘티는 인도자 표시 이름과 정확히 일치하는 활성 계정이 하나일 때 소유권을 연결한다.
UPDATE contis c
   SET c.owner_user_id = (
     SELECT IF(COUNT(*) = 1, MIN(u.id), NULL)
       FROM users u
      WHERE u.active = 1
        AND u.role IN ('admin', 'leader')
        AND u.display_name = c.leader
   )
 WHERE c.owner_user_id IS NULL;

ALTER TABLE contis
  ADD FOREIGN KEY IF NOT EXISTS fk_contis_owner (owner_user_id)
  REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS instrument_presets (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_instrument_presets_name (name),
  KEY idx_instrument_presets_order (active, sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO instrument_presets (id, name, sort_order, active) VALUES
  ('piano', '피아노', 10, 1),
  ('drums', '드럼', 20, 1),
  ('acoustic-guitar', '통기타', 30, 1),
  ('electric-guitar', '일렉기타', 40, 1),
  ('bass', '베이스', 50, 1);

CREATE TABLE IF NOT EXISTS conti_items (
  id VARCHAR(64) PRIMARY KEY,
  conti_id VARCHAR(64) NOT NULL,
  song_id BIGINT UNSIGNED NULL,
  image_id CHAR(36) NOT NULL,
  position INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  key_name VARCHAR(32) NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  start_instrument VARCHAR(64) NOT NULL DEFAULT '',
  transition_mode VARCHAR(16) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_conti_items_position (conti_id, position),
  CONSTRAINT fk_conti_items_conti FOREIGN KEY (conti_id) REFERENCES contis(id) ON DELETE CASCADE,
  CONSTRAINT fk_conti_items_song FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE SET NULL,
  CONSTRAINT fk_conti_items_image FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE conti_items
  ADD COLUMN IF NOT EXISTS memo TEXT NOT NULL DEFAULT '' AFTER key_name,
  ADD COLUMN IF NOT EXISTS start_instrument VARCHAR(64) NOT NULL DEFAULT '' AFTER memo,
  ADD COLUMN IF NOT EXISTS transition_mode VARCHAR(16) NOT NULL DEFAULT '' AFTER start_instrument;

ALTER TABLE conti_items
  MODIFY COLUMN start_instrument VARCHAR(64) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  church_name VARCHAR(100) NOT NULL DEFAULT '',
  default_service_type VARCHAR(64) NOT NULL DEFAULT 'sunday-morning',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_app_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id CHAR(36) PRIMARY KEY,
  default_mode ENUM('regular', 'event') NOT NULL DEFAULT 'regular',
  viewer_zoom SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  show_notes TINYINT(1) NOT NULL DEFAULT 1,
  quick_signals_enabled TINYINT(1) NOT NULL DEFAULT 1,
  quick_signals_position ENUM('left', 'right') NOT NULL DEFAULT 'left',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_user_preferences_zoom CHECK (viewer_zoom BETWEEN 50 AND 200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS quick_signals_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER show_notes,
  ADD COLUMN IF NOT EXISTS quick_signals_position ENUM('left', 'right') NOT NULL DEFAULT 'left' AFTER quick_signals_enabled;

CREATE TABLE IF NOT EXISTS maintenance_runs (
  task_name VARCHAR(64) PRIMARY KEY,
  last_run_at DATETIME(3) NOT NULL,
  result_json LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS share_links (
  id CHAR(36) PRIMARY KEY,
  conti_id VARCHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_by CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_accessed_at DATETIME(3) NULL,
  access_count INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_share_links_token (token_hash),
  KEY idx_share_links_conti (conti_id, created_at),
  KEY idx_share_links_expiry (expires_at),
  KEY idx_share_links_creator (created_by),
  CONSTRAINT fk_share_links_conti FOREIGN KEY (conti_id) REFERENCES contis(id) ON DELETE CASCADE,
  CONSTRAINT fk_share_links_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
