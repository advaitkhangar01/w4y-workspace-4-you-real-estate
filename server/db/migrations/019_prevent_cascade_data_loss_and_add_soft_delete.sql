-- Migration 019: Prevent cascade data loss on statutory records and add user soft-delete support

-- 1. Create schema_migrations tracking table if not exists
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add soft-delete fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- 3. Replace dangerous ON DELETE CASCADE with ON DELETE RESTRICT on payroll
ALTER TABLE payroll DROP CONSTRAINT IF EXISTS payroll_user_id_fkey;
ALTER TABLE payroll 
    ADD CONSTRAINT payroll_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- 4. Replace dangerous ON DELETE CASCADE with ON DELETE RESTRICT on attendance
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_user_id_fkey;
ALTER TABLE attendance 
    ADD CONSTRAINT attendance_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- 5. Add index on users(is_active) for fast filtering in queries
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- 6. Ensure employee_leave_balance cascades properly with user
ALTER TABLE employee_leave_balance DROP CONSTRAINT IF EXISTS employee_leave_balance_user_id_fkey;
ALTER TABLE employee_leave_balance 
    ADD CONSTRAINT employee_leave_balance_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

