-- Migration 021: Attendance integrity constraints, overtime column, and performance index

-- 1. Add overtime_hours column if not exists
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(10, 2) DEFAULT 0.00;

-- 2. Add performance index on attendance(date)
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- 3. Backfill sanitize any legacy records where half_day or absent carried late markers
UPDATE attendance
SET is_late = FALSE, late_minutes = 0
WHERE LOWER(COALESCE(status, '')) IN ('half_day', 'absent')
  AND (is_late = TRUE OR late_minutes > 0);

-- 4. Guarded constraints added as NOT VALID then validated
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_status') THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_status
      CHECK (status IN ('working', 'completed', 'present', 'half_day', 'absent', 'leave', 'sunday', 'holiday', 'upcoming', 'today_pending')) NOT VALID;
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_late_minutes_non_negative') THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_late_minutes_non_negative
      CHECK (late_minutes >= 0) NOT VALID;
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_late_minutes_non_negative;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_hours_worked_non_negative') THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_hours_worked_non_negative
      CHECK (hours_worked >= 0) NOT VALID;
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_hours_worked_non_negative;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_half_day_absent_no_late') THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_half_day_absent_no_late
      CHECK (NOT (LOWER(COALESCE(status, '')) IN ('half_day', 'absent') AND (is_late = TRUE OR late_minutes > 0))) NOT VALID;
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_half_day_absent_no_late;
  END IF;
END $$;
