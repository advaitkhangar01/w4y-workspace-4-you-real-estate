// server/tests/userDeletion.test.js
const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

describe('User Deletion Workflow & Historical Data Preservation Tests', () => {
  let adminUser, targetUser, nonAdminUser;
  let testProjectId, openTaskId, completedTaskId;

  beforeAll(async () => {
    // Clean up any previous test records
    await pool.query("DELETE FROM users WHERE username IN ('test_del_admin', 'test_del_target', 'test_del_employee')");

    const passwordHash = await bcrypt.hash('password123', 10);

    // 1. Create Admin
    const { rows: aRows } = await pool.query(
      `INSERT INTO users (name, username, role, password_hash, is_active)
       VALUES ('Test Del Admin', 'test_del_admin', 'admin', $1, true)
       RETURNING id, username, role`,
      [passwordHash]
    );
    adminUser = { ...aRows[0], token: signToken(aRows[0].id) };

    // 2. Create Target User (to be deleted)
    const { rows: tRows } = await pool.query(
      `INSERT INTO users (name, username, role, password_hash, is_active)
       VALUES ('Test Del Target', 'test_del_target', 'employee', $1, true)
       RETURNING id, username, role`,
      [passwordHash]
    );
    targetUser = { ...tRows[0], token: signToken(tRows[0].id) };

    // 3. Create Another Non-Admin User
    const { rows: naRows } = await pool.query(
      `INSERT INTO users (name, username, role, password_hash, is_active)
       VALUES ('Test Del Emp', 'test_del_employee', 'employee', $1, true)
       RETURNING id, username, role`,
      [passwordHash]
    );
    nonAdminUser = { ...naRows[0], token: signToken(naRows[0].id) };

    // 3.5 Create a test client
    const { rows: cRows } = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('Test Del Client', 'testdel@client.com') RETURNING id`
    );
    const testClientId = cRows[0].id;

    // 4. Create a test project and assign targetUser
    const { rows: pRows } = await pool.query(
      `INSERT INTO projects (name, client_name, client_id, type, status, created_by)
       VALUES ('Del Test Project', 'Test Del Client', $1, 'Commercial', 'In Progress', $2)
       RETURNING id`,
      [testClientId, adminUser.id]
    );
    testProjectId = pRows[0].id;

    await pool.query(
      `INSERT INTO project_assignments (project_id, user_id) VALUES ($1, $2)`,
      [testProjectId, targetUser.id]
    );

    // 5. Create an open task assigned to targetUser
    const { rows: openTaskRows } = await pool.query(
      `INSERT INTO tasks (project_id, title, status, assigned_to, created_by)
       VALUES ($1, 'Open Task For Target', 'pending', $2, $3)
       RETURNING id`,
      [testProjectId, targetUser.id, adminUser.id]
    );
    openTaskId = openTaskRows[0].id;

    await pool.query(
      `INSERT INTO task_participants (task_id, user_id, added_by) VALUES ($1, $2, $3)`,
      [openTaskId, targetUser.id, adminUser.id]
    );

    // 6. Create a completed historical task assigned to targetUser
    const { rows: compTaskRows } = await pool.query(
      `INSERT INTO tasks (project_id, title, status, assigned_to, created_by)
       VALUES ($1, 'Completed Task For Target', 'passed', $2, $3)
       RETURNING id`,
      [testProjectId, targetUser.id, adminUser.id]
    );
    completedTaskId = compTaskRows[0].id;

    // 7. Create historical attendance record for targetUser
    await pool.query(
      `INSERT INTO attendance (user_id, date, status, check_in, check_out, hours_worked)
       VALUES ($1, CURRENT_DATE - INTERVAL '1 day', 'present', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '8 hours', 8.0)`,
      [targetUser.id]
    );

    // 8. Create historical payroll record for targetUser
    await pool.query(
      `INSERT INTO payroll (user_id, month, year, base_salary, net_paid, status)
       VALUES ($1, 9, 2026, 30000, 30000, 'paid')`,
      [targetUser.id]
    );

    // 9. Create an approved leave request for targetUser
    await pool.query(
      `INSERT INTO leave_requests (user_id, type, start_date, end_date, reason, status)
       VALUES ($1, 'paid', CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', 'Test Leave Target', 'approved')`,
      [targetUser.id]
    );
  });

  afterAll(async () => {
    // Cleanup test data
    if (testProjectId) {
      await pool.query('DELETE FROM task_participants WHERE task_id IN ($1, $2)', [openTaskId, completedTaskId]);
      await pool.query('DELETE FROM tasks WHERE project_id = $1', [testProjectId]);
      await pool.query('DELETE FROM project_assignments WHERE project_id = $1', [testProjectId]);
      await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    }
    if (targetUser) {
      await pool.query('DELETE FROM leave_requests WHERE user_id = $1', [targetUser.id]);
      await pool.query('DELETE FROM payroll WHERE user_id = $1', [targetUser.id]);
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [targetUser.id]);
    }
    await pool.query("DELETE FROM users WHERE username IN ('test_del_admin', 'test_del_target', 'test_del_employee')");
    await pool.query("DELETE FROM clients WHERE email = 'testdel@client.com'");
  });

  it('1. Admin cannot delete their own account (400)', async () => {
    const res = await request(app)
      .delete(`/api/settings/users/${adminUser.id}`)
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('You cannot delete your own account');
  });

  it('2. Non-admin cannot delete any user (403)', async () => {
    const res = await request(app)
      .delete(`/api/settings/users/${targetUser.id}`)
      .set('Authorization', `Bearer ${nonAdminUser.token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  it('3. Admin can safely delete target user (200)', async () => {
    const res = await request(app)
      .delete(`/api/settings/users/${targetUser.id}`)
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User deleted successfully');
  });

  it('4. User is soft-deleted in DB with is_active = false and deactivated_at timestamp', async () => {
    const { rows } = await pool.query('SELECT is_active, deactivated_at FROM users WHERE id = $1', [targetUser.id]);
    expect(rows.length).toBe(1);
    expect(rows[0].is_active).toBe(false);
    expect(rows[0].deactivated_at).not.toBeNull();
  });

  it('5. User is removed from active project_assignments', async () => {
    const { rows } = await pool.query('SELECT * FROM project_assignments WHERE user_id = $1', [targetUser.id]);
    expect(rows.length).toBe(0);
  });

  it('6. Open tasks are unassigned (assigned_to = NULL) while completed historical tasks retain assigned_to', async () => {
    // Open task should be unassigned
    const { rows: openRows } = await pool.query('SELECT assigned_to FROM tasks WHERE id = $1', [openTaskId]);
    expect(openRows[0].assigned_to).toBeNull();

    // Completed task MUST retain targetUser.id for historical integrity
    const { rows: compRows } = await pool.query('SELECT assigned_to FROM tasks WHERE id = $1', [completedTaskId]);
    expect(compRows[0].assigned_to).toBe(targetUser.id);
  });

  it('7. Historical attendance and payroll records remain 100% intact', async () => {
    const { rows: attRows } = await pool.query('SELECT * FROM attendance WHERE user_id = $1', [targetUser.id]);
    expect(attRows.length).toBe(1);
    expect(attRows[0].status).toBe('present');

    const { rows: payRows } = await pool.query('SELECT * FROM payroll WHERE user_id = $1', [targetUser.id]);
    expect(payRows.length).toBe(1);
    expect(payRows[0].status).toBe('paid');
  });

  it('8. GET /api/settings/users does NOT return the deleted user', async () => {
    const res = await request(app)
      .get('/api/settings/users')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    const found = res.body.users.find(u => u.id === targetUser.id);
    expect(found).toBeUndefined();
  });

  it('9. GET /api/auth/users does NOT return the deleted user', async () => {
    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const found = res.body.users.find(u => u.id === targetUser.id);
    expect(found).toBeUndefined();
  });

  it('10. GET /api/staff does NOT return the deleted user', async () => {
    const res = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const found = res.body.staff.find(u => u.id === targetUser.id);
    expect(found).toBeUndefined();
  });

  it('11. Deleted user token is immediately rejected with 401', async () => {
    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${targetUser.token}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('User account has been deactivated');
  });

  it('12. Deleted user cannot log in (403)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test_del_target', password: 'password123' });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/deactivated/i);
  });

  it('13. GET /api/attendance/today (Dashboard team attendance) does NOT return the deleted user', async () => {
    const res = await request(app)
      .get('/api/attendance/today')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const found = (res.body.attendance || []).find(r => r.user_id === targetUser.id);
    expect(found).toBeUndefined();
  });

  it('14. GET /api/tasks?view=kanban (Dashboard task board) does NOT create a column for deleted user', async () => {
    const res = await request(app)
      .get('/api/tasks?view=kanban')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const found = (res.body.kanban || []).find(col => col.user_id === targetUser.id);
    expect(found).toBeUndefined();
  });

  it('15. GET /api/tasks?view=history (History view) DOES preserve the historical completed tasks of deleted user', async () => {
    const res = await request(app)
      .get('/api/tasks?view=history')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const userCol = (res.body.kanban || []).find(col => col.user_id === targetUser.id);
    expect(userCol).toBeDefined();
    const taskFound = (userCol.tasks || []).find(t => t.id === completedTaskId);
    expect(taskFound).toBeDefined();
  });

  it('16. GET /api/dashboard/admin excludes deleted user from active/upcoming leaves and today tasks', async () => {
    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const foundActive = (res.body.active_team_leaves || []).find(l => l.user_id === targetUser.id);
    expect(foundActive).toBeUndefined();
    const foundUpcoming = (res.body.upcoming_team_leaves || []).find(l => l.user_id === targetUser.id);
    expect(foundUpcoming).toBeUndefined();

    // Check today's tasks
    const allTodayTasks = (res.body.todays_tasks || []).flatMap(g => g.tasks || []);
    const foundTask = allTodayTasks.find(t => t.assigned_to === targetUser.id);
    expect(foundTask).toBeUndefined();
  });

  it('17. GET /api/leaves?view=kanban (Dashboard request kanban) excludes deleted user requests', async () => {
    const res = await request(app)
      .get('/api/leaves?view=kanban')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const kanban = res.body.kanban || {};
    const allRequests = [
      ...(kanban.pending || []),
      ...(kanban.active_today || []),
      ...(kanban.upcoming || [])
    ];
    const found = allRequests.find(r => r.user_id === targetUser.id);
    expect(found).toBeUndefined();
  });

  it('18. GET /api/settings/users?status=deactivated lists deactivated users', async () => {
    const res = await request(app)
      .get('/api/settings/users?status=deactivated')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const deactivatedUser = (res.body.users || []).find(u => u.id === targetUser.id);
    expect(deactivatedUser).toBeDefined();
    expect(deactivatedUser.is_active).toBe(false);
    expect(deactivatedUser.deactivated_at).toBeDefined();
  });

  it('19. PATCH /api/settings/users/:id/restore rejects non-admin users', async () => {
    const res = await request(app)
      .patch(`/api/settings/users/${targetUser.id}/restore`)
      .set('Authorization', `Bearer ${nonAdminUser.token}`);

    expect(res.statusCode).toBe(403);
  });

  it('20. PATCH /api/settings/users/:id/restore successfully restores the deactivated user', async () => {
    const res = await request(app)
      .patch(`/api/settings/users/${targetUser.id}/restore`)
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.is_active).toBe(true);
    expect(res.body.user.deactivated_at).toBeNull();
  });

  it('21. Restored user is now returned in default active user list', async () => {
    const res = await request(app)
      .get('/api/settings/users')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.statusCode).toBe(200);
    const restoredUser = (res.body.users || []).find(u => u.id === targetUser.id);
    expect(restoredUser).toBeDefined();
    expect(restoredUser.is_active).toBe(true);
  });
});
