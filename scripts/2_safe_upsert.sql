-- scripts/2_safe_upsert.sql
-- Idempotent UPSERT with normalization (Preserving Tasks & Attendance on VPS)

-- 1. Create temporary tables for all exported data
CREATE TEMP TABLE import_users (LIKE users INCLUDING ALL);
CREATE TEMP TABLE import_clients (LIKE clients INCLUDING ALL);
CREATE TEMP TABLE import_vendors (LIKE vendors INCLUDING ALL);
CREATE TEMP TABLE import_projects (LIKE projects INCLUDING ALL);
CREATE TEMP TABLE import_invoices (LIKE invoices INCLUDING ALL);
CREATE TEMP TABLE import_payroll (LIKE payroll INCLUDING ALL);
CREATE TEMP TABLE import_app_settings (LIKE app_settings INCLUDING ALL);

-- [Note: populate these temp tables from local_clean_export.sql first]

-- 2. Safe UPSERT for Users (Match by username to preserve existing VPS user_id)
INSERT INTO users (name, role, department, phone, username, password_hash)
SELECT name, role, department, phone, username, password_hash FROM import_users
ON CONFLICT (username) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  phone = EXCLUDED.phone;

-- 3. Safe UPSERT for Clients (Match by company_name)
INSERT INTO clients (name, company_name, phone, email, address)
SELECT name, company_name, phone, email, address FROM import_clients
ON CONFLICT (company_name) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone;

-- 4. Safe UPSERT for Vendors (Match by name)
INSERT INTO vendors (category, name, phone, email, remarks)
SELECT category, name, phone, email, remarks FROM import_vendors
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  phone = EXCLUDED.phone;

-- 5. Safe UPSERT for Projects (Match by name + client_name to preserve VPS project_id)
INSERT INTO projects (name, client_name, type, location, area_sq_ft, structural_engineer, status, start_date, created_by)
SELECT name, client_name, type, location, area_sq_ft, structural_engineer, status, start_date, created_by FROM import_projects
ON CONFLICT (name, client_name) DO UPDATE SET
  status = EXCLUDED.status,
  location = EXCLUDED.location;

-- 6. Safe UPSERT for Invoices (Match by invoice_no)
INSERT INTO invoices (invoice_no, project_id, client_id, client_name, amount, date, items, tax_details, status, due_date)
SELECT invoice_no, project_id, client_id, client_name, amount, date, items, tax_details, status, due_date FROM import_invoices
ON CONFLICT (invoice_no) DO UPDATE SET
  status = EXCLUDED.status,
  amount = EXCLUDED.amount;

-- 7. Safe UPSERT for Payroll (Match by user + month + year)
INSERT INTO payroll (user_id, month, year, base_salary, bonus, deductions, net_paid, status, payment_date)
SELECT user_id, month, year, base_salary, bonus, deductions, net_paid, status, payment_date FROM import_payroll
ON CONFLICT (user_id, month, year) DO UPDATE SET
  net_paid = EXCLUDED.net_paid,
  status = EXCLUDED.status;

-- 8. Safe UPSERT for App Settings (Match by key)
INSERT INTO app_settings (key, value)
SELECT key, value FROM import_app_settings
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
