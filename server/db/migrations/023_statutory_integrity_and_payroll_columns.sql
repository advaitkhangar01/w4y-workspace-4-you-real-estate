-- Migration 023: Statutory Integrity, Payroll Overtime Columns & Guarded Constraints
-- Safe, additive, idempotent DDL for Hostinger VPS & local development

-- 1. Add overtime columns to payroll table
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS overtime_pay DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(8, 2) DEFAULT 0;

-- 2. Ensure project_stakeholders.created_at is TIMESTAMPTZ
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_stakeholders' AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE project_stakeholders ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Kolkata';
  END IF;
END $$;

-- 3. Statutory Foreign Key Protection:
-- leave_requests.reviewed_by ON DELETE SET NULL
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'leave_requests'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'reviewed_by'
      AND rc.delete_rule = 'CASCADE'
  ) LOOP
    EXECUTE 'ALTER TABLE leave_requests DROP CONSTRAINT ' || quote_ident(r.constraint_name);
    EXECUTE 'ALTER TABLE leave_requests ADD CONSTRAINT ' || quote_ident(r.constraint_name) || ' FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL';
  END LOOP;
END $$;

-- 4. Guarded Non-Negative Constraints (NOT VALID for zero existing-data breakage risk)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_base_salary_non_negative'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_base_salary_non_negative CHECK (base_salary >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payroll_net_paid_non_negative'
  ) THEN
    ALTER TABLE payroll ADD CONSTRAINT chk_payroll_net_paid_non_negative CHECK (net_paid >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_hours_worked_non_negative'
  ) THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_hours_worked_non_negative CHECK (hours_worked >= 0) NOT VALID;
  END IF;
END $$;
