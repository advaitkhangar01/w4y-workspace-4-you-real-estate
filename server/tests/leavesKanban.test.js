const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');

describe('Leaves & All Requests Kanban Subsystem Tests', () => {
  let adminUser = {};
  let employeeUser = {};
  const today = getISTDate();
  const testIds = [];

  beforeAll(async () => {
    // 0. Pre-cleanup in case of prior abrupt termination
    await pool.query("DELETE FROM attendance WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_kadmin', 'test_kemp'))");
    await pool.query("DELETE FROM leave_requests WHERE reason LIKE 'TEST_JEST:%'");
    await pool.query("DELETE FROM users WHERE username IN ('test_kadmin', 'test_kemp')");

    // 1. Create test admin and employee users
    const adminRes = await pool.query(
      `INSERT INTO users (name, role, department, username, password_hash) 
       VALUES ('Kanban Admin', 'admin', 'Management', 'test_kadmin', 'hash') RETURNING id`
    );
    adminUser = {
      id: adminRes.rows[0].id,
      token: signToken(adminRes.rows[0].id)
    };

    const employeeRes = await pool.query(
      `INSERT INTO users (name, role, department, username, password_hash) 
       VALUES ('Kanban Employee', 'employee', 'Design', 'test_kemp', 'hash') RETURNING id`
    );
    employeeUser = {
      id: employeeRes.rows[0].id,
      token: signToken(employeeRes.rows[0].id)
    };

    // 2. Insert test leave requests
    // A: Pending casual leave
    const r1 = await pool.query(`
      INSERT INTO leave_requests (user_id, start_date, end_date, type, reason, status)
      VALUES ($1, $2::date + 2, $2::date + 4, 'casual', 'TEST_JEST: Pending casual', 'pending')
      RETURNING id
    `, [employeeUser.id, today]);
    testIds.push(r1.rows[0].id);

    // B: Pending advance request
    const r2 = await pool.query(`
      INSERT INTO leave_requests (user_id, start_date, end_date, type, amount, reason, status)
      VALUES ($1, $2::date + 5, $2::date + 5, 'advance', 12000, 'TEST_JEST: Pending advance', 'pending')
      RETURNING id
    `, [employeeUser.id, today]);
    testIds.push(r2.rows[0].id);

    // C: Approved active today leave
    const r3 = await pool.query(`
      INSERT INTO leave_requests (user_id, start_date, end_date, type, reason, status)
      VALUES ($1, $2::date, $2::date, 'half_day', 'TEST_JEST: Active today half day', 'approved')
      RETURNING id
    `, [employeeUser.id, today]);
    testIds.push(r3.rows[0].id);

    // D: Approved future leave
    const r4 = await pool.query(`
      INSERT INTO leave_requests (user_id, start_date, end_date, type, reason, status)
      VALUES ($1, $2::date + 10, $2::date + 12, 'sick', 'TEST_JEST: Future approved', 'approved')
      RETURNING id
    `, [employeeUser.id, today]);
    testIds.push(r4.rows[0].id);

    // E: Rejected future leave
    const r5 = await pool.query(`
      INSERT INTO leave_requests (user_id, start_date, end_date, type, reason, status)
      VALUES ($1, $2::date + 15, $2::date + 16, 'casual', 'TEST_JEST: Future rejected', 'rejected')
      RETURNING id
    `, [employeeUser.id, today]);
    testIds.push(r5.rows[0].id);
  });

  afterAll(async () => {
    if (testIds.length > 0) {
      await pool.query('DELETE FROM leave_requests WHERE id = ANY($1)', [testIds]);
    }
    await pool.query("DELETE FROM leave_requests WHERE reason LIKE 'TEST_JEST:%'");
    if (employeeUser.id) await pool.query('DELETE FROM attendance WHERE user_id = $1', [employeeUser.id]);
    if (adminUser.id) await pool.query('DELETE FROM attendance WHERE user_id = $1', [adminUser.id]);
    if (adminUser.id) await pool.query('DELETE FROM users WHERE id = $1', [adminUser.id]);
    if (employeeUser.id) await pool.query('DELETE FROM users WHERE id = $1', [employeeUser.id]);
  });

  test('GET /api/leaves - returns standard leaves array', async () => {
    const res = await request(app)
      .get('/api/leaves')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaves)).toBe(true);
    const testItems = res.body.leaves.filter(l => l.reason?.startsWith('TEST_JEST:'));
    expect(testItems.length).toBeGreaterThanOrEqual(4);
    // Ensure start_date is a formatted YYYY-MM-DD string
    expect(typeof testItems[0].start_date).toBe('string');
    expect(testItems[0].start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('GET /api/leaves?view=kanban - returns properly grouped kanban columns and counts', async () => {
    const res = await request(app)
      .get('/api/leaves?view=kanban')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('kanban');
    expect(res.body).toHaveProperty('counts');

    const { kanban, counts } = res.body;
    expect(Array.isArray(kanban.pending)).toBe(true);
    expect(Array.isArray(kanban.active_today)).toBe(true);
    expect(Array.isArray(kanban.upcoming)).toBe(true);
    expect(Array.isArray(kanban.resolved)).toBe(true);

    // Verify pending items
    const hasPendingCasual = kanban.pending.some(i => i.reason === 'TEST_JEST: Pending casual');
    const hasPendingAdvance = kanban.pending.some(i => i.reason === 'TEST_JEST: Pending advance');
    expect(hasPendingCasual).toBe(true);
    expect(hasPendingAdvance).toBe(true);

    // Verify active today
    const hasActiveToday = kanban.active_today.some(i => i.reason === 'TEST_JEST: Active today half day');
    expect(hasActiveToday).toBe(true);

    // Verify upcoming approved
    const hasUpcomingApproved = kanban.upcoming.some(i => i.reason === 'TEST_JEST: Future approved');
    expect(hasUpcomingApproved).toBe(true);

    // Verify rejected item in resolved
    const hasResolvedRejected = kanban.resolved.some(i => i.reason === 'TEST_JEST: Future rejected');
    expect(hasResolvedRejected).toBe(true);

    // Check counts
    expect(counts.all).toBeGreaterThanOrEqual(5);
    expect(counts.advance).toBeGreaterThanOrEqual(1);
    expect(counts.half_day).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/dashboard/admin - strictly excludes rejected and past pending leaves from upcoming', async () => {
    const res = await request(app)
      .get('/api/dashboard/admin')
      .set('Authorization', `Bearer ${adminUser.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.active_team_leaves)).toBe(true);
    expect(Array.isArray(res.body.upcoming_team_leaves)).toBe(true);

    // Active leaves today should contain our active half day
    const activeMatch = res.body.active_team_leaves.find(l => l.reason === 'TEST_JEST: Active today half day');
    expect(activeMatch).toBeDefined();

    // Upcoming should include the future approved
    const upcomingApproved = res.body.upcoming_team_leaves.find(l => l.reason === 'TEST_JEST: Future approved');
    expect(upcomingApproved).toBeDefined();

    // Upcoming MUST NOT include the future rejected
    const upcomingRejected = res.body.upcoming_team_leaves.find(l => l.reason === 'TEST_JEST: Future rejected');
    expect(upcomingRejected).toBeUndefined();

    // Upcoming MUST NOT include advance requests
    const upcomingAdvance = res.body.upcoming_team_leaves.find(l => l.reason === 'TEST_JEST: Pending advance');
    expect(upcomingAdvance).toBeUndefined();
  });

  test('PATCH /api/leaves/:id - allows Admin to approve/reject and blocks non-admin', async () => {
    const pendingItem = testIds[0]; // Pending casual

    // 1. Employee attempting to approve -> 403
    const empAttempt = await request(app)
      .patch(`/api/leaves/${pendingItem}`)
      .set('Authorization', `Bearer ${employeeUser.token}`)
      .send({ status: 'approved' });
    expect(empAttempt.status).toBe(403);

    // 2. Admin approving -> 200
    const adminApprove = await request(app)
      .patch(`/api/leaves/${pendingItem}`)
      .set('Authorization', `Bearer ${adminUser.token}`)
      .send({ status: 'approved', remarks: 'Approved by test' });
    expect(adminApprove.status).toBe(200);
    expect(adminApprove.body.leave.status).toBe('approved');
  });
});
