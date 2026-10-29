// server/tests/tasks.test.js
const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const { cleanupOldTasks } = require('../routes/tasks');

describe('Tasks Subsystem Integration Tests', () => {
  let adminUser = {};
  let employeeUser = {};
  let otherEmployee = {};
  let testClientId = null;
  let testProjectId = null;
  const createdTaskIds = [];

  beforeAll(async () => {
    // 0. Pre-cleanup
    await pool.query("DELETE FROM tasks WHERE title LIKE 'TEST_JEST_TASK%'");
    await pool.query("DELETE FROM projects WHERE name = 'TEST_JEST_TASK_PROJECT'");
    await pool.query("DELETE FROM clients WHERE name = 'TEST_JEST_TASK_CLIENT'");
    await pool.query("DELETE FROM users WHERE username IN ('test_task_admin', 'test_task_emp1', 'test_task_emp2')");

    // 1. Create users
    const adminRes = await pool.query(
      `INSERT INTO users (name, role, department, username, password_hash) 
       VALUES ('Task Admin', 'admin', 'Management', 'test_task_admin', 'hash') RETURNING id`
    );
    adminUser = {
      id: adminRes.rows[0].id,
      token: signToken(adminRes.rows[0].id)
    };

    const emp1Res = await pool.query(
      `INSERT INTO users (name, role, department, username, password_hash) 
       VALUES ('Task Emp One', 'employee', 'Design', 'test_task_emp1', 'hash') RETURNING id`
    );
    employeeUser = {
      id: emp1Res.rows[0].id,
      token: signToken(emp1Res.rows[0].id)
    };

    const emp2Res = await pool.query(
      `INSERT INTO users (name, role, department, username, password_hash) 
       VALUES ('Task Emp Two', 'employee', 'Liasoning', 'test_task_emp2', 'hash') RETURNING id`
    );
    otherEmployee = {
      id: emp2Res.rows[0].id,
      token: signToken(emp2Res.rows[0].id)
    };

    // 2. Create test client & project
    const clientRes = await pool.query(
      `INSERT INTO clients (name) VALUES ('TEST_JEST_TASK_CLIENT') RETURNING id`
    );
    testClientId = clientRes.rows[0].id;

    const projRes = await pool.query(
      `INSERT INTO projects (name, client_id, client_name, type, status) 
       VALUES ('TEST_JEST_TASK_PROJECT', $1, 'TEST_JEST_TASK_CLIENT', 'Architecture', 'active') RETURNING id`,
      [testClientId]
    );
    testProjectId = projRes.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query("DELETE FROM tasks WHERE title LIKE 'TEST_JEST_TASK%'");
    if (testProjectId) {
      await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    }
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    }
    await pool.query("DELETE FROM users WHERE username IN ('test_task_admin', 'test_task_emp1', 'test_task_emp2')");
    await pool.end();
  });

  describe('1. Task Creation & Authorization (POST /api/tasks)', () => {
    it('should reject task creation by an unprivileged employee', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({
          project_id: testProjectId,
          title: 'TEST_JEST_TASK Unauthorized'
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Only authorized roles can create tasks');
    });

    it('should allow admin to create a task with description and due date', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          project_id: testProjectId,
          title: 'TEST_JEST_TASK Admin Task',
          description: 'Detailed scope for test task',
          assigned_to: employeeUser.id,
          priority: 'high',
          due_date: '2026-12-31'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.title).toBe('TEST_JEST_TASK Admin Task');
      expect(res.body.task.description).toBe('Detailed scope for test task');
      expect(res.body.task.status).toBe('pending');
      expect(res.body.task.priority).toBe('high');
      createdTaskIds.push(res.body.task.id);
    });
  });

  describe('2. Task Updates & Role Enforcement (PATCH /api/tasks/:task_id)', () => {
    let testTaskId = null;

    beforeAll(async () => {
      const res = await pool.query(`
        INSERT INTO tasks (project_id, title, description, assigned_to, created_by, status, priority)
        VALUES ($1, 'TEST_JEST_TASK Lifecycle', 'Test description', $2, $3, 'pending', 'medium')
        RETURNING id
      `, [testProjectId, employeeUser.id, adminUser.id]);
      testTaskId = res.rows[0].id;
      createdTaskIds.push(testTaskId);

      await pool.query(`
        INSERT INTO task_participants (task_id, user_id, added_by)
        VALUES ($1, $2, $3), ($1, $4, $3)
        ON CONFLICT DO NOTHING
      `, [testTaskId, employeeUser.id, adminUser.id, adminUser.id]);
    });

    it('should allow assignee to move task from pending to in_progress and review', async () => {
      const res1 = await request(app)
        .patch(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({ status: 'in_progress' });

      expect(res1.statusCode).toBe(200);
      expect(res1.body.task.status).toBe('in_progress');

      const res2 = await request(app)
        .patch(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({ status: 'review' });

      expect(res2.statusCode).toBe(200);
      expect(res2.body.task.status).toBe('review');
    });

    it('should block non-admin from passing a task', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({ status: 'passed' });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Only admins can pass tasks');
    });

    it('should block non-creator/non-admin from editing due date or reassigning', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${otherEmployee.token}`)
        .send({ due_date: '2026-11-15' });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Only task creator or Admin can modify task details');
    });

    it('should allow admin to pass task and record completed_at', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'passed' });

      expect(res.statusCode).toBe(200);
      expect(res.body.task.status).toBe('passed');
      expect(res.body.task.completed_at).not.toBeNull();
    });
  });

  describe('3. Threaded Messaging & Mention Notifications', () => {
    let testTaskId = null;

    beforeAll(async () => {
      const res = await pool.query(`
        INSERT INTO tasks (project_id, title, assigned_to, created_by, status)
        VALUES ($1, 'TEST_JEST_TASK Chat', $2, $3, 'in_progress')
        RETURNING id
      `, [testProjectId, employeeUser.id, adminUser.id]);
      testTaskId = res.rows[0].id;
      createdTaskIds.push(testTaskId);
    });

    it('should post message and enroll mentioned user into participants', async () => {
      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/messages`)
        .set('Authorization', `Bearer ${employeeUser.token}`)
        .send({ message: 'Hello @test_task_emp2 please check this spec.' });

      expect(res.statusCode).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.message).toContain('@test_task_emp2');

      // Check participants table for otherEmployee
      const partRes = await pool.query(
        'SELECT 1 FROM task_participants WHERE task_id = $1 AND user_id = $2',
        [testTaskId, otherEmployee.id]
      );
      expect(partRes.rows.length).toBe(1);
    });
  });

  describe('4. Auto-Cleanup Safety Rule', () => {
    it('should not delete passed tasks completed recently (within 90 days)', async () => {
      // Insert a passed task completed 5 days ago
      const recentTask = await pool.query(`
        INSERT INTO tasks (project_id, title, status, created_at, completed_at)
        VALUES ($1, 'TEST_JEST_TASK Recent Passed', 'passed', NOW() - INTERVAL '100 days', NOW() - INTERVAL '5 days')
        RETURNING id
      `, [testProjectId]);
      createdTaskIds.push(recentTask.rows[0].id);

      await cleanupOldTasks();

      // Ensure the task was NOT deleted because completed_at is only 5 days ago
      const checkRes = await pool.query('SELECT id FROM tasks WHERE id = $1', [recentTask.rows[0].id]);
      expect(checkRes.rows.length).toBe(1);
    });
  });

  describe('5. Admin PDF Export Endpoint (GET /api/tasks/export/report)', () => {
    it('should block regular employee from accessing export report', async () => {
      const res = await request(app)
        .get('/api/tasks/export/report')
        .set('Authorization', `Bearer ${employeeUser.token}`);

      expect(res.statusCode).toBe(403);
    });

    it('should allow admin to fetch filtered task report for export', async () => {
      const res = await request(app)
        .get('/api/tasks/export/report')
        .query({
          status: 'all',
          from_date: '2020-01-01',
          to_date: '2030-12-31'
        })
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.tasks)).toBe(true);
      expect(res.body.tasks.length).toBeGreaterThan(0);
    });
  });
});
