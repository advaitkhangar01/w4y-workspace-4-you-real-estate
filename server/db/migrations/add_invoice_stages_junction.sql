-- Junction table for multi-milestone invoicing
CREATE TABLE IF NOT EXISTS invoice_payment_stages (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_stage_id INTEGER NOT NULL REFERENCES project_payment_stages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(invoice_id, payment_stage_id)
);

CREATE INDEX IF NOT EXISTS idx_ips_invoice ON invoice_payment_stages(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ips_stage ON invoice_payment_stages(payment_stage_id);
