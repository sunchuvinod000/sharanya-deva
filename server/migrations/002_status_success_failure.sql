-- Replace terminal status "completed" with "success" and "failure".
-- Run once, for example:
--   mysql -h HOST -u USER -p DB_NAME < server/migrations/002_status_success_failure.sql

ALTER TABLE requests
  MODIFY COLUMN status ENUM(
    'pending', 'soil_collected', 'approved', 'rejected', 'visited',
    'completed', 'success', 'failure'
  ) NOT NULL DEFAULT 'pending';

UPDATE requests SET status = 'success' WHERE status = 'completed';

ALTER TABLE requests
  MODIFY COLUMN status ENUM(
    'pending', 'soil_collected', 'approved', 'rejected', 'visited',
    'success', 'failure'
  ) NOT NULL DEFAULT 'pending';
