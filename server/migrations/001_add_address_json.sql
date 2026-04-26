-- Run if you already applied an older schema.sql without address_json:
-- mysql -u ... your_db < server/migrations/001_add_address_json.sql

ALTER TABLE farmers
  ADD COLUMN address_json JSON DEFAULT NULL
  COMMENT 'Geocoded farm location from Nominatim'
  AFTER location_verified;
