-- Migration 015: Master dropdowns table for Attendance & Leave options
CREATE TABLE IF NOT EXISTS attendance_dropdown_masters (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL, -- 'request_category', 'leave_subtype', 'work_location', 'attendance_status'
  key VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT 'slate',
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT DEFAULT 0,
  meta_json JSONB DEFAULT '{}', -- holds category specific flags
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_category ON attendance_dropdown_masters(category);
CREATE INDEX IF NOT EXISTS idx_adm_active ON attendance_dropdown_masters(is_active);

-- Seed default request categories if not present
INSERT INTO attendance_dropdown_masters (category, key, label, description, color, is_active, display_order, meta_json)
VALUES 
  ('request_category', 'leave', 'Full Day Leave', 'Apply for single or multi-day full day leaves', 'violet', true, 1, '{"requires_end_date": true, "show_subtypes": true}'),
  ('request_category', 'half_day', 'Half Day Request', 'Apply for a morning or afternoon half day request', 'amber', true, 2, '{"requires_end_date": false, "show_subtypes": false}'),
  ('request_category', 'advance', 'Salary Advance', 'Request an advance payment against salary', 'emerald', true, 3, '{"requires_amount": true, "requires_end_date": false, "show_subtypes": false}'),
  ('request_category', 'resignation', 'Resignation Notice', 'Submit formal notice for resignation', 'red', true, 4, '{"requires_end_date": false, "show_subtypes": false}')
ON CONFLICT (key) DO NOTHING;

-- Seed default leave sub-types if not present
INSERT INTO attendance_dropdown_masters (category, key, label, description, color, is_active, display_order, meta_json)
VALUES 
  ('leave_subtype', 'casual', 'Casual Leave', 'Short term planned personal leave', 'blue', true, 1, '{}'),
  ('leave_subtype', 'sick', 'Sick Leave', 'Leave taken due to illness or health issue', 'rose', true, 2, '{}'),
  ('leave_subtype', 'emergency', 'Emergency Leave', 'Urgent unplanned leave', 'orange', true, 3, '{}'),
  ('leave_subtype', 'unpaid', 'Unpaid Leave', 'Leave without pay allocation', 'slate', true, 4, '{}')
ON CONFLICT (key) DO NOTHING;

-- Seed default work locations if not present
INSERT INTO attendance_dropdown_masters (category, key, label, description, color, is_active, display_order, meta_json)
VALUES 
  ('work_location', 'office', 'Main Office', 'Working on site at head office', 'emerald', true, 1, '{}'),
  ('work_location', 'client_site', 'Client Site', 'Working at client site or project location', 'sky', true, 2, '{}'),
  ('work_location', 'wfh', 'Work From Home', 'Remote working from home', 'indigo', true, 3, '{}')
ON CONFLICT (key) DO NOTHING;
