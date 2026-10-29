const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');

describe('Monthly Close & Period Lock Subsystem Integration Tests', () => {
  let adminUser = {};
  let employeeUser = {};
  let dummyProject = null;
  let testExpense = null;
  let testPayroll = null;

  // We choose a past month/year for testing, e.g. January 2025 (always in the past)
  const testMonth = 1;
  const testYear = 2025;
  const testDate = '2025-01-15';

  beforeAll(async () => {
    // Pre-cleanup in case a previous run failed
    await pool.query("DELETE FROM payroll WHERE user_id IN (SELECT id FROM users WHERE username IN ('mc_admin', 'mc_employee'))");
    await pool.query("DELETE FROM attendance WHERE user_id IN (SELECT id FROM users WHERE username IN ('mc_admin', 'mc_employee'))");
    await pool.query("DELETE FROM users WHERE username IN ('mc_admin', 'mc_employee')");
    await pool.query("DELETE FROM clients WHERE name = 'MC Visibility Client'");
    await pool.query("DELETE FROM payroll WHERE month = $1 AND year = $2", [testMonth, testYear]);

    // 1. Create a dummy client
    const { rows: clientRows } = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('MC Visibility Client', 'mc_test@visibility.com') RETURNING id`
    );
    const clientId = clientRows[0].id;

    // 2. Create test users
    const adminRes = await pool.query(
      `INSERT INTO users (name, role, username, password_hash) 
       VALUES ('MC Admin', 'admin', 'mc_admin', 'hash') RETURNING id`
    );
    adminUser = {
      id: adminRes.rows[0].id,
      token: signToken(adminRes.rows[0].id)
    };

    const employeeRes = await pool.query(
      `INSERT INTO users (name, role, username, password_hash) 
       VALUES ('MC Employee', 'employee', 'mc_employee', 'hash') RETURNING id`
    );
    employeeUser = {
      id: employeeRes.rows[0].id,
      token: signToken(employeeRes.rows[0].id)
    };

    // 3. Create a dummy project and assign the employee to it
    const { rows: projRows } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name) 
       VALUES ('MC Test Project', $1, 'Residential', 'Design Proposal', $2, 'MC Visibility Client') RETURNING id`,
      [clientId, adminUser.id]
    );
    dummyProject = projRows[0];

    await pool.query(
      `INSERT INTO project_assignments (project_id, user_id) VALUES ($1, $2)`,
      [dummyProject.id, employeeUser.id]
    );

    // Clean up any pre-existing logs for Jan 2025 to ensure state isolation
    await pool.query('DELETE FROM period_unlock_log WHERE month = $1 AND year = $2', [testMonth, testYear]);
    await pool.query('DELETE FROM monthly_closing_log WHERE month = $1 AND year = $2', [testMonth, testYear]);
    await pool.query('DELETE FROM transactions WHERE description LIKE \'TEST_%\'');
    await pool.query('DELETE FROM payroll WHERE month = $1 AND year = $2', [testMonth, testYear]);
  });

  afterAll(async () => {
    // Clean up test records
    await pool.query('DELETE FROM period_unlock_log WHERE month = $1 AND year = $2', [testMonth, testYear]);
    await pool.query('DELETE FROM monthly_closing_log WHERE month = $1 AND year = $2', [testMonth, testYear]);
    await pool.query('DELETE FROM transactions WHERE description LIKE \'TEST_%\'');
    await pool.query('DELETE FROM payroll WHERE month = $1 AND year = $2', [testMonth, testYear]);
    if (adminUser?.id || employeeUser?.id) {
      await pool.query('DELETE FROM payroll WHERE user_id IN ($1, $2)', [adminUser?.id || 0, employeeUser?.id || 0]);
      await pool.query('DELETE FROM attendance WHERE user_id IN ($1, $2)', [adminUser?.id || 0, employeeUser?.id || 0]);
    }
    if (dummyProject?.id) {
      await pool.query('DELETE FROM project_assignments WHERE project_id = $1', [dummyProject.id]);
      await pool.query('DELETE FROM projects WHERE id = $1', [dummyProject.id]);
    }
    if (adminUser?.id || employeeUser?.id) {
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUser?.id || 0, employeeUser?.id || 0]);
    }
    await pool.query('DELETE FROM clients WHERE name = \'MC Visibility Client\'');
  });

  describe('1. Current and Future Month Close Protection', () => {
    it('should block previewing current or future month close', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const res = await request(app)
        .get(`/api/monthly-close/preview?month=${currentMonth}&year=${currentYear}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Cannot preview or close the current or future periods');
    });

    it('should block executing current or future month close', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const res = await request(app)
        .post('/api/monthly-close/execute')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ month: currentMonth, year: currentYear });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Cannot preview or close the current or future periods');
    });
  });

  describe('2. Role-Based Access Control', () => {
    it('should block non-admins from executing a month close', async () => {
      const res = await request(app)
        .post('/api/monthly-close/execute')
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({ month: testMonth, year: testYear });

      expect(res.statusCode).toBe(403);
    });

    it('should block non-admins from viewing close history', async () => {
      const res = await request(app)
        .get('/api/monthly-close/history')
        .set('Authorization', `Bearer ${employeeUser.token}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('3. Lock & Unlock Mechanisms on Closed Periods', () => {
    it('should allow admin to close a past period', async () => {
      const res = await request(app)
        .post('/api/monthly-close/execute')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ month: testMonth, year: testYear, reason: 'Testing close' });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('should prevent inserting a new transaction in a closed period (both Admin & Employee)', async () => {
      // 1. Employee
      const resEmp = await request(app)
        .post('/api/finances/transactions')
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({
          type: 'expense',
          category: 'Office',
          amount: 500,
          date: testDate,
          project_id: dummyProject.id,
          description: 'TEST_Expense Employee'
        });
      expect(resEmp.statusCode).toBe(403);
      expect(resEmp.body.code).toBe('PERIOD_LOCKED');

      // 2. Admin (should be blocked because it is locked and not unlocked)
      const resAdmin = await request(app)
        .post('/api/finances/transactions')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          type: 'expense',
          category: 'Office',
          amount: 1000,
          date: testDate,
          project_id: dummyProject.id,
          description: 'TEST_Expense Admin'
        });
      expect(resAdmin.statusCode).toBe(403);
      expect(resAdmin.body.code).toBe('PERIOD_LOCKED');
    });

    it('should allow admin to unlock a closed period', async () => {
      const res = await request(app)
        .post('/api/monthly-close/unlock')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ month: testMonth, year: testYear, reason: 'Need backdated correction' });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('should now allow admin to insert transaction while period is unlocked', async () => {
      const res = await request(app)
        .post('/api/finances/transactions')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          type: 'expense',
          category: 'Office',
          amount: 1000,
          date: testDate,
          project_id: dummyProject.id,
          description: 'TEST_Expense Admin Backdated'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.transaction).toHaveProperty('id');
      testExpense = res.body.transaction;
    });

    it('should prevent employee from inserting transaction even if period is unlocked', async () => {
      const res = await request(app)
        .post('/api/finances/transactions')
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({
          type: 'expense',
          category: 'Office',
          amount: 500,
          date: testDate,
          project_id: dummyProject.id,
          description: 'TEST_Expense Employee Backdated'
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERIOD_LOCKED');
    });

    it('should allow admin to delete the backdated transaction while period is unlocked', async () => {
      const res = await request(app)
        .delete(`/api/finances/transactions/${testExpense.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(res.statusCode).toBe(200);
    });

    it('should lock the period again when admin relocks it', async () => {
      const res = await request(app)
        .post('/api/monthly-close/relock')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ month: testMonth, year: testYear });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Period re-locked successfully');
    });
  });

  describe('4. Backdated Payroll Deletion & Lock', () => {
    beforeAll(async () => {
      // Clear out the payroll entry automatically created during month-close in step 3
      await pool.query(
        'DELETE FROM payroll WHERE user_id = $1 AND month = $2 AND year = $3',
        [employeeUser.id, testMonth, testYear]
      );
      // Create a dummy processed payroll entry directly in DB for January 2025
      const { rows } = await pool.query(
        `INSERT INTO payroll (user_id, base_salary, net_paid, month, year, payment_date, status)
         VALUES ($1, 50000, 50000, $2, $3, $4, 'paid') RETURNING id`,
        [employeeUser.id, testMonth, testYear, testDate]
      );
      testPayroll = rows[0];
    });

    it('should block deleting/reversing payroll while period is locked', async () => {
      const res = await request(app)
        .delete(`/api/accounting/payroll/${testPayroll.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERIOD_LOCKED');
    });

    it('should allow deleting/reversing payroll once period is unlocked', async () => {
      // 1. Unlock
      await pool.query(
        `INSERT INTO period_unlock_log (month, year, unlocked_by, reason, is_active)
         VALUES ($1, $2, $3, 'Test unlock for payroll', true)`,
        [testMonth, testYear, adminUser.id]
      );

      // 2. Delete
      const res = await request(app)
        .delete(`/api/accounting/payroll/${testPayroll.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });
  });

  describe('5. On-the-fly Payroll Recalculation & Edit on Reversal / Active Period', () => {
    let activePayroll;

    beforeAll(async () => {
      // 1. Relock/cleanup the period logs if any
      await pool.query('DELETE FROM period_unlock_log WHERE month = $1 AND year = $2', [testMonth, testYear]);
      await pool.query('DELETE FROM monthly_closing_log WHERE month = $1 AND year = $2', [testMonth, testYear]);
      await pool.query('DELETE FROM payroll WHERE user_id = $1 AND month = $2 AND year = $3', [employeeUser.id, testMonth, testYear]);

      // Ensure employee record has non-negative salary values to satisfy constraints
      await pool.query(
        "UPDATE users SET base_salary = 20000, hourly_rate = 0 WHERE id = $1",
        [employeeUser.id]
      );

      // 2. Create a fresh payroll entry for January 2025
      const { rows } = await pool.query(
        `INSERT INTO payroll (user_id, base_salary, incentives, deductions, net_paid, month, year, payment_date, status)
         VALUES ($1, 20000, 1000, 500, 20500, $2, $3, $4, 'paid') RETURNING id`,
        [employeeUser.id, testMonth, testYear, testDate]
      );
      activePayroll = rows[0];
    });

    it('should block editing salary / incentives if period is closed/locked', async () => {
      // Close/lock the period first
      await pool.query(
        `INSERT INTO monthly_closing_log (month, year, closed_by) VALUES ($1, $2, $3)`,
        [testMonth, testYear, adminUser.id]
      );

      const res = await request(app)
        .put(`/api/accounting/payroll/employees/${employeeUser.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          base_salary: 30000,
          incentives: 2000,
          month: testMonth,
          year: testYear
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERIOD_LOCKED');
    });

    it('should allow editing and recalculate payroll if period is unlocked/reversed', async () => {
      // Unlock/open period by deleting close log (reversed month close)
      await pool.query('DELETE FROM monthly_closing_log WHERE month = $1 AND year = $2', [testMonth, testYear]);

      const res = await request(app)
        .put(`/api/accounting/payroll/employees/${employeeUser.id}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          base_salary: 30000,
          incentives: 2000,
          month: testMonth,
          year: testYear
        });

      expect(res.statusCode).toBe(200);

      // Verify that user record in DB is updated
      const { rows: userRows } = await pool.query('SELECT base_salary FROM users WHERE id = $1', [employeeUser.id]);
      expect(parseFloat(userRows[0].base_salary)).toBe(30000);

      // Verify that the payroll record is synced and recalculated
      const { rows: payrollRows } = await pool.query(
        'SELECT base_salary, incentives, net_paid FROM payroll WHERE user_id = $1 AND month = $2 AND year = $3',
        [employeeUser.id, testMonth, testYear]
      );
      expect(payrollRows.length).toBe(1);
      expect(parseFloat(payrollRows[0].base_salary)).toBe(30000);
      expect(parseFloat(payrollRows[0].incentives)).toBe(2000);
      expect(parseFloat(payrollRows[0].net_paid)).toBeGreaterThan(0);
    });
  });
});
