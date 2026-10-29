// server/routes/projects.js
// Project CRUD with stage auto-generation

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const { createNotification } = require('../utils/notifier');

// Default stages
const DEFAULT_STAGES = ['Proposal', 'Design', 'Submission', 'Working', 'Execution'];

// POST /api/projects
router.post('/', authenticate, async (req, res) => {
  const client = await pool.connect();
  let inTxn = false;
  try {
    const { name, client_id, type, location, area_sq_ft, structural_engineer, status, stages: customStages, start_date } = req.body;

    if (!name || !client_id || !type) {
      return res.status(400).json({ error: 'name, client_id, and type are required' });
    }

    // Validate client existence
    const { rowCount: clientExists } = await client.query('SELECT 1 FROM clients WHERE id = $1', [client_id]);
    if (!clientExists) return res.status(400).json({ error: 'Selected client does not exist' });

    await client.query('BEGIN');
    inTxn = true;

    // Create project
    const { rows } = await client.query(
      `INSERT INTO projects (name, client_id, type, location, area_sq_ft, structural_engineer, status, start_date, created_by, client_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT name FROM clients WHERE id = $2))
       RETURNING *`,
      [name, client_id, type, location || null, area_sq_ft || null, structural_engineer || null, status || 'Design Proposal', start_date || null, req.user.id]
    );
    const project = rows[0];

    // Auto-generate stages
    const stagesToInsert = (customStages && Array.isArray(customStages) && customStages.length > 0) ? customStages : DEFAULT_STAGES;
    for (const stage of stagesToInsert) {
      await client.query(
        `INSERT INTO project_stages (project_id, stage_name, status) VALUES ($1, $2, 'pending')`,
        [project.id, stage]
      );
    }

    await client.query('COMMIT');
    inTxn = false;

    // Return full project with stages
    const { rows: stageRows } = await pool.query(
      'SELECT * FROM project_stages WHERE project_id = $1 ORDER BY id',
      [project.id]
    );

    res.status(201).json({ project: { ...project, stages: stageRows } });
  } catch (err) {
    if (inTxn) { try { await client.query('ROLLBACK'); } catch (_) {} }
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/projects
router.get('/', authenticate, async (req, res) => {
  try {
    const { page, limit } = req.query;

    let query = `
      SELECT p.*, 
        u.name as created_by_name,
        c.name as client_name,
        c.company_name as client_company,
        (SELECT name FROM project_stakeholders WHERE project_id = p.id AND is_primary = TRUE LIMIT 1) as primary_contact_name,
        (SELECT phone FROM project_stakeholders WHERE project_id = p.id AND is_primary = TRUE LIMIT 1) as primary_contact_phone,
        COALESCE((SELECT json_agg(ps.* ORDER BY ps.id) FROM project_stages ps WHERE ps.project_id = p.id), '[]'::json) as stages
      FROM projects p
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN clients c ON c.id = p.client_id
      ORDER BY p.created_at DESC`;
    const params = [];

    if (limit) {
      const pageInt = parseInt(page) || 1;
      const limitInt = parseInt(limit);
      const offset = (pageInt - 1) * limitInt;
      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limitInt, offset);
    }

    const { rows } = await pool.query(query, params);
    res.json({ 
      projects: rows, 
      page: page ? parseInt(page) : 1, 
      limit: limit ? parseInt(limit) : rows.length 
    });

  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id
router.get('/:id', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name as created_by_name,
              c.name as client_display_name, c.company_name as client_company, 
              c.gst_number, c.pan_number, c.phone as client_phone, c.email as client_email, c.address as client_address,
              (SELECT name FROM client_contacts WHERE client_id = c.id AND is_primary = TRUE LIMIT 1) as primary_contact_name,
              (SELECT phone FROM client_contacts WHERE client_id = c.id AND is_primary = TRUE LIMIT 1) as primary_contact_phone,
              (SELECT email FROM client_contacts WHERE client_id = c.id AND is_primary = TRUE LIMIT 1) as primary_contact_email,
              (SELECT phone FROM project_stakeholders WHERE project_id = p.id AND is_primary = TRUE LIMIT 1) as project_stakeholder_phone,
              (SELECT email FROM project_stakeholders WHERE project_id = p.id AND is_primary = TRUE LIMIT 1) as project_stakeholder_email
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = rows[0];

    // Get stages
    const { rows: stages } = await pool.query(
      'SELECT * FROM project_stages WHERE project_id = $1 ORDER BY id',
      [project.id]
    );

    // Get assignments
    const { rows: assignments } = await pool.query(
      `SELECT u.id, u.name, u.department FROM project_assignments pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = $1`,
      [project.id]
    );

    res.json({ project: { ...project, stages, assignments } });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/projects/:id (update project details)
// D3: Restricted to admin, design_head, and project_head roles
router.patch('/:id', authenticate, async (req, res) => {
  // Role check — employees and accounts staff cannot modify project details
  const canEdit = req.user.role === 'admin'
    || req.user.role === 'design_head'
    || req.user.role === 'project_head';
  if (!canEdit) {
    return res.status(403).json({ error: 'Admin, Design Head, or Project Head access required to modify projects' });
  }

  const db_client = await pool.connect();
  try {
    const { status, area_sq_ft, structural_engineer, type, location, name, client_id } = req.body;
    
    await db_client.query('BEGIN');

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (status !== undefined) { updates.push(`status = $${paramIdx++}`); values.push(status); }
    if (area_sq_ft !== undefined) { updates.push(`area_sq_ft = $${paramIdx++}`); values.push(area_sq_ft); }
    if (structural_engineer !== undefined) { updates.push(`structural_engineer = $${paramIdx++}`); values.push(structural_engineer); }
    if (type !== undefined) { updates.push(`type = $${paramIdx++}`); values.push(type); }
    if (location !== undefined) { updates.push(`location = $${paramIdx++}`); values.push(location); }
    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); values.push(name); }
    
    if (client_id !== undefined) { 
      // Validate client exists and get name
      const { rows: clientRows } = await db_client.query('SELECT name FROM clients WHERE id = $1', [client_id]);
      if (clientRows.length === 0) {
        await db_client.query('ROLLBACK');
        return res.status(400).json({ error: 'Client not found' });
      }
      updates.push(`client_id = $${paramIdx++}`); 
      values.push(client_id);
      updates.push(`client_name = $${paramIdx++}`);
      values.push(clientRows[0].name);
    }

    if (updates.length === 0) {
      await db_client.query('COMMIT');
      return res.json({ message: 'No updates provided' });
    }

    values.push(req.params.id);

    const { rows } = await db_client.query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    if (!rows.length) {
      await db_client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    await db_client.query('COMMIT');
    res.json({ project: rows[0] });
  } catch (err) {
    if (db_client) await db_client.query('ROLLBACK');
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (db_client) db_client.release();
  }
});

// GET /api/projects/search (admin: search projects for linking)
router.get('/search/linkable', authenticate, requireAccounting, async (req, res) => {
  try {
    const { q, exclude_client_id } = req.query;
    let query = `
      SELECT p.id, p.name, p.client_name, p.type, p.status, c.name as current_client_linked_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (q) {
      query += ` AND (p.name ILIKE $${paramIdx} OR p.client_name ILIKE $${paramIdx})`;
      params.push(`%${q}%`);
      paramIdx++;
    }

    if (exclude_client_id) {
      query += ` AND (p.client_id IS NULL OR p.client_id != $${paramIdx})`;
      params.push(exclude_client_id);
      paramIdx++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT 20`;
    
    const { rows } = await pool.query(query, params);
    res.json({ projects: rows });
  } catch (err) {
    console.error('Search linkable projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/suggestions/:client_id (admin: get smart suggestions)
router.get('/suggestions/:client_id', authenticate, requireAccounting, async (req, res) => {
  try {
    const { client_id } = req.params;
    const { rows: clientRows } = await pool.query('SELECT name FROM clients WHERE id = $1', [client_id]);
    if (clientRows.length === 0) return res.status(404).json({ error: 'Client not found' });
    
    const clientName = clientRows[0].name;

    // Find projects where client_name matches but client_id is different or null
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.client_name, p.type, p.status
      FROM projects p
      WHERE (LOWER(p.client_name) = LOWER($1) OR p.client_name ILIKE $2)
      AND (p.client_id IS NULL OR p.client_id != $3)
    `, [clientName, `%${clientName}%`, client_id]);

    res.json({ suggestions: rows });
  } catch (err) {
    console.error('Get suggestions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id/financial-summary
router.get('/:id/financial-summary', authenticate, requireAccounting, checkProjectAccess(), async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get Total Project Value (SUM of document amounts)
    const valRes = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total_value FROM project_document_amounts WHERE project_id = $1',
      [id]
    );

    // 2. Get Already Paid (SUM of income transactions)
    const paidRes = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total_paid FROM transactions WHERE project_id = $1 AND type = 'income'",
      [id]
    );

    res.json({
      total_project_value: parseFloat(valRes.rows[0].total_value),
      total_paid: parseFloat(paidRes.rows[0].total_paid)
    });
  } catch (err) {
    console.error('Get project financial summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: Auto-update project status based on stages
async function autoUpdateProjectStatus(projectId) {
  const { rows: stages } = await pool.query(
    'SELECT stage_name, status FROM project_stages WHERE project_id = $1 ORDER BY id',
    [projectId]
  );

  let newStatus = 'Pending';

  const proposal = stages.find(s => s.stage_name === 'Proposal');
  const design = stages.find(s => s.stage_name === 'Design');
  const submission = stages.find(s => s.stage_name === 'Submission');
  const working = stages.find(s => s.stage_name === 'Working');
  const execution = stages.find(s => s.stage_name === 'Execution');

  if (execution?.status === 'completed') {
    newStatus = 'Completed';
  } else if (execution?.status === 'in_progress' || working?.status === 'completed' || working?.status === 'in_progress') {
    newStatus = 'Under Execution';
  } else if (submission?.status === 'completed') {
    newStatus = 'Under Execution'; 
  } else if (submission?.status === 'in_progress') {
    newStatus = 'Under Sanctioning';
  } else if (design?.status === 'completed' || design?.status === 'in_progress') {
    newStatus = 'Under Designing';
  } else if (proposal?.status === 'completed' || proposal?.status === 'in_progress') {
    newStatus = 'Under Proposal';
  } else {
    newStatus = 'Pending';
  }

  await pool.query('UPDATE projects SET status = $1 WHERE id = $2', [newStatus, projectId]);
  return newStatus;
}

// PATCH /api/projects/:id/stages/:stageId  (update stage status)
router.patch('/:id/stages/:stageId', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await pool.query(
      `UPDATE project_stages SET status = $1 WHERE id = $2 AND project_id = $3`,
      [status, req.params.stageId, req.params.id]
    );

    // Auto-update project status
    const newProjectStatus = await autoUpdateProjectStatus(req.params.id);

    // Get the updated stage to return
    const { rows: stageRows } = await pool.query(
      'SELECT * FROM project_stages WHERE id = $1',
      [req.params.stageId]
    );

    res.json({ 
      stage: stageRows[0],
      projectStatus: newProjectStatus
    });
  } catch (err) {
    console.error('Update stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:id/assign  (assign employee)
router.post('/:id/assign', authenticate, requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    const projectId = req.params.id;

    await pool.query(
      `INSERT INTO project_assignments (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [projectId, user_id]
    );

    // Fetch project name for notification
    const { rows: projRows } = await pool.query('SELECT name FROM projects WHERE id = $1', [projectId]);
    const projectName = projRows[0]?.name || 'Project';

    createNotification({
      recipientIds: user_id,
      senderId: req.user.id,
      section: 'projects',
      title: '🏗️ Assigned to Project',
      message: `${req.user.name} assigned you to project "${projectName}"`,
      entityType: 'project',
      entityId: parseInt(projectId, 10),
      actionUrl: `/projects/${projectId}`,
    });

    res.json({ message: 'Assigned successfully' });
  } catch (err) {
    console.error('Assign error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id/assign/:userId (unassign employee)
router.delete('/:id/assign/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM project_assignments WHERE project_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Unassigned successfully' });
  } catch (err) {
    console.error('Unassign error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id/stakeholders
router.get('/:id/stakeholders', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM project_stakeholders WHERE project_id = $1 ORDER BY is_primary DESC, id ASC',
      [req.params.id]
    );
    res.json({ stakeholders: rows });
  } catch (err) {
    console.error('Get stakeholders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:id/stakeholders
router.post('/:id/stakeholders', authenticate, async (req, res) => {
  try {
    const { name, role, phone, email, is_primary } = req.body;
    
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!phone && !email) return res.status(400).json({ error: 'Phone or email is required' });

    // Prevent duplicates (same phone or email in same project)
    const { rows: existing } = await pool.query(
      'SELECT id FROM project_stakeholders WHERE project_id = $1 AND (phone = $2 OR email = $3)',
      [req.params.id, phone || null, email || null]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Stakeholder with this phone or email already exists in this project' });
    }

    // Handle primary
    if (is_primary) {
      await pool.query('UPDATE project_stakeholders SET is_primary = FALSE WHERE project_id = $1', [req.params.id]);
    } else {
      // If this is the first stakeholder, make it primary
      const { rows: current } = await pool.query('SELECT count(*) FROM project_stakeholders WHERE project_id = $1', [req.params.id]);
      if (parseInt(current[0].count) === 0) {
        req.body.is_primary = true;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO project_stakeholders (project_id, name, role, phone, email, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, name, role, phone || null, email || null, req.body.is_primary || is_primary || false]
    );

    res.status(201).json({ stakeholder: rows[0] });
  } catch (err) {
    console.error('Add stakeholder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/projects/:id/stakeholders/:stakeholderId
router.patch('/:id/stakeholders/:stakeholderId', authenticate, async (req, res) => {
  try {
    const { name, role, phone, email, is_primary } = req.body;
    
    // Prevent duplicates (same phone or email in same project, excluding this stakeholder)
    const { rows: existing } = await pool.query(
      'SELECT id FROM project_stakeholders WHERE project_id = $1 AND id != $2 AND ((phone IS NOT NULL AND phone = $3) OR (email IS NOT NULL AND email = $4))',
      [req.params.id, req.params.stakeholderId, phone || null, email || null]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Another stakeholder with this phone or email already exists in this project' });
    }

    if (is_primary) {
      await pool.query('UPDATE project_stakeholders SET is_primary = FALSE WHERE project_id = $1', [req.params.id]);
    }

    const { rows } = await pool.query(
      `UPDATE project_stakeholders 
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           phone = COALESCE($3, phone),
           email = COALESCE($4, email),
           is_primary = COALESCE($5, is_primary)
       WHERE id = $6 AND project_id = $7
       RETURNING *`,
      [name, role, phone, email, is_primary, req.params.stakeholderId, req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Stakeholder not found' });

    res.json({ stakeholder: rows[0] });
  } catch (err) {
    console.error('Update stakeholder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id/stakeholders/:stakeholderId
router.delete('/:id/stakeholders/:stakeholderId', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM project_stakeholders WHERE id = $1 AND project_id = $2 RETURNING is_primary',
      [req.params.stakeholderId, req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Stakeholder not found' });

    // If we deleted the primary, assign a new primary if there are other stakeholders left
    if (rows[0].is_primary) {
      const { rows: remaining } = await pool.query('SELECT id FROM project_stakeholders WHERE project_id = $1 ORDER BY id ASC LIMIT 1', [req.params.id]);
      if (remaining.length > 0) {
        await pool.query('UPDATE project_stakeholders SET is_primary = TRUE WHERE id = $1', [remaining[0].id]);
      }
    }

    res.json({ message: 'Stakeholder deleted' });
  } catch (err) {
    console.error('Delete stakeholder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const fs = require('fs');
const path = require('path');

// DELETE /api/projects/:id (admin: delete project and its files)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // 1. Get project info (optional, for logging or verification)
    const { rows } = await client.query('SELECT name FROM projects WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    const projectName = rows[0].name;

    await client.query('BEGIN');

    // 2. Delete from database (CASCADE handles related tables: project_stages, project_assignments, comments, documents)
    await client.query('DELETE FROM projects WHERE id = $1', [id]);

    // 3. Delete project-specific uploads directory
    const projectUploadDir = path.join(__dirname, '..', 'uploads', 'projects', String(id));
    try {
      if (fs.existsSync(projectUploadDir)) {
        // fs.rmSync to delete directory and its contents recursively
        fs.rmSync(projectUploadDir, { recursive: true, force: true });
      }
    } catch (fsErr) {
      console.error(`[Project Delete] Failed to delete directory ${projectUploadDir}:`, fsErr);
    }

    await client.query('COMMIT');
    console.log(`[Project Delete] Admin ${req.user.id} deleted project "${projectName}" (ID: ${id})`);
    res.json({ message: `Project "${projectName}" and all related data deleted successfully` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Server error during deletion' });
  } finally {
    client.release();
  }
});

// GET /api/projects/:id/vendors
router.get('/:id/vendors', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const pid = parseInt(req.params.id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    const { rows } = await pool.query(
      `SELECT v.*, pv.assigned_at 
       FROM vendors v
       JOIN project_vendors pv ON v.id = pv.vendor_id
       WHERE pv.project_id = $1
       ORDER BY v.category, v.name`,
      [pid]
    );
    res.json({ vendors: rows });
  } catch (err) {
    console.error('Get project vendors error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:id/vendors
router.post('/:id/vendors', authenticate, async (req, res) => {
  try {
    const pid = parseInt(req.params.id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });
    
    const { vendor_id } = req.body;
    if (!vendor_id) return res.status(400).json({ error: 'vendor_id is required' });

    await pool.query(
      `INSERT INTO project_vendors (project_id, vendor_id) 
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [pid, vendor_id]
    );
    res.status(201).json({ message: 'Vendor added to project' });
  } catch (err) {
    console.error('Add project vendor error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id/vendors/:vendorId - Admin only
router.delete('/:id/vendors/:vendorId', authenticate, requireAdmin, async (req, res) => {
  try {
    const pid = parseInt(req.params.id);
    const vid = parseInt(req.params.vendorId);
    if (isNaN(pid) || isNaN(vid)) return res.status(400).json({ error: 'Invalid ID' });

    await pool.query(
      'DELETE FROM project_vendors WHERE project_id = $1 AND vendor_id = $2',
      [pid, vid]
    );
    res.json({ message: 'Vendor removed from project' });
  } catch (err) {
    console.error('Remove project vendor error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
