-- Migration 018: Add batch_id to attendance table to preserve the active batch at check-in
-- Note: Existing historical records remain NULL to preserve data integrity (do NOT fabricate historical batch assignments).

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES attendance_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_batch_id ON attendance(batch_id);
