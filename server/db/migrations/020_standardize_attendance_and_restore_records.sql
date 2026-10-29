-- Migration 020: Standardize attendance status to lowercase and restore Abhijit's missing May 5 record

-- 1. Standardize all existing attendance statuses to lowercase
UPDATE attendance 
SET status = LOWER(status) 
WHERE status IS NOT NULL AND status != LOWER(status);

-- 2. Restore Abhijit's check-in for May 5, 2026 if missing (User ID 1 on VPS)
INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
SELECT 1, '2026-05-05'::date, '2026-05-05 10:00:00+05:30'::timestamptz, '2026-05-05 19:00:00+05:30'::timestamptz, 'completed', false, 0, 9.0
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
ON CONFLICT (user_id, date) DO NOTHING;
