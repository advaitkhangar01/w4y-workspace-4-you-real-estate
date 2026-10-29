-- W4Y Database Schema
-- Consolidation of main schema and fix_schema.sql updates

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Attendance Batches
CREATE TABLE IF NOT EXISTS attendance_batches (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  office_start_time TIME NOT NULL,
  late_threshold_time TIME NOT NULL,
  half_day_cutoff_time TIME NOT NULL,
  min_working_hours DECIMAL(4, 2) NOT NULL DEFAULT 9.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'design_head', 'design', 'liasoning', 'civil_engineer', 'employee', 'back_office', 'project_head')),
  department VARCHAR(100),
  phone VARCHAR(20),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  base_salary DECIMAL(15, 2) DEFAULT 0,
  hourly_rate DECIMAL(15, 2) DEFAULT 0,
  batch_id INTEGER REFERENCES attendance_batches(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Clients table
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  company_name VARCHAR(200) UNIQUE,
  gst_number VARCHAR(50),
  pan_number VARCHAR(50),
  notes TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.1 Client Contacts
CREATE TABLE IF NOT EXISTS client_contacts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  is_primary BOOLEAN DEFAULT FALSE
);

-- 2.2 Client Addresses
CREATE TABLE IF NOT EXISTS client_addresses (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  type VARCHAR(50), -- Billing, Site, Office
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(20)
);

-- 2.3 Client Banking
CREATE TABLE IF NOT EXISTS client_banking (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  account_name VARCHAR(200),
  account_number VARCHAR(100),
  ifsc VARCHAR(50),
  bank_name VARCHAR(200),
  branch VARCHAR(200),
  upi_id VARCHAR(100),
  is_primary BOOLEAN DEFAULT FALSE
);

-- 3. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name VARCHAR(200) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(300),
  area_sq_ft VARCHAR(100),
  structural_engineer VARCHAR(200),
  status VARCHAR(50) DEFAULT 'Under Proposal',
  start_date DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_project_name_client UNIQUE (name, client_name)
);

-- 4. Attendance table (with Geo-fencing & Late minutes)
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'working',
  is_late BOOLEAN DEFAULT FALSE,
  late_minutes INTEGER DEFAULT 0,
  checkin_accuracy DECIMAL(10, 2),
  checkin_distance DECIMAL(10, 2),
  checkin_zone VARCHAR(20),
  is_boundary_checkin BOOLEAN DEFAULT FALSE,
  checkin_verified BOOLEAN DEFAULT FALSE,
  checkout_lat DECIMAL(10, 8),
  checkout_lng DECIMAL(11, 8),
  checkout_accuracy DECIMAL(10, 2),
  checkout_distance DECIMAL(10, 2),
  checkout_zone VARCHAR(20),
  checkout_outside_zone BOOLEAN DEFAULT FALSE,
  hours_worked DECIMAL(10, 2) DEFAULT 0,
  batch_id INTEGER REFERENCES attendance_batches(id) ON DELETE SET NULL,
  UNIQUE(user_id, date)
);

-- 5. Attendance Attempts table
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

-- 6. Leave Requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(15, 2) DEFAULT 0,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  remarks TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Holidays
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_paid BOOLEAN DEFAULT TRUE
);

-- 8. Employee Leave Summary (Monthly)
CREATE TABLE IF NOT EXISTS employee_leave_summary (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  unpaid_leaves DECIMAL(5, 2) DEFAULT 0,
  UNIQUE(user_id, month, year)
);

-- 9. Project stages
CREATE TABLE IF NOT EXISTS project_stages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_name VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Project Payment Stages
CREATE TABLE IF NOT EXISTS project_payment_stages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255),
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'payment initiated',
  document_type VARCHAR(100),
  initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_project_payment_stages_type UNIQUE (project_id, document_type)
);

-- 11. Project Document Amounts
CREATE TABLE IF NOT EXISTS project_document_amounts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, document_type)
);

-- 12. Project assignments
CREATE TABLE IF NOT EXISTS project_assignments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(project_id, user_id)
);

-- 13. Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  name VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  remarks TEXT
);

-- 14. Documents table
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

-- 15. Comments table (Threaded discussion)
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_task BOOLEAN DEFAULT FALSE,
  task_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_no VARCHAR(50) UNIQUE NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name VARCHAR(200),
  client_company VARCHAR(200),
  amount DECIMAL(15, 2) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  items JSONB,
  tax_details JSONB,
  status VARCHAR(30) DEFAULT 'generated',
  due_date DATE,
  signature_data TEXT,
  payment_stage_id INTEGER REFERENCES project_payment_stages(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Transactions (Finance)
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(10) CHECK (type IN ('income', 'expense')),
  category VARCHAR(50) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  description TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reference_id VARCHAR(100),
  receipt_url TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Office Expenses
CREATE TABLE IF NOT EXISTS office_expenses (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  description TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. Expense Audits
CREATE TABLE IF NOT EXISTS expense_audits (
  category VARCHAR(100) NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (category, month, year)
);

-- 20. Payroll table
CREATE TABLE IF NOT EXISTS payroll (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  base_salary DECIMAL(15, 2) NOT NULL,
  bonus DECIMAL(15, 2) DEFAULT 0,
  incentives DECIMAL(15, 2) DEFAULT 0,
  deductions DECIMAL(15, 2) DEFAULT 0,
  overtime_pay DECIMAL(15, 2) DEFAULT 0,
  overtime_hours DECIMAL(8, 2) DEFAULT 0,
  net_paid DECIMAL(15, 2) NOT NULL,
  payment_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'paid',
  is_manual_override BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, month, year)
);

-- 21. App Settings
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  value TEXT,
  description TEXT
);

-- 22. Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage VARCHAR(50) NOT NULL DEFAULT 'proposal',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'review', 'done', 'passed')),
  start_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. Task participants
CREATE TABLE IF NOT EXISTS task_participants (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

-- 24. Task messages
CREATE TABLE IF NOT EXISTS task_messages (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  mentions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_stages_project ON project_payment_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_date ON leave_requests(start_date, end_date);

-- 26. Monthly Closing Log
CREATE TABLE IF NOT EXISTS monthly_closing_log (
  id SERIAL PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  closed_by INT REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  financial_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by INT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_monthly_closing UNIQUE (month, year)
);

-- 27. Period Unlock Log
CREATE TABLE IF NOT EXISTS period_unlock_log (
  id SERIAL PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  unlocked_by INT REFERENCES users(id) ON DELETE SET NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL,
  relocked_at TIMESTAMPTZ,
  relocked_by INT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 29. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  section VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  action_url VARCHAR(255),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  tenant_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 30. Monthly Closing Log
CREATE TABLE IF NOT EXISTS monthly_closing_log (
  id                      SERIAL PRIMARY KEY,
  month                   INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                    INTEGER NOT NULL CHECK (year >= 2020),
  closed_by               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at               TIMESTAMPTZ DEFAULT NOW(),
  had_pending_payroll     BOOLEAN DEFAULT FALSE,
  pending_payroll_count   INTEGER DEFAULT 0,
  pending_payroll_amount  DECIMAL(15,2) DEFAULT 0,
  close_reason            TEXT,
  snapshot                JSONB NOT NULL DEFAULT '{}',
  UNIQUE(month, year)
);

-- 31. Employee Leave Balance per month
CREATE TABLE IF NOT EXISTS employee_leave_balance (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             INTEGER NOT NULL CHECK (year >= 2020),
  opening_balance  DECIMAL(5,2) DEFAULT 0,
  earned           DECIMAL(5,2) DEFAULT 1.5,
  leaves_taken     DECIMAL(5,2) DEFAULT 0,
  closing_balance  DECIMAL(5,2) DEFAULT 0,
  unpaid_leaves    DECIMAL(5,2) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month, year)
);

-- 32. Period Unlock Audit Log
CREATE TABLE IF NOT EXISTS period_unlock_log (
  id             SERIAL PRIMARY KEY,
  month          INTEGER NOT NULL,
  year           INTEGER NOT NULL,
  unlocked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  unlocked_at    TIMESTAMPTZ DEFAULT NOW(),
  reason         TEXT NOT NULL,
  relocked_at    TIMESTAMPTZ,
  relocked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active      BOOLEAN DEFAULT TRUE
);


