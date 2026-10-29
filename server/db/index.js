const dotenv = require('dotenv');
const dotenvPath = require('path').join(__dirname, '..', '.env');
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: dotenvPath });
} else {
  dotenv.config({ path: dotenvPath, override: true });
}

// Safety Guard: Database isolation
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}
if (/ds16/i.test(process.env.DATABASE_URL)) {
  throw new Error('SAFETY ERROR: DATABASE_URL must not point to any DS16 infrastructure or database name.');
}
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 8,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')) 
    ? { rejectUnauthorized: false } 
    : false,
  options: "-c timezone=Asia/Kolkata",
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error on idle client:', err);
});

// Note: Timezone is set at the connection level via pool options, and role-level fallback is wrapped in a safe catch.

// Test connection on startup (disabled in tests)
if (process.env.NODE_ENV !== 'test') {
  pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ DB connection failed:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL');
    
    // Auto-Migration: Ensure schema is correct for user deletion and missing columns
    const runMigrations = async () => {
      let lockClient;
      try {
        if (pool.ending) return;
        lockClient = await pool.connect();
        const { rows } = await lockClient.query('SELECT pg_try_advisory_lock(987654322) as locked');
        if (!rows[0] || !rows[0].locked) {
          console.log('ℹ️ Another process is running schema migrations. Skipping.');
          return;
        }

        // Set IST timezone for the database role to ensure CURRENT_DATE, NOW(), and timestamps 
        // are always interpreted in Asia/Kolkata (IST = UTC+5:30), preventing the 
        // UTC vs IST date mismatch that causes attendance bugs between 00:00–05:30 IST.
        try {
          await pool.query("ALTER ROLE CURRENT_USER SET timezone TO 'Asia/Kolkata'");
        } catch (tzErr) {
          console.warn('[DB Warning] Failed to alter role timezone setting (missing permissions):', tzErr.message);
        }

        // 1. Fix Foreign Keys for users(id) to support deletion
        // Only drops and recreates the foreign key constraint if the delete rule is not already correct
        await pool.query(`
          DO $$ 
          DECLARE 
              r RECORD;
              should_cascade BOOLEAN;
              needs_update BOOLEAN;
          BEGIN
              FOR r IN (
                  SELECT 
                      tc.table_name, 
                      tc.constraint_name, 
                      kcu.column_name,
                      rc.delete_rule
                  FROM 
                      information_schema.table_constraints AS tc 
                      JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                      JOIN information_schema.constraint_column_usage AS ccu
                        ON ccu.constraint_name = tc.constraint_name
                        AND ccu.table_schema = tc.table_schema
                      JOIN information_schema.referential_constraints AS rc
                        ON rc.constraint_name = tc.constraint_name
                        AND rc.constraint_schema = tc.table_schema
                  WHERE tc.constraint_type = 'FOREIGN KEY' 
                    AND ccu.table_name = 'users'
                    AND ccu.column_name = 'id'
              ) LOOP
                  -- Statutory Protection: payroll and attendance MUST NOT cascade on delete
                  IF r.table_name IN ('payroll', 'attendance') THEN
                      IF r.delete_rule = 'CASCADE' THEN
                          EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                          EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                                  ' FOREIGN KEY (' || quote_ident(r.column_name) || ') REFERENCES users(id) ON DELETE RESTRICT';
                      END IF;
                  ELSE
                      should_cascade := (r.column_name = 'user_id' OR r.table_name IN ('leave_requests', 'employee_leave_balance', 'daily_reports', 'notifications', 'task_participants', 'project_assignments'));
                      needs_update := (should_cascade AND r.delete_rule <> 'CASCADE') OR (NOT should_cascade AND r.delete_rule <> 'SET NULL');
                      
                      IF needs_update THEN
                          EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                          
                          IF should_cascade THEN
                              EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                                      ' FOREIGN KEY (' || quote_ident(r.column_name) || ') REFERENCES users(id) ON DELETE CASCADE';
                          ELSE
                              EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                                      ' FOREIGN KEY (' || quote_ident(r.column_name) || ') REFERENCES users(id) ON DELETE SET NULL';
                          END IF;
                      END IF;
                  END IF;
              END LOOP;
          END $$;
        `);

        // 2. Fix attendance status default value
        await pool.query("ALTER TABLE attendance ALTER COLUMN status SET DEFAULT 'working'");
        await pool.query("UPDATE attendance SET status = LOWER(status) WHERE status IS NOT NULL AND status <> LOWER(status)");
        
        // 3. Ensure invoices table has due_date and signature_data columns
        await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE");
        await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signature_data TEXT");
        await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_company VARCHAR(200)");
        
        // 4. Ensure project_payment_stages is correct
        await pool.query(`
          CREATE TABLE IF NOT EXISTS project_payment_stages (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(255),
            amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
            status VARCHAR(50) DEFAULT 'payment initiated',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            document_type VARCHAR(100),
            initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);

        // Set default value for status to 'payment initiated'
        await pool.query("ALTER TABLE project_payment_stages ALTER COLUMN status SET DEFAULT 'payment initiated'");

        // Ensure invoices table has payment_stage_id foreign key column
        await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_stage_id INTEGER REFERENCES project_payment_stages(id) ON DELETE SET NULL");

        // Make name nullable safely
        await pool.query(`
          DO $$
          BEGIN
              IF EXISTS (
                  SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'project_payment_stages' AND column_name = 'name'
              ) THEN
                  ALTER TABLE project_payment_stages ALTER COLUMN name DROP NOT NULL;
              END IF;
          END $$;
        `);
        
        // Add missing columns to project_payment_stages if they don't exist
        await pool.query("ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS document_type VARCHAR(100)");
        await pool.query("ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
        await pool.query("ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");


        // 5. Ensure project_document_amounts exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS project_document_amounts (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            document_type VARCHAR(100) NOT NULL,
            amount DECIMAL(15, 2),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, document_type)
          )
        `);

        // 6. Ensure documents table exists
        await pool.query(`
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
          )
        `);

        // 6b. Add new document metadata columns (non-destructive — nullable)
        await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_name VARCHAR(500)");
        await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS stored_name  VARCHAR(500)");
        await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS extension    VARCHAR(20)");

        // 6c. Performance index for document lookups by project + type
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_documents_project_type
            ON documents(project_id, document_type)
        `);

        // 7. Ensure comments table exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);

        // 8. Ensure leave_requests exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS leave_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            type VARCHAR(50) NOT NULL,
            reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            remarks TEXT,
            reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS amount DECIMAL(15, 2) DEFAULT 0');
        await pool.query("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'casual'");
        await pool.query("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS remarks TEXT");
        await pool.query("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
        await pool.query("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");
        await pool.query('CREATE INDEX IF NOT EXISTS idx_leaves_user ON leave_requests(user_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_leaves_date ON leave_requests(start_date, end_date)');
        
        // Analytical indexes for reporting speed optimizations
        await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_type_cat ON transactions(type, category)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(year, month)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_payroll_date ON payroll(payment_date)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id)');
        
        // 9. Ensure payroll table has incentives column
        await pool.query("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS incentives DECIMAL(15, 2) DEFAULT 0");

        // 10. Hourly Salary & Attendance Hours
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(15, 2) DEFAULT 0");
        await pool.query("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(10, 2) DEFAULT 0");
        await pool.query("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES attendance_batches(id) ON DELETE SET NULL");
        await pool.query("CREATE INDEX IF NOT EXISTS idx_attendance_batch_id ON attendance(batch_id)");

        // 11. Update users check constraint and migrate accounts role to back_office
        // Only run if the check constraint doesn't exist or doesn't have 'back_office'
        const { rows: usersRoleCheck } = await pool.query(`
          SELECT pg_get_constraintdef(c.oid) as def
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE c.conname = 'users_role_check' AND t.relname = 'users'
        `);
        if (usersRoleCheck.length === 0 || !usersRoleCheck[0].def.includes('back_office')) {
          await pool.query(`
            DO $$ 
            BEGIN 
              -- Migrate any existing accounts users to back_office
              UPDATE users SET role = 'back_office' WHERE role = 'accounts';

              -- Drop old constraint and recreate with new roles list
              ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
              ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'design_head', 'design', 'liasoning', 'civil_engineer', 'employee', 'back_office'));
            END $$;
          `);
        }

        // 12. Allow 'passed' status in tasks check constraint
        const { rows: tasksStatusCheck } = await pool.query(`
          SELECT pg_get_constraintdef(c.oid) as def
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE c.conname = 'tasks_status_check' AND t.relname = 'tasks'
        `);
        if (tasksStatusCheck.length === 0 || !tasksStatusCheck[0].def.includes('passed')) {
          await pool.query(`
            DO $$
            BEGIN
              ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
              ALTER TABLE tasks ADD CONSTRAINT tasks_status_check 
                CHECK (status IN ('pending', 'in_progress', 'review', 'done', 'passed'));
            END $$;
          `);
        }

        // 12.5. Update users check constraint to include project_head
        const { rows: usersRoleCheckProjectHead } = await pool.query(`
          SELECT pg_get_constraintdef(c.oid) as def
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE c.conname = 'users_role_check' AND t.relname = 'users'
        `);
        if (usersRoleCheckProjectHead.length > 0 && !usersRoleCheckProjectHead[0].def.includes('project_head')) {
          await pool.query(`
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
            ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'design_head', 'design', 'liasoning', 'civil_engineer', 'employee', 'back_office', 'project_head'));
          `);
        }

        // 13. Auto-sync PostgreSQL serial sequences to prevent duplicate key violations (projects_pkey etc.)
        // Only run if the sequence value is actually behind the max ID to prevent concurrent write issues
        await pool.query(`
          DO $$ 
          DECLARE 
              r RECORD;
              curr_val bigint;
              max_val bigint;
              seq_name_part text;
          BEGIN
              FOR r IN (
                  SELECT 
                      tc.table_name, 
                      kcu.column_name,
                      pg_get_serial_sequence(tc.table_name, kcu.column_name) as seq_name
                  FROM 
                      information_schema.table_constraints AS tc 
                      JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                  WHERE tc.constraint_type = 'PRIMARY KEY' 
                    AND tc.table_schema = 'public'
              ) LOOP
                  IF r.seq_name IS NOT NULL THEN
                      seq_name_part := split_part(r.seq_name, '.', 2);
                      
                      -- Fetch last_value from pg_sequences
                      SELECT last_value INTO curr_val 
                      FROM pg_sequences 
                      WHERE schemaname = 'public' AND sequencename = seq_name_part;
                      
                      -- Fetch max id from table
                      EXECUTE 'SELECT COALESCE(MAX(' || quote_ident(r.column_name) || '), 1) FROM ' || quote_ident(r.table_name) INTO max_val;
                      
                      -- Only setval if the sequence is behind the max id
                      IF curr_val IS NULL OR curr_val < max_val THEN
                          EXECUTE 'SELECT setval(' || quote_literal(r.seq_name) || ', ' || max_val || ')';
                      END IF;
                  END IF;
              END LOOP;
          END $$;
        `);

        // 14. Auto-heal: Link unlinked invoices to matching payment stages by project, amount, and document type
        await pool.query(`
          UPDATE invoices i
          SET payment_stage_id = pps.id
          FROM project_payment_stages pps
          WHERE i.payment_stage_id IS NULL
            AND i.project_id = pps.project_id
            AND ABS(i.amount - pps.amount) < 0.01
            AND (
              pps.document_type IS NULL 
              OR i.items::text ILIKE '%' || pps.document_type || '%'
              OR i.invoice_no ILIKE '%' || pps.document_type || '%'
            )
        `);

        // 15. Auto-sync: Update payment stages to 'paid' or 'bill generated' if they have linked active invoices
        await pool.query(`
          UPDATE project_payment_stages pps
          SET status = CASE 
            WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.payment_stage_id = pps.id AND i.status = 'paid') THEN 'paid'
            ELSE 'bill generated'
          END,
          updated_at = NOW()
          WHERE EXISTS (
            SELECT 1 FROM invoices i 
            WHERE i.payment_stage_id = pps.id 
              AND i.status != 'cancelled'
          )
          AND pps.status != 'paid'
        `);

        // 16. Auto-sync: Revert payment stages to 'payment initiated' if no active invoices are linked
        await pool.query(`
          UPDATE project_payment_stages pps
          SET status = 'payment initiated', updated_at = NOW()
          WHERE LOWER(pps.status) IN ('bill generated', 'bill delivered', 'paid')
            AND NOT EXISTS (
              SELECT 1 FROM invoices i 
              WHERE i.payment_stage_id = pps.id 
                AND i.status != 'cancelled'
            )
        `);

        // 17. Junction table for multi-milestone invoicing
        await pool.query(`
          CREATE TABLE IF NOT EXISTS invoice_payment_stages (
            id SERIAL PRIMARY KEY,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            payment_stage_id INTEGER NOT NULL REFERENCES project_payment_stages(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(invoice_id, payment_stage_id)
          );
          CREATE INDEX IF NOT EXISTS idx_ips_invoice ON invoice_payment_stages(invoice_id);
          CREATE INDEX IF NOT EXISTS idx_ips_stage ON invoice_payment_stages(payment_stage_id);
        `);

        // 18. Add received_amount column to invoices and backfill existing paid records
        await pool.query(`
          ALTER TABLE invoices ADD COLUMN IF NOT EXISTS received_amount DECIMAL(15, 2) DEFAULT 0.00;
        `);
        await pool.query(`
          UPDATE invoices 
          SET received_amount = amount 
          WHERE LOWER(status) = 'paid' AND (received_amount IS NULL OR received_amount = 0);
        `);

        // 19. Ensure Monthly Closing & Business History tables exist
        await pool.query(`
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
        `);

        await pool.query(`
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
        `);

        await pool.query(`
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
        `);

        await pool.query(`
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS period_unlock_id INTEGER REFERENCES period_unlock_log(id) ON DELETE SET NULL;
        `);

        await pool.query(`
          ALTER TABLE office_expenses ADD COLUMN IF NOT EXISTS period_unlock_id INTEGER REFERENCES period_unlock_log(id) ON DELETE SET NULL;
        `);

        await pool.query(`
          ALTER TABLE expense_audits ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
        `);

        await pool.query(`
          ALTER TABLE expense_audits ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NOW();
        `);

        // Ensure company_capital table exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS company_capital (
            id              SERIAL PRIMARY KEY,
            month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
            year            INTEGER NOT NULL CHECK (year >= 2020),
            amount          DECIMAL(15,2) NOT NULL DEFAULT 0.00,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            description     TEXT,
            UNIQUE(month, year)
          );
        `);

        // 20. Ensure tasks table has start_date column
        await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE");
        await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ");
        await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reassigned_at TIMESTAMPTZ");
        await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'))");
        await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE");

        // 21. Attendance Batches table and foreign key setup
        await pool.query(`
          CREATE TABLE IF NOT EXISTS attendance_batches (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) UNIQUE NOT NULL,
            office_start_time TIME NOT NULL,
            late_threshold_time TIME NOT NULL,
            half_day_cutoff_time TIME NOT NULL,
            min_working_hours DECIMAL(4, 2) NOT NULL DEFAULT 4.00,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);

        const { rows: batchCount } = await pool.query('SELECT COUNT(*) FROM attendance_batches');
        if (parseInt(batchCount[0].count) === 0) {
          await pool.query(`
            INSERT INTO attendance_batches (name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours) VALUES
            ('9 AM Batch', '09:00:00', '09:15:00', '13:00:00', 4.00),
            ('10 AM Batch', '10:00:00', '10:15:00', '13:00:00', 4.00),
            ('11 AM Batch', '11:00:00', '11:15:00', '14:00:00', 4.00)
          `);
        }

        await pool.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES attendance_batches(id) ON DELETE SET NULL
        `);

        // 22. Tenants and Daily Reports tables
        await pool.query(`
          CREATE TABLE IF NOT EXISTS tenants (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);

        await pool.query(`
          INSERT INTO tenants (id, name) VALUES (1, 'Default Tenant') ON CONFLICT (id) DO NOTHING;
        `);

        await pool.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL DEFAULT 1;
        `);

        await pool.query(`
          UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS daily_reports (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE DEFAULT 1,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            date DATE NOT NULL DEFAULT CURRENT_DATE,
            work_done TEXT NOT NULL,
            blockers TEXT NULL,
            next_day_plan TEXT NULL,
            hours_worked DECIMAL(5, 2) DEFAULT 8.00,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_daily_reports_tenant_user_date UNIQUE (tenant_id, user_id, date)
          );
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(tenant_id, user_id, date);
        `);

        // 23. Self-healing DB: Fix NOT NULL constraints for cascade deletions
        await pool.query(`
          ALTER TABLE documents ALTER COLUMN uploaded_by DROP NOT NULL;
        `);

        await pool.query(`
          ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL;
        `);

        await pool.query(`
          ALTER TABLE comments ALTER COLUMN assigned_to DROP NOT NULL;
        `);

        // 24. Delete duplicate entries from monthly close history and payroll logs
        console.log('🧹 DB Self-Healing: Cleaning up duplicate monthly close and payroll entries...');

        await pool.query(`
          DELETE FROM payroll a USING payroll b 
          WHERE a.id < b.id AND a.user_id = b.user_id AND a.month = b.month AND a.year = b.year;
        `);

        await pool.query(`
          DELETE FROM monthly_closing_log a USING monthly_closing_log b 
          WHERE a.id < b.id AND a.month = b.month AND a.year = b.year;
        `);

        await pool.query(`
          DELETE FROM expense_audits a USING expense_audits b 
          WHERE a.id < b.id AND a.category = b.category AND a.month = b.month AND a.year = b.year;
        `);

        await pool.query(`
          DELETE FROM employee_leave_balance a USING employee_leave_balance b 
          WHERE a.id < b.id AND a.user_id = b.user_id AND a.month = b.month AND a.year = b.year;
        `);

        // 25. Enforce unique constraints on relevant tables
        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'payroll'::regclass AND conname = 'uq_payroll_user_month_year'
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'payroll'::regclass AND conname = 'payroll_user_id_month_year_key'
            ) THEN
              ALTER TABLE payroll ADD CONSTRAINT uq_payroll_user_month_year UNIQUE (user_id, month, year);
            END IF;
          END $$;
        `);

        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'monthly_closing_log'::regclass AND conname = 'uq_monthly_closing_log_month_year'
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'monthly_closing_log'::regclass AND conname = 'monthly_closing_log_month_year_key'
            ) THEN
              ALTER TABLE monthly_closing_log ADD CONSTRAINT uq_monthly_closing_log_month_year UNIQUE (month, year);
            END IF;
          END $$;
        `);

        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'expense_audits'::regclass AND conname = 'uq_expense_audits_category_month_year'
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'expense_audits'::regclass AND conname = 'expense_audits_category_month_year_key'
            ) THEN
              ALTER TABLE expense_audits ADD CONSTRAINT uq_expense_audits_category_month_year UNIQUE (category, month, year);
            END IF;
          END $$;
        `);

        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'employee_leave_balance'::regclass AND conname = 'uq_employee_leave_balance_user_month_year'
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conrelid = 'employee_leave_balance'::regclass AND conname = 'employee_leave_balance_user_id_month_year_key'
            ) THEN
              ALTER TABLE employee_leave_balance ADD CONSTRAINT uq_employee_leave_balance_user_month_year UNIQUE (user_id, month, year);
            END IF;
          END $$;
        `);

        // 26. Align payroll payment_date with month/year if off-month
        await pool.query(`
          UPDATE payroll 
          SET payment_date = (MAKE_DATE(year, month, 1) + INTERVAL '1 month - 1 day')::date 
          WHERE EXTRACT(MONTH FROM payment_date) != month OR EXTRACT(YEAR FROM payment_date) != year;
        `);

        // 27. Ensure attendance_dropdown_masters exists and is seeded
        await pool.query(`
          CREATE TABLE IF NOT EXISTS attendance_dropdown_masters (
            id SERIAL PRIMARY KEY,
            category VARCHAR(50) NOT NULL,
            key VARCHAR(50) NOT NULL UNIQUE,
            label VARCHAR(100) NOT NULL,
            description TEXT,
            color VARCHAR(20) DEFAULT 'slate',
            is_active BOOLEAN DEFAULT TRUE,
            display_order INT DEFAULT 0,
            meta_json JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_adm_category ON attendance_dropdown_masters(category);
          CREATE INDEX IF NOT EXISTS idx_adm_active ON attendance_dropdown_masters(is_active);

          INSERT INTO attendance_dropdown_masters (category, key, label, description, color, is_active, display_order, meta_json)
          VALUES 
            ('request_category', 'leave', 'Full Day Leave', 'Apply for single or multi-day full day leaves', 'violet', true, 1, '{"requires_end_date": true, "show_subtypes": true}'),
            ('request_category', 'half_day', 'Half Day Request', 'Apply for a morning or afternoon half day request', 'amber', true, 2, '{"requires_end_date": false, "show_subtypes": false}'),
            ('request_category', 'advance', 'Salary Advance', 'Request an advance payment against salary', 'emerald', true, 3, '{"requires_amount": true, "requires_end_date": false, "show_subtypes": false}'),
            ('request_category', 'resignation', 'Resignation Notice', 'Submit formal notice for resignation', 'red', true, 4, '{"requires_end_date": false, "show_subtypes": false}'),
            ('leave_subtype', 'casual', 'Casual Leave', 'Short term planned personal leave', 'blue', true, 1, '{}'),
            ('leave_subtype', 'sick', 'Sick Leave', 'Leave taken due to illness or health issue', 'rose', true, 2, '{}'),
            ('leave_subtype', 'emergency', 'Emergency Leave', 'Urgent unplanned leave', 'orange', true, 3, '{}'),
            ('leave_subtype', 'unpaid', 'Unpaid Leave', 'Leave without pay allocation', 'slate', true, 4, '{}'),
            ('work_location', 'office', 'Main Office', 'Working on site at head office', 'emerald', true, 1, '{}'),
            ('work_location', 'client_site', 'Client Site', 'Working at client site or project location', 'sky', true, 2, '{}'),
            ('work_location', 'wfh', 'Work From Home', 'Remote working from home', 'indigo', true, 3, '{}')
          ON CONFLICT (key) DO NOTHING;
        `);

        // 28. Non-destructive Compound Performance Indexes
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
          CREATE INDEX IF NOT EXISTS idx_attendance_date_status ON attendance(date, status);
          CREATE INDEX IF NOT EXISTS idx_project_assignments_user_proj ON project_assignments(user_id, project_id);
          CREATE INDEX IF NOT EXISTS idx_project_stages_proj_status ON project_stages(project_id, status);
          CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status, start_date);
          CREATE INDEX IF NOT EXISTS idx_client_contacts_primary ON client_contacts(client_id, is_primary);
          CREATE INDEX IF NOT EXISTS idx_documents_proj_cat ON documents(project_id, category);
          CREATE INDEX IF NOT EXISTS idx_tasks_proj_stage ON tasks(project_id, stage);
        `);

        // 29. Ensure notifications table and performance indexes exist
        await pool.query(`
          CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            section VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            entity_type VARCHAR(50),
            entity_id INTEGER,
            action_url VARCHAR(255),
            is_read BOOLEAN DEFAULT FALSE,
            read_at TIMESTAMPTZ,
            tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
          CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_notifications_section ON notifications(section);
        `);

        console.log('✅ DB Schema migrations completed');
      } catch (mErr) {
        if (!mErr.message || !mErr.message.includes('after calling end')) {
          console.error('❌ Migration failed:', mErr.message);
        }
      } finally {
        if (lockClient) {
          try { await lockClient.query('SELECT pg_advisory_unlock(987654322)'); } catch (_) {}
          lockClient.release();
        }
      }
    };

    const isPrimaryInstance = process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0';
    if (process.env.SKIP_STARTUP_MIGRATIONS === 'true') {
      console.log('ℹ️ SKIP_STARTUP_MIGRATIONS set: skipping startup schema migrations');
    } else if (isPrimaryInstance) {
      runMigrations();
    } else {
      console.log('ℹ️ Secondary cluster instance: skipping startup schema migrations');
    }
  }
});
}

module.exports = pool;












