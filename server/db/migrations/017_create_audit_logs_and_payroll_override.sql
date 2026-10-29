-- Migration 017: Create Audit Logs Table and Add Manual Override Flag to Payroll

-- 1. Create audit_logs table for enterprise audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- 2. Add is_manual_override column to payroll table to protect admin-approved salary records
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;

-- 3. Insert setting for Monthly Close Grace Buffer Days (Default 3 days: 1st - 3rd of month)
INSERT INTO app_settings (key, value, description)
VALUES ('monthly_close_grace_days', '3', 'Number of grace review days before automated monthly close executes (e.g. 3 = closes on 4th of month at 00:00 IST)')
ON CONFLICT (key) DO NOTHING;
