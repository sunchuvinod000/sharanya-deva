-- Shri Satya Shaneswara — Borewell Queue schema + seed
-- Prefer applying the live DB with Prisma: from `server/`, run `npm run db:setup` (see README). This file is the SQL snapshot + seed.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS farmers;
DROP TABLE IF EXISTS mandals;
DROP TABLE IF EXISTS districts;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'priest') NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  UNIQUE KEY unique_district_state (name, state)
);

CREATE TABLE mandals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  district_id INT NOT NULL,
  FOREIGN KEY (district_id) REFERENCES districts(id),
  UNIQUE KEY unique_mandal_district (name, district_id)
);

CREATE TABLE farmers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  purpose_of_visit VARCHAR(50) DEFAULT NULL,
  phone VARCHAR(15) NOT NULL,
  village VARCHAR(100) NOT NULL,
  mandal_id INT NOT NULL,
  district_id INT NOT NULL,
  state VARCHAR(100) NOT NULL,
  pin_code VARCHAR(6) NOT NULL,
  district VARCHAR(150) NOT NULL DEFAULT '' COMMENT 'Denormalized district label (legacy / display)',
  subdistrict VARCHAR(150) NOT NULL DEFAULT '' COMMENT 'Mandal name mirror for legacy tooling',
  district_geoname_id INT NOT NULL DEFAULT 0 COMMENT '0 when not from GeoNames import',
  farm_latitude DECIMAL(10, 8) DEFAULT NULL,
  farm_longitude DECIMAL(11, 8) DEFAULT NULL,
  location_verified BOOLEAN DEFAULT FALSE,
  address_json JSON DEFAULT NULL COMMENT 'Geocoded farm location: { address: { city, county, state_district, state, country } }',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mandal_id) REFERENCES mandals(id),
  FOREIGN KEY (district_id) REFERENCES districts(id),
  INDEX idx_phone (phone),
  INDEX idx_district (district_id),
  INDEX idx_mandal (mandal_id)
);

CREATE TABLE requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT NOT NULL,
  status ENUM('pending', 'soil_collected', 'approved', 'rejected', 'visited', 'success', 'failure', 'on_hold') NOT NULL DEFAULT 'pending',
  status_before_hold VARCHAR(32) DEFAULT NULL COMMENT 'Workflow status before on_hold; cleared on resume',
  priority ENUM('normal', 'urgent') NOT NULL DEFAULT 'normal',
  notes TEXT,
  requested_date DATE DEFAULT (CURRENT_DATE),
  expected_soil_date DATE DEFAULT NULL,
  expected_approval_date DATE DEFAULT NULL,
  expected_visit_date DATE DEFAULT NULL,
  hold_reason TEXT,
  hold_at DATETIME DEFAULT NULL,
  rescheduled_at DATETIME DEFAULT NULL,
  reschedule_reason TEXT,
  soil_collected_date DATE DEFAULT NULL,
  approved_date DATE DEFAULT NULL,
  visit_date DATE DEFAULT NULL,
  completed_date DATE DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_priority (priority),
  INDEX idx_farmer (farmer_id)
);

-- Seed admin (password: admin123) — bcrypt cost 10, verified with bcryptjs.compare
INSERT INTO users (name, email, password_hash, role) VALUES
('Anand', 'anand@sharanya.com', '$2b$10$cIQTIun.iNRJfFCRzRtncOybMZhfai92iFp84D5jxM73fkC6JADYq', 'admin');

-- Andhra Pradesh districts
INSERT INTO districts (name, state) VALUES
('Anantapur', 'Andhra Pradesh'),
('Chittoor', 'Andhra Pradesh'),
('East Godavari', 'Andhra Pradesh'),
('Guntur', 'Andhra Pradesh'),
('Krishna', 'Andhra Pradesh'),
('Kurnool', 'Andhra Pradesh'),
('Nellore', 'Andhra Pradesh'),
('Prakasam', 'Andhra Pradesh'),
('Srikakulam', 'Andhra Pradesh'),
('Visakhapatnam', 'Andhra Pradesh'),
('Vizianagaram', 'Andhra Pradesh'),
('West Godavari', 'Andhra Pradesh'),
('YSR Kadapa', 'Andhra Pradesh');

-- Telangana districts
INSERT INTO districts (name, state) VALUES
('Adilabad', 'Telangana'),
('Hyderabad', 'Telangana'),
('Karimnagar', 'Telangana'),
('Khammam', 'Telangana'),
('Mahabubnagar', 'Telangana'),
('Medak', 'Telangana'),
('Nalgonda', 'Telangana'),
('Nizamabad', 'Telangana'),
('Rangareddy', 'Telangana'),
('Warangal', 'Telangana');

-- Sample mandals (minimal; full lists come from `npm run seed:geo` or `prisma db seed`, which reads `data/geo/*.json`)
INSERT INTO mandals (name, district_id) SELECT 'Penukonda', id FROM districts WHERE name = 'Anantapur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Gooty', id FROM districts WHERE name = 'Anantapur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Dharmavaram', id FROM districts WHERE name = 'Anantapur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Kalyandurg', id FROM districts WHERE name = 'Anantapur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Rapthadu', id FROM districts WHERE name = 'Anantapur' AND state = 'Andhra Pradesh';

INSERT INTO mandals (name, district_id) SELECT 'Kurnool Rural', id FROM districts WHERE name = 'Kurnool' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Nandyal', id FROM districts WHERE name = 'Kurnool' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Adoni', id FROM districts WHERE name = 'Kurnool' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Pattikonda', id FROM districts WHERE name = 'Kurnool' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Kodumur', id FROM districts WHERE name = 'Kurnool' AND state = 'Andhra Pradesh';

INSERT INTO mandals (name, district_id) SELECT 'Chittoor Rural', id FROM districts WHERE name = 'Chittoor' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Tirupati Urban', id FROM districts WHERE name = 'Chittoor' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Madanapalle', id FROM districts WHERE name = 'Chittoor' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Palamaner', id FROM districts WHERE name = 'Chittoor' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Punganur', id FROM districts WHERE name = 'Chittoor' AND state = 'Andhra Pradesh';

INSERT INTO mandals (name, district_id) SELECT 'Guntur Rural', id FROM districts WHERE name = 'Guntur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Tenali', id FROM districts WHERE name = 'Guntur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Mangalagiri', id FROM districts WHERE name = 'Guntur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Bapatla', id FROM districts WHERE name = 'Guntur' AND state = 'Andhra Pradesh';
INSERT INTO mandals (name, district_id) SELECT 'Ponnur', id FROM districts WHERE name = 'Guntur' AND state = 'Andhra Pradesh';

INSERT INTO mandals (name, district_id) SELECT 'Warangal Urban', id FROM districts WHERE name = 'Warangal' AND state = 'Telangana';
INSERT INTO mandals (name, district_id) SELECT 'Hanamkonda', id FROM districts WHERE name = 'Warangal' AND state = 'Telangana';
INSERT INTO mandals (name, district_id) SELECT 'Jangaon', id FROM districts WHERE name = 'Warangal' AND state = 'Telangana';
INSERT INTO mandals (name, district_id) SELECT 'Narsampet', id FROM districts WHERE name = 'Warangal' AND state = 'Telangana';
INSERT INTO mandals (name, district_id) SELECT 'Wardhannapet', id FROM districts WHERE name = 'Warangal' AND state = 'Telangana';
