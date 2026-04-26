-- Remember request status when moving to on hold so resume can restore it.
-- Run once, for example:
--   mysql -h HOST -u USER -p DB_NAME < server/migrations/005_status_before_hold.sql

ALTER TABLE requests
  ADD COLUMN status_before_hold VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'Workflow status before on_hold; cleared on resume'
  AFTER status;
