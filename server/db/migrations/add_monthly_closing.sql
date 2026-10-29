-- Migration: Add Monthly Closing & Business History Tables
-- Created: 2026-05-31

-- Table 1: Monthly closing log with JSONB snapshot
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

-- Table 2: Employee leave balance per month (rolling ledger)
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

-- Table 3: Period unlock audit log
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

-- Add foreign key columns to link backdated entries to unlock audit
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS period_unlock_id INTEGER REFERENCES period_unlock_log(id) ON DELETE SET NULL;
ALTER TABLE office_expenses ADD COLUMN IF NOT EXISTS period_unlock_id INTEGER REFERENCES period_unlock_log(id) ON DELETE SET NULL;
