// server/routes/builder.js
// W4Y Builder Module - Construction Timeline, Project Inventory & Site Management
// Strictly project-scoped, transactional, and audit-logged.

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');

// 17 Default Construction Stages (Section 5.2)
const DEFAULT_CONSTRUCTION_STAGES = [
  { num: 1, name: 'Execution Started & Site Handover', desc: 'Handover of site possession, baseline demarcations and boundary confirmation.' },
  { num: 2, name: 'Site Preparation & Layout', desc: 'Site clearance, leveling, temporary site office, electrical/water connections and column grid layout.' },
  { num: 3, name: 'Excavation & Earthwork', desc: 'Footing trenches excavation, soil testing verification, hard murum confirmation and pit dressing.' },
  { num: 4, name: 'Foundation', desc: 'Plain Cement Concrete (PCC) soling, footing reinforcement cage placement and raft/footing casting.' },
  { num: 5, name: 'Plinth & Damp-Proofing', desc: 'Plinth beam casting, anti-termite treatment, plinth murum backfilling and DPC installation.' },
  { num: 6, name: 'Structural Work', desc: 'RCC column raising, beam shuttering, reinforcement fabrication and floor/roof slab casting.' },
  { num: 7, name: 'Masonry & Blockwork', desc: 'External perimeter walling, internal partition masonry, lintel band casting and door/window opening frames.' },
  { num: 8, name: 'Concealed Plumbing & Electrical Work', desc: 'Chasing walls for PVC conduits, electrical switch boxes, concealed CPVC water supply lines and drain drops.' },
  { num: 9, name: 'Plastering', desc: 'Internal ceiling and wall plastering, chicken-mesh installation on joints, and external rough sand-faced plastering.' },
  { num: 10, name: 'Waterproofing', desc: 'Terrace waterproofing, toilet sunken slab bitumen/elastomeric coating and water ponding test.' },
  { num: 11, name: 'Flooring & Tiling', desc: 'Vitrified floor tiles, anti-skid toilet tiles, kitchen platform granite, skirting and tile joint grouting.' },
  { num: 12, name: 'Doors & Windows', desc: 'Door frame and shutter fixing, 3-track aluminium sliding windows and window sill marble/granite fitting.' },
  { num: 13, name: 'Electrical & Plumbing Fixtures', desc: 'Modular switch plates, sanitaryware (EWC/basins), CP fittings (taps/showers) and distribution board MCBs.' },
  { num: 14, name: 'Painting & Finishing', desc: 'Wall putty application, base primer coat, 2 coats of interior acrylic emulsion and exterior weatherproof paint.' },
  { num: 15, name: 'External Development', desc: 'Interlocking paver blocks, driveway boundary kerbstones, stormwater drainage Hume pipes and main entry gate.' },
  { num: 16, name: 'Testing & Defect Rectification', desc: 'Electrical circuits insulation testing, water line pressure tests, drainage slope check and snag list resolution.' },
  { num: 17, name: 'Final Inspection & Handover', desc: 'Deep cleaning, comprehensive client joint walkthrough, key handover and practical completion sign-off.' },
];

// Helper: Multer storage for builder photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const pid = req.params.id || req.query.project_id || req.body.project_id;
    if (!pid || isNaN(parseInt(pid))) {
      return cb(new Error('Invalid project_id for photo upload'));
    }
    const dir = path.join(__dirname, '..', 'uploads', 'projects', String(pid), 'builder');
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `builder_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit per photo
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Please upload a JPEG, PNG, or WebP photo.`));
    }
  }
});

// Helper: Calculate usable stock atomically for a project & material
async function getUsableStockInTransaction(client, projectId, materialId) {
  const { rows } = await client.query(
    `SELECT 
      COALESCE(SUM(CASE WHEN movement_type = 'receipt' AND NOT is_reversed THEN COALESCE(accepted_quantity, quantity) ELSE 0 END), 0) AS total_received,
      COALESCE(SUM(CASE WHEN movement_type = 'site_return' AND NOT is_reversed THEN quantity ELSE 0 END), 0) AS total_returned_usable,
      COALESCE(SUM(CASE WHEN movement_type = 'consumption' AND NOT is_reversed THEN quantity ELSE 0 END), 0) AS total_consumed,
      COALESCE(SUM(CASE WHEN movement_type = 'supplier_return' AND NOT is_reversed THEN quantity ELSE 0 END), 0) AS total_returned_supplier,
      COALESCE(SUM(CASE WHEN movement_type = 'wastage' AND NOT is_reversed THEN quantity ELSE 0 END), 0) AS total_wastage
     FROM project_material_movements
     WHERE project_id = $1 AND material_id = $2`,
    [projectId, materialId]
  );

  const row = rows[0] || {};
  const received = parseFloat(row.total_received) || 0;
  const siteReturned = parseFloat(row.total_returned_usable) || 0;
  const consumed = parseFloat(row.total_consumed) || 0;
  const supplierReturned = parseFloat(row.total_returned_supplier) || 0;
  const wasted = parseFloat(row.total_wastage) || 0;

  // Authoritative formula: Usable = accepted receipts + usable returns - consumption - supplier returns - wastage
  const usable = (received + siteReturned) - (consumed + supplierReturned + wasted);
  return {
    usable: Math.max(0, parseFloat(usable.toFixed(3))),
    rawUsable: parseFloat(usable.toFixed(3)),
    received,
    siteReturned,
    consumed,
    supplierReturned,
    wasted
  };
}

// ---------------------------------------------------------------------------
// 1. BUILDER PROJECTS (Global Selector)
// ---------------------------------------------------------------------------
router.get('/projects', authenticate, async (req, res) => {
  try {
    const user = req.user;
    let projectFilter = '';
    const params = [];

    // Access control: admins and design/project heads see all; employees see assigned
    if (user.role !== 'admin' && user.role !== 'design_head' && user.role !== 'project_head') {
      params.push(user.id);
      projectFilter = `
        AND (
          p.id IN (SELECT project_id FROM tasks WHERE assigned_to = $${params.length})
          OR p.id IN (SELECT t.project_id FROM task_participants tp JOIN tasks t ON t.id = tp.task_id WHERE tp.user_id = $${params.length})
          OR p.id IN (SELECT project_id FROM project_construction_stages WHERE assigned_user_id = $${params.length})
        )
      `;
    }

    const query = `
      SELECT 
        p.id,
        p.name,
        p.location,
        p.status,
        p.type,
        c.name AS client_name,
        u.name AS created_by_name,
        (
          SELECT json_build_object(
            'id', pcs.id,
            'stage_number', pcs.stage_number,
            'stage_name', pcs.stage_name,
            'status', pcs.status,
            'progress_pct', pcs.progress_pct
          )
          FROM project_construction_stages pcs
          WHERE pcs.project_id = p.id AND pcs.status IN ('in_progress', 'blocked', 'ready')
          ORDER BY pcs.stage_number ASC
          LIMIT 1
        ) AS current_stage,
        COALESCE(
          (SELECT ROUND(AVG(pcs.progress_pct)) FROM project_construction_stages pcs WHERE pcs.project_id = p.id),
          0
        ) AS overall_progress_pct,
        (
          SELECT COUNT(*)::int
          FROM project_site_issues psi
          WHERE psi.project_id = p.id AND psi.status IN ('open', 'in_progress')
        ) AS pending_issues_count,
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT pss.material_id
            FROM project_material_stock_summary pss
            LEFT JOIN (
              SELECT project_id, material_id, SUM(quantity_needed) AS total_needed
              FROM project_material_requirements
              WHERE status = 'active'
              GROUP BY project_id, material_id
            ) pmr ON pmr.project_id = pss.project_id AND pmr.material_id = pss.material_id
            WHERE pss.project_id = p.id
              AND (pss.usable_stock <= 0 OR (pmr.total_needed IS NOT NULL AND pss.usable_stock <= 0.2 * pmr.total_needed))
          ) low_stock_items
        ) AS low_stock_warning_count
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE 1=1 ${projectFilter}
      ORDER BY p.created_at DESC, p.id DESC
    `;

    const { rows } = await pool.query(query, params);
    res.json({ projects: rows });
  } catch (err) {
    console.error('[Builder API] Get projects error:', err);
    res.status(500).json({ error: 'Failed to load builder projects' });
  }
});

// ---------------------------------------------------------------------------
// 2. CONSTRUCTION STAGES & TIMELINE
// ---------------------------------------------------------------------------
router.get('/projects/:id/stages', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    // Check if stages exist for this project
    const { rows: existingStages } = await client.query(
      `SELECT pcs.*, u.name as assigned_user_name, br.name as blocker_reported_by_name
       FROM project_construction_stages pcs
       LEFT JOIN users u ON u.id = pcs.assigned_user_id
       LEFT JOIN users br ON br.id = pcs.blocker_reported_by
       WHERE pcs.project_id = $1
       ORDER BY pcs.stage_number ASC`,
      [pid]
    );

    if (existingStages.length > 0) {
      return res.json({ stages: existingStages });
    }

    // Auto-initialize the 17 default stages if not yet initialized
    await client.query('BEGIN');
    let prevStageId = null;
    const insertedStages = [];

    for (let i = 0; i < DEFAULT_CONSTRUCTION_STAGES.length; i++) {
      const item = DEFAULT_CONSTRUCTION_STAGES[i];
      const initialStatus = i === 0 ? 'ready' : 'not_started';
      const { rows } = await client.query(
        `INSERT INTO project_construction_stages 
         (project_id, stage_number, stage_name, description, status, prerequisite_stage_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [pid, item.num, item.name, item.desc, initialStatus, prevStageId]
      );
      prevStageId = rows[0].id;
      insertedStages.push(rows[0]);
    }
    await client.query('COMMIT');

    res.json({ stages: insertedStages });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[Builder API] Get/init stages error:', err);
    res.status(500).json({ error: 'Failed to load construction stages' });
  } finally {
    client.release();
  }
});

// PATCH /api/builder/projects/:id/stages/:stageId
router.patch('/projects/:id/stages/:stageId', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const stageId = parseInt(req.params.stageId);
  const { action, progress_pct, blocker_reason, assigned_user_id, planned_start, planned_finish, allow_override } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch existing stage
    const { rows: stageRows } = await client.query(
      'SELECT * FROM project_construction_stages WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [stageId, pid]
    );

    if (stageRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Stage not found in this project' });
    }

    const currentStage = stageRows[0];
    let newStatus = currentStage.status;
    let actualStart = currentStage.actual_start;
    let actualFinish = currentStage.actual_finish;
    let newProgress = currentStage.progress_pct;
    let newAssignedUser = assigned_user_id !== undefined ? assigned_user_id : currentStage.assigned_user_id;
    let newBlockerReason = currentStage.blocker_reason;
    let blockerReportedBy = currentStage.blocker_reported_by;
    let blockerReportedAt = currentStage.blocker_reported_at;

    // Prerequisite check if starting or completing
    if ((action === 'start' || action === 'complete') && currentStage.prerequisite_stage_id && !allow_override) {
      const { rows: prereqRows } = await client.query(
        'SELECT stage_name, status FROM project_construction_stages WHERE id = $1',
        [currentStage.prerequisite_stage_id]
      );
      if (prereqRows.length > 0 && prereqRows[0].status !== 'completed') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Prerequisite stage "${prereqRows[0].stage_name}" is currently ${prereqRows[0].status}. Complete it first or provide an authorized override.`,
          prerequisite_incomplete: true
        });
      }
    }

    if (action === 'start') {
      newStatus = 'in_progress';
      if (!actualStart) actualStart = new Date().toISOString();
      if (!newAssignedUser) newAssignedUser = req.user.id;
      newBlockerReason = null;
      blockerReportedBy = null;
      blockerReportedAt = null;
    } else if (action === 'update_progress') {
      const pct = parseInt(progress_pct);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Progress percentage must be an integer between 0 and 100' });
      }
      newProgress = pct;
      if (pct === 100 && newStatus !== 'completed') {
        newStatus = 'completed';
        if (!actualFinish) actualFinish = new Date().toISOString();
      } else if (pct < 100 && newStatus === 'completed') {
        newStatus = 'in_progress';
        actualFinish = null;
      }
    } else if (action === 'complete') {
      newStatus = 'completed';
      newProgress = 100;
      if (!actualStart) actualStart = new Date().toISOString();
      if (!actualFinish) actualFinish = new Date().toISOString();
      newBlockerReason = null;
      blockerReportedBy = null;
      blockerReportedAt = null;
    } else if (action === 'report_blocker') {
      if (!blocker_reason || !blocker_reason.trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Blocker description is required' });
      }
      newStatus = 'blocked';
      newBlockerReason = blocker_reason.trim();
      blockerReportedBy = req.user.id;
      blockerReportedAt = new Date().toISOString();
    } else if (action === 'resolve_blocker') {
      newStatus = 'in_progress';
      newBlockerReason = null;
      blockerReportedBy = null;
      blockerReportedAt = null;
    }

    // Update dates if provided
    let newPlannedStart = planned_start !== undefined ? planned_start : currentStage.planned_start;
    let newPlannedFinish = planned_finish !== undefined ? planned_finish : currentStage.planned_finish;

    if (newPlannedStart && newPlannedFinish && new Date(newPlannedStart) > new Date(newPlannedFinish)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Planned finish date cannot be earlier than planned start date' });
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE project_construction_stages
       SET status = $1, actual_start = $2, actual_finish = $3, progress_pct = $4,
           assigned_user_id = $5, blocker_reason = $6, blocker_reported_by = $7,
           blocker_reported_at = $8, planned_start = $9, planned_finish = $10,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [newStatus, actualStart, actualFinish, newProgress, newAssignedUser, newBlockerReason, blockerReportedBy, blockerReportedAt, newPlannedStart, newPlannedFinish, stageId]
    );

    // If stage was marked completed, check if next stage should be marked 'ready'
    if (newStatus === 'completed') {
      await client.query(
        `UPDATE project_construction_stages
         SET status = 'ready', updated_at = NOW()
         WHERE project_id = $1 AND prerequisite_stage_id = $2 AND status = 'not_started'`,
        [pid, stageId]
      );
    }

    // Return updated stage with user names
    const { rows: finalRows } = await client.query(
      `SELECT pcs.*, u.name as assigned_user_name, br.name as blocker_reported_by_name
       FROM project_construction_stages pcs
       LEFT JOIN users u ON u.id = pcs.assigned_user_id
       LEFT JOIN users br ON br.id = pcs.blocker_reported_by
       WHERE pcs.id = $1`,
      [stageId]
    );

    await client.query('COMMIT');

    res.json({ stage: finalRows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[Builder API] Update stage error:', err);
    res.status(500).json({ error: 'Failed to update construction stage' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// 3. MATERIAL CATALOGUE & PROJECT INVENTORY
// ---------------------------------------------------------------------------

// GET /api/builder/materials/catalogue
router.get('/materials/catalogue', authenticate, async (req, res) => {
  try {
    const { q, category } = req.query;
    let query = 'SELECT * FROM material_catalogue WHERE is_active = TRUE';
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      const pIdx = params.length;
      query += ` AND (name ILIKE $${pIdx} OR array_to_string(aliases, ' ') ILIKE $${pIdx} OR category ILIKE $${pIdx})`;
    }

    query += ' ORDER BY category ASC, name ASC';
    const { rows } = await pool.query(query, params);
    res.json({ catalogue: rows });
  } catch (err) {
    console.error('[Builder API] Get catalogue error:', err);
    res.status(500).json({ error: 'Failed to load material catalogue' });
  }
});

// GET /api/builder/projects/:id/materials
router.get('/projects/:id/materials', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  try {
    // Project-scoped stock summary: combines requirements and movements
    const query = `
      WITH project_requirements AS (
        SELECT 
          pmr.material_id,
          pmr.specification,
          pmr.unit,
          SUM(pmr.quantity_needed) AS total_needed
        FROM project_material_requirements pmr
        WHERE pmr.project_id = $1 AND pmr.status != 'cancelled'
        GROUP BY pmr.material_id, pmr.specification, pmr.unit
      ),
      project_movements AS (
        SELECT 
          pmm.material_id,
          COALESCE(SUM(CASE WHEN pmm.movement_type = 'receipt' AND NOT pmm.is_reversed THEN COALESCE(pmm.accepted_quantity, pmm.quantity) ELSE 0 END), 0) AS total_received,
          COALESCE(SUM(CASE WHEN pmm.movement_type = 'site_return' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_returned_usable,
          COALESCE(SUM(CASE WHEN pmm.movement_type = 'consumption' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_consumed,
          COALESCE(SUM(CASE WHEN pmm.movement_type = 'supplier_return' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_returned_supplier,
          COALESCE(SUM(CASE WHEN pmm.movement_type = 'wastage' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_wastage,
          MAX(pmm.occurrence_date) AS last_movement_date
        FROM project_material_movements pmm
        WHERE pmm.project_id = $1
        GROUP BY pmm.material_id
      )
      SELECT 
        mc.id AS material_id,
        mc.name AS material_name,
        mc.category AS category,
        COALESCE(pr.unit, mc.default_unit) AS unit,
        pr.specification,
        COALESCE(pr.total_needed, 0) AS total_needed,
        COALESCE(pm.total_received, 0) AS total_received,
        COALESCE(pm.total_returned_usable, 0) AS total_returned_usable,
        COALESCE(pm.total_consumed, 0) AS total_consumed,
        COALESCE(pm.total_returned_supplier, 0) AS total_returned_supplier,
        COALESCE(pm.total_wastage, 0) AS total_wastage,
        GREATEST(0, (COALESCE(pm.total_received, 0) + COALESCE(pm.total_returned_usable, 0)) - (COALESCE(pm.total_consumed, 0) + COALESCE(pm.total_returned_supplier, 0) + COALESCE(pm.total_wastage, 0))) AS usable_stock,
        pm.last_movement_date
      FROM material_catalogue mc
      LEFT JOIN project_requirements pr ON pr.material_id = mc.id
      LEFT JOIN project_movements pm ON pm.material_id = mc.id
      WHERE pr.material_id IS NOT NULL OR pm.material_id IS NOT NULL
      ORDER BY mc.category ASC, mc.name ASC
    `;

    const { rows } = await pool.query(query, [pid]);

    // Enhance with status
    const enhanced = rows.map(r => {
      const needed = parseFloat(r.total_needed) || 0;
      const received = parseFloat(r.total_received) || 0;
      const usable = parseFloat(r.usable_stock) || 0;

      let status = 'In Stock';
      if (usable <= 0) {
        status = 'Out of Stock';
      } else if (needed > 0 && usable <= (0.2 * needed)) {
        status = 'Low Stock';
      } else if (needed > 0 && received < needed) {
        status = 'Pending Delivery';
      }

      return {
        ...r,
        total_needed: needed,
        total_received: received,
        usable_stock: usable,
        total_consumed: parseFloat(r.total_consumed) || 0,
        total_returned_usable: parseFloat(r.total_returned_usable) || 0,
        total_returned_supplier: parseFloat(r.total_returned_supplier) || 0,
        total_wastage: parseFloat(r.total_wastage) || 0,
        pending_quantity: Math.max(0, parseFloat((needed - received).toFixed(3))),
        stock_status: status
      };
    });

    res.json({ materials: enhanced });
  } catch (err) {
    console.error('[Builder API] Get project materials error:', err);
    res.status(500).json({ error: 'Failed to load project materials' });
  }
});

// POST /api/builder/projects/:id/materials/requirements (Add Material Needed)
router.post('/projects/:id/materials/requirements', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const { material_id, specification, quantity_needed, unit, required_by, stage_id, preferred_vendor_id, notes } = req.body;

  if (!material_id || isNaN(parseInt(material_id))) {
    return res.status(400).json({ error: 'Valid material is required' });
  }

  const qty = parseFloat(quantity_needed);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity needed must be greater than zero' });
  }

  if (!unit || !unit.trim()) {
    return res.status(400).json({ error: 'Unit is required' });
  }

  try {
    // Check material catalogue existence
    const { rows: matRows } = await pool.query('SELECT name FROM material_catalogue WHERE id = $1', [material_id]);
    if (matRows.length === 0) {
      return res.status(404).json({ error: 'Selected material does not exist in catalogue' });
    }

    // Check duplicate requirement (same project, material, spec, stage, active)
    const { rows: dupRows } = await pool.query(
      `SELECT id, quantity_needed FROM project_material_requirements
       WHERE project_id = $1 AND material_id = $2 
         AND COALESCE(specification, '') = COALESCE($3, '') 
         AND COALESCE(stage_id, 0) = COALESCE($4, 0)
         AND status = 'active'`,
      [pid, material_id, specification || '', stage_id || 0]
    );

    if (dupRows.length > 0) {
      return res.status(409).json({ 
        error: 'An active requirement for this material and stage already exists. Please update the existing requirement instead of creating a duplicate.',
        existing_requirement_id: dupRows[0].id
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO project_material_requirements
       (project_id, material_id, specification, quantity_needed, unit, required_by, stage_id, preferred_vendor_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [pid, material_id, specification || null, qty, unit.trim(), required_by || null, stage_id || null, preferred_vendor_id || null, notes || null, req.user.id]
    );

    res.status(201).json({ requirement: rows[0], message: 'Material requirement saved successfully.' });
  } catch (err) {
    console.error('[Builder API] Add material requirement error:', err);
    res.status(500).json({ error: 'Failed to save material requirement' });
  }
});

// POST /api/builder/projects/:id/materials/movements (Atomic Stock Ledger Transactions)
router.post('/projects/:id/materials/movements', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const {
    movement_type,
    material_id,
    quantity,
    unit,
    condition = 'good',
    accepted_quantity,
    rejected_quantity = 0,
    challan_invoice_no,
    vendor_id,
    stage_id,
    work_area,
    reason,
    notes,
    photo_url,
    requirement_id,
    occurrence_date,
    idempotency_key
  } = req.body;

  // Validation
  const validTypes = ['receipt', 'consumption', 'site_return', 'supplier_return', 'wastage', 'adjustment'];
  if (!validTypes.includes(movement_type)) {
    return res.status(400).json({ error: `Invalid movement type. Must be one of: ${validTypes.join(', ')}` });
  }

  const matId = parseInt(material_id);
  if (isNaN(matId)) {
    return res.status(400).json({ error: 'Valid material_id is required' });
  }

  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than zero' });
  }

  if (!unit || !unit.trim()) {
    return res.status(400).json({ error: 'Unit of measurement is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Idempotency check: prevent duplicate submits
    if (idempotency_key && idempotency_key.trim()) {
      const { rows: idempRows } = await client.query(
        'SELECT id, created_at FROM project_material_movements WHERE project_id = $1 AND idempotency_key = $2',
        [pid, idempotency_key.trim()]
      );
      if (idempRows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'This operation has already been recorded.',
          duplicate: true,
          existing_movement_id: idempRows[0].id
        });
      }
    }

    // 2. Lock project + material to prevent concurrent stock overspending
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [pid, matId]);

    // 3. Current authoritative stock check
    const stockInfo = await getUsableStockInTransaction(client, pid, matId);

    // 4. Validate spending/deduction rules
    let effectiveAccepted = qty;
    let effectiveRejected = 0;

    if (movement_type === 'receipt') {
      if (condition === 'rejected') {
        effectiveAccepted = 0;
        effectiveRejected = qty;
      } else if (condition === 'partially_damaged') {
        const acc = parseFloat(accepted_quantity);
        const rej = parseFloat(rejected_quantity);
        if (isNaN(acc) || acc < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Accepted quantity is required and cannot be negative for partially damaged delivery' });
        }
        effectiveAccepted = acc;
        effectiveRejected = isNaN(rej) ? Math.max(0, qty - acc) : rej;
        if (effectiveAccepted + effectiveRejected > qty + 0.001) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Accepted plus rejected quantity cannot exceed total delivery quantity' });
        }
      } else {
        effectiveAccepted = qty;
        effectiveRejected = 0;
      }
    } else if (movement_type === 'consumption' || movement_type === 'supplier_return' || movement_type === 'wastage') {
      // Must not exceed usable stock!
      if (qty > stockInfo.usable + 0.0001) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock at this site. Only ${stockInfo.usable} ${unit} available. Cannot ${movement_type} ${qty} ${unit}.`,
          available_stock: stockInfo.usable,
          insufficient_stock: true
        });
      }
    }

    // 5. Insert movement into authoritative ledger
    const { rows: movRows } = await client.query(
      `INSERT INTO project_material_movements
       (project_id, material_id, requirement_id, movement_type, quantity, unit,
        condition, accepted_quantity, rejected_quantity, challan_invoice_no, vendor_id,
        stage_id, work_area, reason, notes, photo_url, idempotency_key, recorded_by, occurrence_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        pid,
        matId,
        requirement_id || null,
        movement_type,
        qty,
        unit.trim(),
        condition,
        effectiveAccepted,
        effectiveRejected,
        challan_invoice_no || null,
        vendor_id || null,
        stage_id || null,
        work_area || null,
        reason || null,
        notes || null,
        photo_url || null,
        idempotency_key ? idempotency_key.trim() : null,
        req.user.id,
        occurrence_date || new Date().toISOString().split('T')[0]
      ]
    );

    const movement = movRows[0];

    // 6. If linked to requirement, update requirement fulfillment status
    if (requirement_id) {
      const { rows: reqStockRows } = await client.query(
        `SELECT quantity_needed, 
                (SELECT COALESCE(SUM(COALESCE(accepted_quantity, quantity)), 0) 
                 FROM project_material_movements 
                 WHERE requirement_id = $1 AND movement_type = 'receipt' AND NOT is_reversed) AS total_received
         FROM project_material_requirements
         WHERE id = $1`,
        [requirement_id]
      );

      if (reqStockRows.length > 0) {
        const needed = parseFloat(reqStockRows[0].quantity_needed);
        const received = parseFloat(reqStockRows[0].total_received);
        const newReqStatus = received >= needed ? 'fulfilled' : (received > 0 ? 'partially_fulfilled' : 'active');
        await client.query(
          'UPDATE project_material_requirements SET status = $1, updated_at = NOW() WHERE id = $2',
          [newReqStatus, requirement_id]
        );
      }
    }

    // 7. Calculate new usable balance inside transaction
    const updatedStock = await getUsableStockInTransaction(client, pid, matId);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      movement,
      updated_usable_stock: updatedStock.usable,
      message: movement_type === 'receipt'
        ? `Received ${effectiveAccepted} ${unit} accepted (rejected: ${effectiveRejected}). New site balance: ${updatedStock.usable} ${unit}.`
        : `Recorded ${qty} ${unit} ${movement_type}. New site balance: ${updatedStock.usable} ${unit}.`
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[Builder API] Record material movement error:', err);
    res.status(500).json({ error: 'Failed to record material movement transaction' });
  } finally {
    client.release();
  }
});

// GET /api/builder/projects/:id/materials/:materialId/movements (Detail History Drawer)
router.get('/projects/:id/materials/:materialId/movements', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const matId = parseInt(req.params.materialId);

  try {
    const query = `
      SELECT 
        pmm.*,
        u.name AS recorded_by_name,
        v.name AS vendor_name,
        pcs.stage_name,
        mc.name AS material_name,
        mc.category AS material_category
      FROM project_material_movements pmm
      JOIN material_catalogue mc ON mc.id = pmm.material_id
      LEFT JOIN users u ON u.id = pmm.recorded_by
      LEFT JOIN vendors v ON v.id = pmm.vendor_id
      LEFT JOIN project_construction_stages pcs ON pcs.id = pmm.stage_id
      WHERE pmm.project_id = $1 AND pmm.material_id = $2
      ORDER BY pmm.occurrence_date DESC, pmm.created_at DESC
    `;

    const { rows } = await pool.query(query, [pid, matId]);

    // Authoritative totals
    const client = await pool.connect();
    let stockInfo;
    try {
      stockInfo = await getUsableStockInTransaction(client, pid, matId);
    } finally {
      client.release();
    }

    // Material requirements
    const { rows: reqRows } = await pool.query(
      `SELECT COALESCE(SUM(quantity_needed), 0) AS total_needed
       FROM project_material_requirements
       WHERE project_id = $1 AND material_id = $2 AND status != 'cancelled'`,
      [pid, matId]
    );

    const totalNeeded = parseFloat(reqRows[0]?.total_needed) || 0;

    res.json({
      movements: rows,
      summary: {
        usable_stock: stockInfo.usable,
        total_received: stockInfo.received,
        total_returned_usable: stockInfo.siteReturned,
        total_consumed: stockInfo.consumed,
        total_returned_supplier: stockInfo.supplierReturned,
        total_wastage: stockInfo.wasted,
        total_needed: totalNeeded,
        outstanding_needed: Math.max(0, parseFloat((totalNeeded - stockInfo.received).toFixed(3)))
      }
    });
  } catch (err) {
    console.error('[Builder API] Get material movements error:', err);
    res.status(500).json({ error: 'Failed to load material movement history' });
  }
});

// POST /api/builder/projects/:id/materials/movements/:movementId/reverse (Authorized Reversal)
router.post('/projects/:id/materials/movements/:movementId/reverse', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const movId = parseInt(req.params.movementId);
  const { reason } = req.body;

  if (req.user.role !== 'admin' && req.user.role !== 'design_head' && req.user.role !== 'project_head') {
    return res.status(403).json({ error: 'Unauthorized: Only administrators or project heads can reverse stock movements' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for reversal is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM project_material_movements WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [movId, pid]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movement record not found' });
    }

    const originalMov = rows[0];
    if (originalMov.is_reversed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This movement has already been reversed' });
    }

    // Lock material
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [pid, originalMov.material_id]);

    // Check if reversing this receipt would make current stock negative
    if (originalMov.movement_type === 'receipt' || originalMov.movement_type === 'site_return') {
      const currentStock = await getUsableStockInTransaction(client, pid, originalMov.material_id);
      const deductAmt = originalMov.movement_type === 'receipt'
        ? (originalMov.accepted_quantity !== null ? parseFloat(originalMov.accepted_quantity) : parseFloat(originalMov.quantity))
        : parseFloat(originalMov.quantity);

      if (currentStock.usable < deductAmt) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Cannot reverse this receipt: ${currentStock.usable} ${originalMov.unit} remaining on site, but reversing would require removing ${deductAmt} ${originalMov.unit}. Consume less before reversing.`
        });
      }
    }

    // Mark original as reversed
    await client.query(
      'UPDATE project_material_movements SET is_reversed = TRUE WHERE id = $1',
      [movId]
    );

    // Insert reversal movement
    const { rows: revRows } = await client.query(
      `INSERT INTO project_material_movements
       (project_id, material_id, requirement_id, movement_type, quantity, unit,
        reason, notes, reversal_of_id, recorded_by, occurrence_date)
       VALUES ($1, $2, $3, 'adjustment', $4, $5, $6, $7, $8, $9, CURRENT_DATE)
       RETURNING *`,
      [
        pid,
        originalMov.material_id,
        originalMov.requirement_id,
        originalMov.quantity,
        originalMov.unit,
        `Reversal of movement #${movId}: ${reason.trim()}`,
        `Original movement: ${originalMov.movement_type} of ${originalMov.quantity} ${originalMov.unit}`,
        movId,
        req.user.id
      ]
    );

    const updatedStock = await getUsableStockInTransaction(client, pid, originalMov.material_id);

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Movement successfully reversed.',
      reversal_movement: revRows[0],
      updated_usable_stock: updatedStock.usable
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[Builder API] Reverse movement error:', err);
    res.status(500).json({ error: 'Failed to reverse stock movement' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// 4. SITE DIARY & LOGS
// ---------------------------------------------------------------------------
router.get('/projects/:id/diary', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const { date } = req.query;

  try {
    let query = `
      SELECT 
        psd.*,
        u.name AS recorded_by_name,
        pcs.stage_name
      FROM project_site_diary psd
      LEFT JOIN users u ON u.id = psd.recorded_by
      LEFT JOIN project_construction_stages pcs ON pcs.id = psd.stage_id
      WHERE psd.project_id = $1
    `;
    const params = [pid];

    if (date) {
      params.push(date);
      query += ` AND psd.report_date = $${params.length}`;
    }

    query += ' ORDER BY psd.report_date DESC, psd.created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json({ diary_entries: rows });
  } catch (err) {
    console.error('[Builder API] Get site diary error:', err);
    res.status(500).json({ error: 'Failed to load site diary' });
  }
});

router.post('/projects/:id/diary', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const { report_date, work_completed, work_area, stage_id, issues_delays, next_day_plan, photo_urls } = req.body;

  if (!work_completed || !work_completed.trim()) {
    return res.status(400).json({ error: 'Work completed details are required' });
  }

  const dateStr = report_date || new Date().toISOString().split('T')[0];

  try {
    const { rows } = await pool.query(
      `INSERT INTO project_site_diary
       (project_id, report_date, work_completed, work_area, stage_id, issues_delays, next_day_plan, photo_urls, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        pid,
        dateStr,
        work_completed.trim(),
        work_area ? work_area.trim() : null,
        stage_id || null,
        issues_delays ? issues_delays.trim() : null,
        next_day_plan ? next_day_plan.trim() : null,
        JSON.stringify(photo_urls || []),
        req.user.id
      ]
    );

    // Return with user info
    const { rows: fullRows } = await pool.query(
      `SELECT psd.*, u.name AS recorded_by_name, pcs.stage_name
       FROM project_site_diary psd
       LEFT JOIN users u ON u.id = psd.recorded_by
       LEFT JOIN project_construction_stages pcs ON pcs.id = psd.stage_id
       WHERE psd.id = $1`,
      [rows[0].id]
    );

    res.status(201).json({ diary_entry: fullRows[0], message: 'Site diary recorded successfully.' });
  } catch (err) {
    console.error('[Builder API] Add site diary error:', err);
    res.status(500).json({ error: 'Failed to record site diary entry' });
  }
});

// ---------------------------------------------------------------------------
// 5. SITE ISSUES & BLOCKERS
// ---------------------------------------------------------------------------
router.get('/projects/:id/issues', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const { status, category } = req.query;

  try {
    let query = `
      SELECT 
        psi.*,
        u.name AS created_by_name,
        a.name AS assigned_to_name,
        pcs.stage_name
      FROM project_site_issues psi
      LEFT JOIN users u ON u.id = psi.created_by
      LEFT JOIN users a ON a.id = psi.assigned_to
      LEFT JOIN project_construction_stages pcs ON pcs.id = psi.stage_id
      WHERE psi.project_id = $1
    `;
    const params = [pid];

    if (status) {
      params.push(status);
      query += ` AND psi.status = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND psi.category = $${params.length}`;
    }

    query += " ORDER BY CASE psi.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, psi.created_at DESC";

    const { rows } = await pool.query(query, params);
    res.json({ issues: rows });
  } catch (err) {
    console.error('[Builder API] Get site issues error:', err);
    res.status(500).json({ error: 'Failed to load site issues' });
  }
});

router.post('/projects/:id/issues', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const { title, description, category = 'other', priority = 'medium', stage_id, assigned_to, due_date, photo_urls } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Issue title is required' });
  }

  const validCategories = ['shortage', 'delayed_delivery', 'damaged_material', 'site_access', 'rework', 'safety', 'quality', 'other'];
  const cat = validCategories.includes(category) ? category : 'other';

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const prio = validPriorities.includes(priority) ? priority : 'medium';

  try {
    const { rows } = await pool.query(
      `INSERT INTO project_site_issues
       (project_id, title, description, category, priority, stage_id, assigned_to, due_date, photo_urls, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        pid,
        title.trim(),
        description ? description.trim() : null,
        cat,
        prio,
        stage_id || null,
        assigned_to || null,
        due_date || null,
        JSON.stringify(photo_urls || []),
        req.user.id
      ]
    );

    const { rows: fullRows } = await pool.query(
      `SELECT psi.*, u.name AS created_by_name, a.name AS assigned_to_name, pcs.stage_name
       FROM project_site_issues psi
       LEFT JOIN users u ON u.id = psi.created_by
       LEFT JOIN users a ON a.id = psi.assigned_to
       LEFT JOIN project_construction_stages pcs ON pcs.id = psi.stage_id
       WHERE psi.id = $1`,
      [rows[0].id]
    );

    res.status(201).json({ issue: fullRows[0], message: 'Site issue reported successfully.' });
  } catch (err) {
    console.error('[Builder API] Add site issue error:', err);
    res.status(500).json({ error: 'Failed to record site issue' });
  }
});

router.patch('/projects/:id/issues/:issueId', authenticate, checkProjectAccess(), async (req, res) => {
  const pid = parseInt(req.params.id);
  const issueId = parseInt(req.params.issueId);
  const { status, assigned_to, resolution_notes, priority } = req.body;

  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const { rows: existingRows } = await pool.query(
      'SELECT * FROM project_site_issues WHERE id = $1 AND project_id = $2',
      [issueId, pid]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Site issue not found in this project' });
    }

    const current = existingRows[0];
    const newStatus = status || current.status;
    const newAssigned = assigned_to !== undefined ? assigned_to : current.assigned_to;
    const newNotes = resolution_notes !== undefined ? resolution_notes : current.resolution_notes;
    const newPriority = priority || current.priority;

    const { rows } = await pool.query(
      `UPDATE project_site_issues
       SET status = $1, assigned_to = $2, resolution_notes = $3, priority = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [newStatus, newAssigned, newNotes, newPriority, issueId]
    );

    const { rows: fullRows } = await pool.query(
      `SELECT psi.*, u.name AS created_by_name, a.name AS assigned_to_name, pcs.stage_name
       FROM project_site_issues psi
       LEFT JOIN users u ON u.id = psi.created_by
       LEFT JOIN users a ON a.id = psi.assigned_to
       LEFT JOIN project_construction_stages pcs ON pcs.id = psi.stage_id
       WHERE psi.id = $1`,
      [issueId]
    );

    res.json({ issue: fullRows[0], message: 'Site issue updated successfully.' });
  } catch (err) {
    console.error('[Builder API] Update site issue error:', err);
    res.status(500).json({ error: 'Failed to update site issue' });
  }
});

// ---------------------------------------------------------------------------
// 6. SITE PHOTO UPLOAD
// ---------------------------------------------------------------------------
router.post('/projects/:id/photos/upload', authenticate, checkProjectAccess(), upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo provided or file type unsupported' });
  }

  const pid = req.params.id;
  const relativePath = `/uploads/projects/${pid}/builder/${req.file.filename}`;

  res.status(201).json({
    url: relativePath,
    filename: req.file.filename,
    original_name: req.file.originalname,
    size: req.file.size
  });
});

module.exports = router;
