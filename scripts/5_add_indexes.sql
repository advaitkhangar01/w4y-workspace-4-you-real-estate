-- scripts/5_add_indexes.sql
-- Indexes for performance beyond what's in schema.sql

-- New: project lookups by client name (varchar FK pattern)
CREATE INDEX IF NOT EXISTS idx_projects_client_name ON projects(client_name);

-- New: project status filtering
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- New: task status filtering
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- New: attendance date range queries
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
