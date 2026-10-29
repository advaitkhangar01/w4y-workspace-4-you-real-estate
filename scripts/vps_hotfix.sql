-- scripts/vps_hotfix.sql
-- Run this on VPS: sudo -u postgres psql -d W4Y -f scripts/vps_hotfix.sql

-- 1. Ensure project_document_amounts table exists with proper default
CREATE TABLE IF NOT EXISTS project_document_amounts (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2) DEFAULT 0,
  PRIMARY KEY (project_id, document_type)
);

-- 2. Ensure project_payment_stages has all required columns and integrity
-- Cleanup duplicates if any exist before adding unique constraint
DELETE FROM project_payment_stages a USING project_payment_stages b
WHERE a.id > b.id 
  AND a.project_id = b.project_id 
  AND a.document_type = b.document_type;

ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add unique constraint to prevent double-billing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_payment_stages_type'
    ) THEN
        ALTER TABLE project_payment_stages ADD CONSTRAINT uq_project_payment_stages_type UNIQUE (project_id, document_type);
    END IF;
END $$;

-- 3. Ensure documents table has document_type column (if missing)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(100);

-- 4. Ensure comments table exists
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

-- 5. Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_stages_project ON project_payment_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);

-- 6. Normalize attendance statuses to lowercase to prevent case-sensitivity issues
UPDATE attendance SET status = LOWER(status) WHERE status IS NOT NULL;

