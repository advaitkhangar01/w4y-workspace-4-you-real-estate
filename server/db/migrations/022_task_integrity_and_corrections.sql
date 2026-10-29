-- Migration 022: Task Integrity, Safe Data Corrections, and Lifecycle Standardization
-- Idempotent, transaction-safe, and non-destructive.

-- 1. Ensure required columns exist on tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reassigned_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;

-- 2. Backfill completed_at for passed tasks missing timestamps
UPDATE tasks 
SET completed_at = COALESCE(updated_at, created_at, NOW()) 
WHERE status = 'passed' AND completed_at IS NULL;

-- 3. Standardize legacy 'done' status to 'passed' to prevent limbo state
UPDATE tasks 
SET status = 'passed', completed_at = COALESCE(updated_at, created_at, NOW()) 
WHERE status = 'done';

-- 4. Ensure task creators and assignees are registered in task_participants
INSERT INTO task_participants (task_id, user_id, added_by)
SELECT id, created_by, created_by FROM tasks 
WHERE created_by IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

INSERT INTO task_participants (task_id, user_id, added_by)
SELECT id, assigned_to, created_by FROM tasks 
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

-- 5. Add index on tasks(status, completed_at) for efficient cleanup & filtering
CREATE INDEX IF NOT EXISTS idx_tasks_status_completed ON tasks(status, completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
