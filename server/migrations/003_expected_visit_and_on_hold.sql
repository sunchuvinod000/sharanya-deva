-- Adds visit scheduling fields and On Hold status.
-- Run once, for example:
--   mysql -h HOST -u USER -p DB_NAME < server/migrations/003_expected_visit_and_on_hold.sql

-- 1) Farmer purpose of visit (free-text label; validate at API layer)
ALTER TABLE farmers
  ADD COLUMN purpose_of_visit VARCHAR(50) DEFAULT NULL
  AFTER full_name;

-- 2) Scheduling fields on requests
ALTER TABLE requests
  ADD COLUMN expected_visit_date DATE DEFAULT NULL
  AFTER requested_date,
  ADD COLUMN hold_reason TEXT DEFAULT NULL
  AFTER notes,
  ADD COLUMN hold_at DATETIME DEFAULT NULL
  AFTER hold_reason,
  ADD COLUMN rescheduled_at DATETIME DEFAULT NULL
  AFTER hold_at,
  ADD COLUMN reschedule_reason TEXT DEFAULT NULL
  AFTER rescheduled_at;

-- 3) Extend request status enum to include on_hold (keep the old values for safety during the ALTER)
ALTER TABLE requests
  MODIFY COLUMN status ENUM(
    'pending', 'soil_collected', 'approved', 'rejected', 'visited',
    'success', 'failure',
    'on_hold'
  ) NOT NULL DEFAULT 'pending';

-- 4) Backfill expected_visit_date for existing rows so ordering works.
-- Default: use requested_date (or today if null).
UPDATE requests
  SET expected_visit_date = COALESCE(requested_date, CURRENT_DATE)
  WHERE expected_visit_date IS NULL;

