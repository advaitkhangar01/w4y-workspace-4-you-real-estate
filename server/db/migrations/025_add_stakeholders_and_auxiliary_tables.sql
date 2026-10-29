-- Migration 025: Add Project Stakeholders, Project Vendors, and Auxiliary Tables
-- Recreates missing schema entities discovered during W4Y platform verification

-- 1. Project Stakeholders
CREATE TABLE IF NOT EXISTS project_stakeholders (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_stakeholders_project_id ON project_stakeholders(project_id);
CREATE INDEX IF NOT EXISTS idx_project_stakeholders_primary ON project_stakeholders(project_id, is_primary);

-- 2. Project Vendors (Many-to-Many association)
CREATE TABLE IF NOT EXISTS project_vendors (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT project_vendors_project_id_vendor_id_key UNIQUE (project_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_project_vendors_project_id ON project_vendors(project_id);
CREATE INDEX IF NOT EXISTS idx_project_vendors_vendor_id ON project_vendors(vendor_id);

-- 3. Auxiliary Lookup Tables from Original Inventory
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT expense_categories_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS project_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT project_types_name_key UNIQUE (name)
);
