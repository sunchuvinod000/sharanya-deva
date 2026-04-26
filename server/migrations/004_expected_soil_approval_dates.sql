-- Planned soil / deity approval dates (Option B). Approval is kept same as soil in application code.
-- Run once, for example:
--   mysql -h HOST -u USER -p DB_NAME < server/migrations/004_expected_soil_approval_dates.sql

ALTER TABLE requests
  ADD COLUMN expected_soil_date DATE DEFAULT NULL AFTER requested_date,
  ADD COLUMN expected_approval_date DATE DEFAULT NULL AFTER expected_soil_date;

UPDATE requests
SET
  expected_soil_date = COALESCE(expected_visit_date, requested_date),
  expected_approval_date = COALESCE(expected_visit_date, requested_date)
WHERE expected_soil_date IS NULL;
