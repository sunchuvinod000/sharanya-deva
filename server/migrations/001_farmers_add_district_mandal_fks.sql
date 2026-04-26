-- Align legacy farmers (varchar district / subdistrict) with app FKs (district_id, mandal_id).
-- Run once against your DB, for example:
--   mysql -h HOST -u USER -p DB_NAME < 001_farmers_add_district_mandal_fks.sql

ALTER TABLE farmers
  ADD COLUMN district_id INT NULL,
  ADD COLUMN mandal_id INT NULL,
  ADD INDEX idx_farmer_district (district_id),
  ADD INDEX idx_farmer_mandal (mandal_id);

UPDATE farmers f
INNER JOIN districts d ON d.name = f.district AND d.state = f.state
SET f.district_id = d.id
WHERE f.district_id IS NULL;

UPDATE farmers f
INNER JOIN mandals m ON m.district_id = f.district_id AND m.name = f.subdistrict
SET f.mandal_id = m.id
WHERE f.district_id IS NOT NULL AND f.mandal_id IS NULL;

UPDATE farmers f
INNER JOIN (
  SELECT district_id, MIN(id) AS id FROM mandals GROUP BY district_id
) pick ON pick.district_id = f.district_id
SET f.mandal_id = pick.id
WHERE f.district_id IS NOT NULL AND f.mandal_id IS NULL;

ALTER TABLE farmers
  ADD CONSTRAINT fk_farmers_district FOREIGN KEY (district_id) REFERENCES districts(id);

ALTER TABLE farmers
  ADD CONSTRAINT fk_farmers_mandal FOREIGN KEY (mandal_id) REFERENCES mandals(id);
