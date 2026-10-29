-- scripts/fix_schema.sql
-- Run this on VPS: sudo -u postgres psql -d W4Y -f scripts/fix_schema.sql

-- 1. Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  remark TEXT,
  category VARCHAR(50) DEFAULT 'document',
  document_type VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Robustness: Add columns if table already existed without them
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'document';

-- 2. Project Payment Stages (Financial Tracking)
CREATE TABLE IF NOT EXISTS project_payment_stages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100),
  amount DECIMAL(15, 2) DEFAULT 0,
  initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'bill generated',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_project_payment_stages_type UNIQUE (project_id, document_type)
);

-- Robustness: Add columns and constraints if table already existed without them
ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_payment_stages_type'
    ) THEN
        ALTER TABLE project_payment_stages ADD CONSTRAINT uq_project_payment_stages_type UNIQUE (project_id, document_type);
    END IF;
END $$;

-- 3. Project Document Amounts (Potential/Contract Value)
CREATE TABLE IF NOT EXISTS project_document_amounts (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2) DEFAULT 0,
  PRIMARY KEY (project_id, document_type)
);

-- 4. Comments Table (Threaded discussion)
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_task BOOLEAN DEFAULT FALSE,
  task_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Expense Audits
CREATE TABLE IF NOT EXISTS expense_audits (
  category VARCHAR(100) NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (category, month, year)
);

-- 6. Holidays
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_paid BOOLEAN DEFAULT TRUE
);

-- 7. Employee Leave Summary (Monthly)
CREATE TABLE IF NOT EXISTS employee_leave_summary (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  unpaid_leaves DECIMAL(5, 2) DEFAULT 0,
  UNIQUE(user_id, month, year)
);

-- 8. Add missing indexes
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_stages_project ON project_payment_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);

-- 9. Fix existing tables (Add missing columns to transactions)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_id VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 10. Fix Attendance table (Geo-fencing & Late minutes)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkin_accuracy DECIMAL(10, 2);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkin_distance DECIMAL(10, 2);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkin_zone VARCHAR(20);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_boundary_checkin BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkin_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_lat DECIMAL(10, 8);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_lng DECIMAL(11, 8);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_accuracy DECIMAL(10, 2);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_distance DECIMAL(10, 2);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_zone VARCHAR(20);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkout_outside_zone BOOLEAN DEFAULT FALSE;

-- 11. Attendance Attempts table
CREATE TABLE IF NOT EXISTS attendance_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  accuracy DECIMAL(10, 2),
  distance DECIMAL(10, 2),
  zone VARCHAR(20),
  reason TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Leave Requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type VARCHAR(50) NOT NULL, -- sick, casual, etc.
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  remarks TEXT, -- admin remarks
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for leaves
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_date ON leave_requests(start_date, end_date);

-- 13. Fix Invoices (Add due_date and signature_data)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signature_data TEXT;


-- 14. Fix Project Payment Stages (Make name nullable if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_payment_stages' AND column_name = 'name'
    ) THEN
        ALTER TABLE project_payment_stages ALTER COLUMN name DROP NOT NULL;
    END IF;
END $$;


-- 15. Attendance Batches (timing groups)
CREATE TABLE IF NOT EXISTS attendance_batches (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  office_start_time TIME NOT NULL,
  late_threshold_time TIME NOT NULL,
  half_day_cutoff_time TIME NOT NULL,
  min_working_hours DECIMAL(4, 2) NOT NULL DEFAULT 4.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Link users to batches
ALTER TABLE users ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES attendance_batches(id) ON DELETE SET NULL;


