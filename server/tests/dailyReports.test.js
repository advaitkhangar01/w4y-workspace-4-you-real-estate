const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');

describe('Daily Work Reports API', () => {
  let adminUser, employeeUser, anotherEmployee;
  let reportId;

  beforeAll(async () => {
    // Explicitly create tables to ensure they exist before tests start (handling async migration lag)
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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL DEFAULT 1;
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

    // Clear reports and users for clean tests
    await pool.query('DELETE FROM daily_reports');
    await pool.query('DELETE FROM users WHERE username IN ($1, $2, $3)', ['test_dr_admin', 'test_dr_emp1', 'test_dr_emp2']);

    // Create test users
    const adminRes = await pool.query(
      `INSERT INTO users (name, role, username, password_hash) 
       VALUES ('DR Admin', 'admin', 'test_dr_admin', 'hashed') RETURNING id`
    );
    adminUser = {
      id: adminRes.rows[0].id,
      token: signToken(adminRes.rows[0].id)
    };

    const empRes = await pool.query(
      `INSERT INTO users (name, role, username, password_hash) 
       VALUES ('DR Employee 1', 'employee', 'test_dr_emp1', 'hashed') RETURNING id`
    );
    employeeUser = {
      id: empRes.rows[0].id,
      token: signToken(empRes.rows[0].id)
    };

    const emp2Res = await pool.query(
      `INSERT INTO users (name, role, username, password_hash) 
       VALUES ('DR Employee 2', 'employee', 'test_dr_emp2', 'hashed') RETURNING id`
    );
    anotherEmployee = {
      id: emp2Res.rows[0].id,
      token: signToken(emp2Res.rows[0].id)
    };
  });

  afterAll(async () => {
    // Clean up
    await pool.query('DELETE FROM daily_reports');
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [adminUser.id, employeeUser.id, anotherEmployee.id]);
  });

  describe('POST /api/daily-reports', () => {
    it('should block unauthenticated submissions', async () => {
      const res = await request(app)
        .post('/api/daily-reports')
        .send({ work_done: 'Coding today' });
      expect(res.statusCode).toBe(401);
    });

    it('should block submission with empty work_done', async () => {
      const res = await request(app)
        .post('/api/daily-reports')
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({ work_done: '', hours_worked: 8.0 });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Work done today is required');
    });

    it('should submit report successfully for today', async () => {
      const res = await request(app)
        .post('/api/daily-reports')
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({
          work_done: 'Implemented dashboard feature',
          hours_worked: 7.5,
          next_day_plan: 'Write unit tests',
          blockers: 'None'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.work_done).toBe('Implemented dashboard feature');
      expect(parseFloat(res.body.hours_worked)).toBe(7.5);
      reportId = res.body.id;
    });

    it('should prevent duplicate submission for the same date', async () => {
      const res = await request(app)
        .post('/api/daily-reports')
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({
          work_done: 'Tried submitting again',
          hours_worked: 8.0
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('You have already submitted a daily report for this date');
    });
  });

  describe('GET /api/daily-reports/today', () => {
    it('should return today\'s report for the employee', async () => {
      const res = await request(app)
        .get('/api/daily-reports/today')
        .set('Authorization', `Bearer ${employeeUser.token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toBeNull();
      expect(res.body.id).toBe(reportId);
    });

    it('should return null for employee who has not submitted today', async () => {
      const res = await request(app)
        .get('/api/daily-reports/today')
        .set('Authorization', `Bearer ${anotherEmployee.token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('GET /api/daily-reports', () => {
    it('should restrict employees to see only their own reports', async () => {
      // Submit a report for employee 2
      await request(app)
        .post('/api/daily-reports')
        .set('Authorization', `Bearer ${anotherEmployee.token}`)
        .send({ work_done: 'Other work', hours_worked: 8 });

      // Employee 1 lists reports
      const res = await request(app)
        .get('/api/daily-reports')
        .set('Authorization', `Bearer ${employeeUser.token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.reports.length).toBe(1);
      expect(res.body.reports[0].user_id).toBe(employeeUser.id);
    });

    it('should allow admin to see all reports', async () => {
      const res = await request(app)
        .get('/api/daily-reports')
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.reports.length).toBe(2);
    });

    it('should allow admin to filter by date', async () => {
      const today = getISTDate();
      const res = await request(app)
        .get(`/api/daily-reports?date=${today}`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.reports.length).toBe(2);
    });
  });

  describe('PUT /api/daily-reports/:id', () => {
    it('should allow owner to update their report', async () => {
      const res = await request(app)
        .put(`/api/daily-reports/${reportId}`)
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({
          work_done: 'Updated work done description',
          hours_worked: 6.0,
          blockers: 'New blocker'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.work_done).toBe('Updated work done description');
      expect(parseFloat(res.body.hours_worked)).toBe(6.0);
      expect(res.body.blockers).toBe('New blocker');
    });

    it('should prevent other employees from updating the report', async () => {
      const res = await request(app)
        .put(`/api/daily-reports/${reportId}`)
        .set('Authorization', `Bearer ${anotherEmployee.token}`)
        .send({
          work_done: 'Hack it',
          hours_worked: 8
        });
      expect(res.statusCode).toBe(403);
    });

    it('should allow admin to update the report', async () => {
      const res = await request(app)
        .put(`/api/daily-reports/${reportId}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          work_done: 'Admin override update',
          hours_worked: 8.0,
          blockers: ''
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.work_done).toBe('Admin override update');
    });
  });
});
