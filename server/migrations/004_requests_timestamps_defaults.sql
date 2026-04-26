-- Ensure INSERTs without explicit timestamps work (matches schema.sql; fixes Prisma db push omitting defaults).
-- Run once if you see: Field 'updated_at' doesn't have a default value
--   mysql ... < server/migrations/004_requests_timestamps_defaults.sql

ALTER TABLE requests
  MODIFY COLUMN created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY COLUMN updated_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
