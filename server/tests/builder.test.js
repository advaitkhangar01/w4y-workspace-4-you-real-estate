// server/tests/builder.test.js
// Comprehensive test suite for W4Y Builder Module
// Covers Construction Timeline, Project-Scoped Transactional Inventory, and Isolation.

const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const jwt = require('jsonwebtoken');

describe('W4Y Builder Module Tests', () => {
  let adminToken;
  let adminUser;
  let projectAId;
  let projectBId;
  let cementMatId;
  let steelMatId;

  beforeAll(async () => {
    // 1. Get or create admin user for testing
    const { rows: userRows } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (userRows.length > 0) {
      adminUser = userRows[0];
    } else {
      const { rows: newAdmin } = await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ('Admin User', 'admin_test@w4y.com', 'hash', 'admin') RETURNING *"
      );
      adminUser = newAdmin[0];
    }

    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET
    );

    // 2. Create test client
    let clientId;
    const { rows: clientRows } = await pool.query('SELECT id FROM clients LIMIT 1');
    if (clientRows.length > 0) {
      clientId = clientRows[0].id;
    } else {
      const { rows: newClient } = await pool.query(
        "INSERT INTO clients (name, company_name) VALUES ('Builder Test Client', 'Builder Corp') RETURNING id"
      );
      clientId = newClient[0].id;
    }

    // 3. Create Project A and Project B for isolation testing
    const { rows: pA } = await pool.query(
      `INSERT INTO projects (name, client_id, client_name, type, location, status, created_by)
       VALUES ('Project Alpha Site', $1, 'Builder Corp', 'Construction', 'Nagpur East', 'Execution', $2) RETURNING id`,
      [clientId, adminUser.id]
    );
    projectAId = pA[0].id;

    const { rows: pB } = await pool.query(
      `INSERT INTO projects (name, client_id, client_name, type, location, status, created_by)
       VALUES ('Project Beta Site', $1, 'Builder Corp', 'Construction', 'Nagpur West', 'Execution', $2) RETURNING id`,
      [clientId, adminUser.id]
    );
    projectBId = pB[0].id;

    // 4. Retrieve material catalogue IDs
    const { rows: cementRows } = await pool.query(
      "SELECT id FROM material_catalogue WHERE name ILIKE '%OPC%' LIMIT 1"
    );
    cementMatId = cementRows[0].id;

    const { rows: steelRows } = await pool.query(
      "SELECT id FROM material_catalogue WHERE name ILIKE '%TMT%' LIMIT 1"
    );
    steelMatId = steelRows[0].id;
  });

  afterAll(async () => {
    // Clean up test projects
    if (projectAId) {
      await pool.query('DELETE FROM projects WHERE id = $1', [projectAId]);
    }
    if (projectBId) {
      await pool.query('DELETE FROM projects WHERE id = $1', [projectBId]);
    }
  });

  // -------------------------------------------------------------------------
  // 1. Catalogue & Projects
  // -------------------------------------------------------------------------
  describe('Material Catalogue & Global Selector', () => {
    it('GET /api/builder/materials/catalogue returns active catalogue items and supports alias search', async () => {
      const res = await request(app)
        .get('/api/builder/materials/catalogue?q=Sariya')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.catalogue)).toBe(true);
      expect(res.body.catalogue.length).toBeGreaterThan(0);
      expect(res.body.catalogue[0].name).toMatch(/TMT/i);
    });

    it('GET /api/builder/projects returns project list with construction summary fields', async () => {
      const res = await request(app)
        .get('/api/builder/projects')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.projects)).toBe(true);
      const projA = res.body.projects.find(p => p.id === projectAId);
      expect(projA).toBeDefined();
      expect(projA).toHaveProperty('overall_progress_pct');
      expect(projA).toHaveProperty('pending_issues_count');
      expect(projA).toHaveProperty('low_stock_warning_count');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Construction Timeline & Stages
  // -------------------------------------------------------------------------
  describe('Construction Timeline Stages', () => {
    let stage1Id;
    let stage2Id;

    it('GET /api/builder/projects/:id/stages auto-initializes the 17 default stages in sequence', async () => {
      const res = await request(app)
        .get(`/api/builder/projects/${projectAId}/stages`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.stages.length).toBe(17);
      expect(res.body.stages[0].stage_name).toBe('Execution Started & Site Handover');
      expect(res.body.stages[0].status).toBe('ready');
      expect(res.body.stages[1].status).toBe('not_started');
      expect(res.body.stages[16].stage_name).toBe('Final Inspection & Handover');

      stage1Id = res.body.stages[0].id;
      stage2Id = res.body.stages[1].id;
    });

    it('Stage initialization is idempotent', async () => {
      const res = await request(app)
        .get(`/api/builder/projects/${projectAId}/stages`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.stages.length).toBe(17);
    });

    it('Starting Stage 1 records actual_start and in_progress status', async () => {
      const res = await request(app)
        .patch(`/api/builder/projects/${projectAId}/stages/${stage1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'start' });

      expect(res.statusCode).toBe(200);
      expect(res.body.stage.status).toBe('in_progress');
      expect(res.body.stage.actual_start).toBeTruthy();
    });

    it('Attempting to complete or start Stage 2 when prerequisite is incomplete is blocked without override', async () => {
      const res = await request(app)
        .patch(`/api/builder/projects/${projectAId}/stages/${stage2Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'start', allow_override: false });

      expect(res.statusCode).toBe(400);
      expect(res.body.prerequisite_incomplete).toBe(true);
    });

    it('Completing Stage 1 automatically unlocks Stage 2 to ready status', async () => {
      const res1 = await request(app)
        .patch(`/api/builder/projects/${projectAId}/stages/${stage1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'complete' });

      expect(res1.statusCode).toBe(200);
      expect(res1.body.stage.status).toBe('completed');
      expect(res1.body.stage.progress_pct).toBe(100);

      const res2 = await request(app)
        .get(`/api/builder/projects/${projectAId}/stages`)
        .set('Authorization', `Bearer ${adminToken}`);

      const s2 = res2.body.stages.find(s => s.id === stage2Id);
      expect(s2.status).toBe('ready');
    });

    it('Reporting a blocker marks stage as blocked and records user attribution', async () => {
      const res = await request(app)
        .patch(`/api/builder/projects/${projectAId}/stages/${stage2Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'report_blocker', blocker_reason: 'Awaiting site clearance by local authorities' });

      expect(res.statusCode).toBe(200);
      expect(res.body.stage.status).toBe('blocked');
      expect(res.body.stage.blocker_reason).toBe('Awaiting site clearance by local authorities');
      expect(res.body.stage.blocker_reported_by).toBe(adminUser.id);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Project-Scoped Inventory Ledger (Section 15.3 Matrix)
  // -------------------------------------------------------------------------
  describe('Project-Scoped Inventory Transaction Ledger', () => {
    let requirementId;
    let receipt1MovementId;

    it('Test 15: Catalogue entry does not imply stock exists initially (0 usable stock)', async () => {
      const res = await request(app)
        .get(`/api/builder/projects/${projectAId}/materials`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      // Project A has no requirements or movements yet
      expect(res.body.materials.length).toBe(0);
    });

    it('Test 2: A requirement does NOT increase stock', async () => {
      const reqRes = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/requirements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          material_id: cementMatId,
          specification: '53 Grade Structural',
          quantity_needed: 200,
          unit: 'bags',
          notes: 'Initial requirement for plinth and foundation'
        });

      expect(reqRes.statusCode).toBe(201);
      requirementId = reqRes.body.requirement.id;

      // Check materials stock
      const stockRes = await request(app)
        .get(`/api/builder/projects/${projectAId}/materials`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(stockRes.statusCode).toBe(200);
      const cement = stockRes.body.materials.find(m => m.material_id === cementMatId);
      expect(cement).toBeDefined();
      expect(cement.total_needed).toBe(200);
      expect(cement.usable_stock).toBe(0); // MUST BE ZERO!
      expect(cement.total_received).toBe(0);
      expect(cement.stock_status).toBe('Out of Stock');
    });

    it('Test 9 & 10: Invalid or negative quantities are rejected', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'receipt',
          material_id: cementMatId,
          quantity: -25,
          unit: 'bags'
        });

      expect(res.statusCode).toBe(400);
    });

    it('Test 1: A physical receipt increases usable stock by accepted quantity', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'receipt',
          material_id: cementMatId,
          quantity: 100,
          unit: 'bags',
          condition: 'good',
          challan_invoice_no: 'CHAL-001',
          requirement_id: requirementId
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.updated_usable_stock).toBe(100);
      receipt1MovementId = res.body.movement.id;

      // Verify via GET
      const getRes = await request(app)
        .get(`/api/builder/projects/${projectAId}/materials`)
        .set('Authorization', `Bearer ${adminToken}`);

      const cement = getRes.body.materials.find(m => m.material_id === cementMatId);
      expect(cement.usable_stock).toBe(100);
      expect(cement.total_received).toBe(100);
      expect(cement.pending_quantity).toBe(100); // 200 needed - 100 received = 100 pending
    });

    it('Partially damaged receipt increases stock ONLY by accepted portion', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'receipt',
          material_id: cementMatId,
          quantity: 50,
          unit: 'bags',
          condition: 'partially_damaged',
          accepted_quantity: 40,
          rejected_quantity: 10,
          challan_invoice_no: 'CHAL-002'
        });

      expect(res.statusCode).toBe(201);
      // Previous 100 + 40 accepted = 140 usable
      expect(res.body.updated_usable_stock).toBe(140);
    });

    it('Rejected receipt does NOT increase usable stock', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'receipt',
          material_id: cementMatId,
          quantity: 30,
          unit: 'bags',
          condition: 'rejected',
          challan_invoice_no: 'CHAL-003'
        });

      expect(res.statusCode).toBe(201);
      // Still 140 usable
      expect(res.body.updated_usable_stock).toBe(140);
    });

    it('Test 4: Consumption reduces usable stock', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'consumption',
          material_id: cementMatId,
          quantity: 40,
          unit: 'bags',
          work_area: 'Foundation Soling Grid A1'
        });

      expect(res.statusCode).toBe(201);
      // 140 - 40 = 100
      expect(res.body.updated_usable_stock).toBe(100);
    });

    it('Test 11 & 13: Insufficient stock is rejected atomically without overspending', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'consumption',
          material_id: cementMatId,
          quantity: 9999, // Way more than available 100
          unit: 'bags',
          work_area: 'Slab'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.insufficient_stock).toBe(true);

      // Verify stock was NOT altered
      const getRes = await request(app)
        .get(`/api/builder/projects/${projectAId}/materials`)
        .set('Authorization', `Bearer ${adminToken}`);

      const cement = getRes.body.materials.find(m => m.material_id === cementMatId);
      expect(cement.usable_stock).toBe(100);
    });

    it('Test 5: A usable site return increases stock', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'site_return',
          material_id: cementMatId,
          quantity: 10,
          unit: 'bags',
          reason: 'Leftover from footing casting'
        });

      expect(res.statusCode).toBe(201);
      // 100 + 10 = 110
      expect(res.body.updated_usable_stock).toBe(110);
    });

    it('Test 6: A supplier return reduces stock', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'supplier_return',
          material_id: cementMatId,
          quantity: 15,
          unit: 'bags',
          reason: 'Returned surplus to supplier'
        });

      expect(res.statusCode).toBe(201);
      // 110 - 15 = 95
      expect(res.body.updated_usable_stock).toBe(95);
    });

    it('Test 7: Wastage reduces stock', async () => {
      const res = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'wastage',
          material_id: cementMatId,
          quantity: 5,
          unit: 'bags',
          reason: 'Bags hardened due to moisture'
        });

      expect(res.statusCode).toBe(201);
      // 95 - 5 = 90
      expect(res.body.updated_usable_stock).toBe(90);
    });

    it('Test 12: Idempotency prevents duplicate movement submissions', async () => {
      const idempKey = `test_idemp_key_${Date.now()}`;

      const res1 = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'consumption',
          material_id: cementMatId,
          quantity: 5,
          unit: 'bags',
          idempotency_key: idempKey
        });

      expect(res1.statusCode).toBe(201);

      // Repeat identical request
      const res2 = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'consumption',
          material_id: cementMatId,
          quantity: 5,
          unit: 'bags',
          idempotency_key: idempKey
        });

      expect(res2.statusCode).toBe(409);
      expect(res2.body.duplicate).toBe(true);
    });

    it('Test 14: Project Isolation: Project A movements do NOT leak into Project B', async () => {
      // In Project B, check cement stock
      const resB = await request(app)
        .get(`/api/builder/projects/${projectBId}/materials`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resB.statusCode).toBe(200);
      const cementB = resB.body.materials.find(m => m.material_id === cementMatId);
      // Project B should have NO cement stock
      expect(cementB).toBeUndefined();

      // Attempting to consume cement in Project B must fail because Project B has 0 stock!
      const spendRes = await request(app)
        .post(`/api/builder/projects/${projectBId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'consumption',
          material_id: cementMatId,
          quantity: 10,
          unit: 'bags'
        });

      expect(spendRes.statusCode).toBe(400);
      expect(spendRes.body.insufficient_stock).toBe(true);
    });

    it('Test 8: Authorized reversal adjusts balance correctly', async () => {
      // Check current usable stock in Project A before reversal
      const beforeRes = await request(app)
        .get(`/api/builder/projects/${projectAId}/materials/${cementMatId}/movements`)
        .set('Authorization', `Bearer ${adminToken}`);

      const usableBefore = beforeRes.body.summary.usable_stock;

      // Reverse the receipt of 100 bags (receipt1MovementId)
      // Note: usableBefore is ~85. Reversing 100 would make stock negative!
      // System must block reversing if usable stock is less than receipt amount:
      const failRev = await request(app)
        .post(`/api/builder/projects/${projectAId}/materials/movements/${receipt1MovementId}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Accidental double entry' });

      expect(failRev.statusCode).toBe(400);
      expect(failRev.body.error).toMatch(/remaining on site/i);

      // Now add 100 bags to Project B and reverse it cleanly in Project B
      const rB = await request(app)
        .post(`/api/builder/projects/${projectBId}/materials/movements`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          movement_type: 'receipt',
          material_id: steelMatId,
          quantity: 5,
          unit: 'tonnes',
          challan_invoice_no: 'REV-TEST'
        });

      expect(rB.statusCode).toBe(201);
      const steelMovId = rB.body.movement.id;
      expect(rB.body.updated_usable_stock).toBe(5);

      // Reverse the 5 tonnes receipt in Project B
      const revRes = await request(app)
        .post(`/api/builder/projects/${projectBId}/materials/movements/${steelMovId}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Wrong project delivery' });

      expect(revRes.statusCode).toBe(200);
      expect(revRes.body.success).toBe(true);
      expect(revRes.body.updated_usable_stock).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Site Diary & Issues
  // -------------------------------------------------------------------------
  describe('Site Diary & Site Issues', () => {
    it('POST & GET /api/builder/projects/:id/diary logs daily construction report', async () => {
      const addRes = await request(app)
        .post(`/api/builder/projects/${projectAId}/diary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          report_date: '2026-10-30',
          work_completed: 'Excavated 14 footing pits. Column layout marked by total station.',
          work_area: 'Zone A',
          issues_delays: 'None',
          next_day_plan: 'PCC soling pour scheduled at 10 AM.'
        });

      expect(addRes.statusCode).toBe(201);
      expect(addRes.body.diary_entry.work_completed).toContain('Excavated 14 footing pits');

      const getRes = await request(app)
        .get(`/api/builder/projects/${projectAId}/diary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.statusCode).toBe(200);
      expect(getRes.body.diary_entries.length).toBeGreaterThan(0);
    });

    it('POST & PATCH /api/builder/projects/:id/issues logs and updates site issue', async () => {
      const addRes = await request(app)
        .post(`/api/builder/projects/${projectAId}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Ready Mix Concrete pump breakdown',
          description: 'Transit mixer arrived but pump hydraulic arm failed.',
          category: 'other',
          priority: 'critical'
        });

      expect(addRes.statusCode).toBe(201);
      const issueId = addRes.body.issue.id;

      const patchRes = await request(app)
        .patch(`/api/builder/projects/${projectAId}/issues/${issueId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolution_notes: 'Backup pump dispatched from vendor plant. Pour completed.'
        });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.body.issue.status).toBe('resolved');
      expect(patchRes.body.issue.resolution_notes).toContain('Backup pump dispatched');
    });
  });
});
