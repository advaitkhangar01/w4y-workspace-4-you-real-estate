// server/routes/tasks.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const { createNotification, deleteEntityNotifications } = require('../utils/notifier');

// Helper: Parse @mentions
async function parseMentions(message) {
  const mentionMatch = message.match(/@(\w+)/g);
  if (!mentionMatch) return [];

  const usernames = mentionMatch.map(m => m.substring(1).toLowerCase());
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE LOWER(username) = ANY($1)',
    [usernames]
  );
  return rows.map(r => r.id);
}

// 1. Create Task
// POST /api/tasks
router.post('/', authenticate, checkProjectAccess(), async (req, res) => {
  const isPrivileged = req.user.role === 'admin' || req.user.role === 'design_head' || req.user.role === 'accounts' || req.user.department === 'accounts' || req.user.role === 'back_office' || req.user.role === 'project_head';
  if (!isPrivileged) {
    return res.status(403).json({ error: 'Only authorized roles can create tasks' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { project_id, stage, title, description, assigned_to, participants, start_date, priority, due_date } = req.body;

    if (!project_id || !title?.trim()) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }

    const finalPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';

    const { rows: [task] } = await client.query(`
      INSERT INTO tasks (project_id, stage, title, description, assigned_to, created_by, status, created_at, updated_at, start_date, priority, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW(), COALESCE($7, CURRENT_DATE), $8, $9)
      RETURNING *
    `, [project_id, stage || 'general', title.trim(), description || null, assigned_to ? parseInt(assigned_to, 10) : null, req.user.id, start_date || null, finalPriority, due_date || null]);

    // Ensure assigned_to and creator are participants
    const uniqueParticipants = new Set(participants ? participants.map(p => parseInt(p, 10)) : []);
    uniqueParticipants.add(req.user.id);
    if (assigned_to) uniqueParticipants.add(parseInt(assigned_to, 10));

    for (const userId of uniqueParticipants) {
      if (!userId || isNaN(userId)) continue;
      await client.query(`
        INSERT INTO task_participants (task_id, user_id, added_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (task_id, user_id) DO NOTHING
      `, [task.id, userId, req.user.id]);
    }

    await client.query('COMMIT');

    // Fetch full task data with assigned user name
    const { rows: fullTask } = await pool.query(`
      SELECT t.*, u.name as assigned_to_name, u.username as assigned_to_username, p.name as project_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.id = $1
    `, [task.id]);

    const createdTask = fullTask[0];

    // Trigger notification to assignee & participants asynchronously (excluding sender)
    if (createdTask) {
      const recipientIds = Array.from(uniqueParticipants).filter(id => id !== req.user.id);
      if (recipientIds.length > 0) {
        createNotification({
          recipientIds,
          senderId: req.user.id,
          section: 'tasks',
          title: '📌 New Task Assigned',
          message: `${req.user.name} assigned you to task "${createdTask.title}" in project "${createdTask.project_name || 'General'}"`,
          entityType: 'task',
          entityId: createdTask.id,
          actionUrl: `/tasks?taskId=${createdTask.id}`,
        });
      }
    }

    res.status(201).json({ task: createdTask });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// 2. Fetch Board / List Tasks
// GET /api/tasks
router.get('/', authenticate, async (req, res) => {
  try {
    const { view, project_id, status } = req.query;
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'design_head' || req.user.role === 'accounts' || req.user.department === 'accounts' || req.user.role === 'back_office' || req.user.role === 'project_head';

    if (view === 'kanban' || view === 'history' || view === 'scheduled') {

      // Group by assigned_to
      // We fetch all active employees (or all employees for history view to preserve historical records)
      let empQuery = `
        SELECT id, name, username, role, department FROM users 
        WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head')
      `;
      if (view !== 'history') {
        empQuery += ` AND is_active IS NOT FALSE `;
      }
      empQuery += ` ORDER BY name ASC `;
      const { rows: employees } = await pool.query(empQuery);

      // Fetch tasks the user has access to
      let tasksQuery = `
        SELECT t.*, p.name as project_name, u.name as assigned_to_name,
               COALESCE(
                 json_agg(
                   json_build_object('user_id', tp.user_id, 'name', part_u.name, 'username', part_u.username)
                 ) FILTER (WHERE tp.user_id IS NOT NULL), '[]'::json
               ) as participants
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN users u ON u.id = t.assigned_to
        LEFT JOIN task_participants tp ON tp.task_id = t.id
        LEFT JOIN users part_u ON part_u.id = tp.user_id
      `;
      
      const tasksParams = [];
      if (view === 'history') {
        tasksQuery += ` WHERE t.status = 'passed' `;
      } else if (view === 'scheduled') {
        tasksQuery += ` WHERE t.status != 'passed' AND t.start_date > CURRENT_DATE `;
      } else {
        tasksQuery += ` WHERE t.status != 'passed' AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE) `;
      }

      tasksQuery += ` GROUP BY t.id, p.name, u.name ORDER BY t.created_at DESC`;
      
      const { rows: tasks } = await pool.query(tasksQuery, tasksParams);

      // Group by employee
      const kanban = {};
      
      // Initialize columns based on user role privilege level
      employees.forEach(emp => {
        if (isPrivileged || emp.id === req.user.id) {
          kanban[emp.id] = {
            user_id: emp.id,
            name: emp.name,
            username: emp.username,
            department: emp.department,
            tasks: []
          };
        }
      });

      // Add "Unassigned" column
      kanban['unassigned'] = {
        user_id: null,
        name: 'Unassigned',
        username: 'unassigned',
        department: null,
        tasks: []
      };

      // Map tasks to employees
      tasks.forEach(t => {
        if (t.assigned_to && kanban[t.assigned_to]) {
          kanban[t.assigned_to].tasks.push(t);
        } else if (!t.assigned_to) {
          kanban['unassigned'].tasks.push(t);
        }
      });

      // Filter out empty columns for History/Scheduled views to keep it clean and focused
      let result = Object.values(kanban);
      if (view === 'history' || view === 'scheduled') {
        result = result.filter(col => col.tasks.length > 0);
      } else if (!isPrivileged) {
        // For regular employees, keep their own column even if empty, and keep unassigned column if it has tasks
        result = result.filter(col => col.user_id === req.user.id || col.tasks.length > 0);
      }

      return res.json({ kanban: result });
    }

    // Default list view (filter by project)
    if (project_id) {
      // Use middleware for specific project
      return checkProjectAccess()(req, res, async () => {
        let query = `
          SELECT t.*, u.name as assigned_to_name,
                 COALESCE(
                   json_agg(
                     json_build_object('user_id', tp.user_id, 'name', part_u.name, 'username', part_u.username)
                   ) FILTER (WHERE tp.user_id IS NOT NULL), '[]'::json
                 ) as participants
          FROM tasks t
          LEFT JOIN users u ON u.id = t.assigned_to
          LEFT JOIN task_participants tp ON tp.task_id = t.id
          LEFT JOIN users part_u ON part_u.id = tp.user_id
          WHERE t.project_id = $1 AND t.status != 'passed'
          GROUP BY t.id, u.name 
          ORDER BY t.created_at DESC
        `;
        const { rows: tasks } = await pool.query(query, [project_id]);
        res.json({ tasks });
      });
    }

    // List all accessible tasks
    let query = `
      SELECT t.*, u.name as assigned_to_name,
             COALESCE(
               json_agg(
                 json_build_object('user_id', tp.user_id, 'name', part_u.name, 'username', part_u.username)
               ) FILTER (WHERE tp.user_id IS NOT NULL), '[]'::json
             ) as participants
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN task_participants tp ON tp.task_id = t.id
      LEFT JOIN users part_u ON part_u.id = tp.user_id
    `;
    const params = [];
    const whereClauses = [];

    if (view === 'history') {
      whereClauses.push(`t.status = 'passed'`);
    } else if (view === 'scheduled') {
      whereClauses.push(`t.status != 'passed' AND t.start_date > CURRENT_DATE`);
    } else {
      whereClauses.push(`t.status != 'passed' AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE)`);
    }

    if (!isPrivileged) {
      params.push(req.user.id);
      whereClauses.push(`(t.assigned_to = $${params.length} OR tp.user_id = $${params.length})`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    query += ` GROUP BY t.id, u.name ORDER BY t.created_at DESC`;
    const { rows: tasks } = await pool.query(query, params);

    res.json({ tasks });
  } catch (err) {
    console.error('Fetch tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2.5 Export Tasks Report Data (Date-filtered for PDF generation)
// GET /api/tasks/export/report
router.get('/export/report', authenticate, async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'design_head' || req.user.role === 'accounts' || req.user.department === 'accounts' || req.user.role === 'project_head';
    if (!isPrivileged) {
      return res.status(403).json({ error: 'Only authorized roles can export task reports' });
    }

    const { from_date, to_date, status } = req.query;
    let query = `
      SELECT t.*, p.name as project_name, u.name as assigned_to_name, creator.name as created_by_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users creator ON creator.id = t.created_by
    `;
    const params = [];
    const whereClauses = [];

    if (status && status !== 'all') {
      params.push(status);
      whereClauses.push(`t.status = $${params.length}`);
    }

    if (from_date) {
      params.push(from_date);
      whereClauses.push(`COALESCE(t.completed_at::date, t.start_date, t.created_at::date) >= $${params.length}::date`);
    }

    if (to_date) {
      params.push(to_date);
      whereClauses.push(`COALESCE(t.completed_at::date, t.start_date, t.created_at::date) <= $${params.length}::date`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    query += ` ORDER BY COALESCE(t.completed_at, t.start_date, t.created_at) DESC`;

    const { rows: tasks } = await pool.query(query, params);
    res.json({ tasks });
  } catch (err) {
    console.error('Export task report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Fetch Task Thread
// GET /api/tasks/:task_id
router.get('/:task_id', authenticate, checkProjectAccess({ idIsResource: 'task' }), async (req, res) => {
  try {
    const { task_id } = req.params;

    // Fetch Task
    const { rows: taskRows } = await pool.query(`
      SELECT t.*, p.name as project_name, u.name as assigned_to_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.id = $1
    `, [task_id]);

    if (!taskRows.length) return res.status(404).json({ error: 'Task not found' });

    // Fetch Participants
    const { rows: participants } = await pool.query(`
      SELECT tp.user_id, u.name, u.username, u.role
      FROM task_participants tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.task_id = $1
    `, [task_id]);

    // Fetch Messages
    const { rows: messages } = await pool.query(`
      SELECT tm.*, u.name as sender_name, u.username as sender_username, u.role as sender_role
      FROM task_messages tm
      LEFT JOIN users u ON u.id = tm.sender_id
      WHERE tm.task_id = $1
      ORDER BY tm.created_at ASC
    `, [task_id]);

    res.json({
      task: taskRows[0],
      participants,
      messages
    });
  } catch (err) {
    console.error(`Fetch task thread error [Task: ${req.params.task_id}, User: ${req.user?.id}]:`, err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Send Message
// POST /api/tasks/:task_id/messages
router.post('/:task_id/messages', authenticate, checkProjectAccess({ idIsResource: 'task' }), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { task_id } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Verify task exists
    const { rows: taskRows } = await client.query('SELECT id FROM tasks WHERE id = $1', [task_id]);
    if (!taskRows.length) return res.status(404).json({ error: 'Task not found' });

    // Parse Mentions
    const mentionedUserIds = await parseMentions(message);

    // Insert Message
    const { rows: [newMsg] } = await client.query(`
      INSERT INTO task_messages (task_id, sender_id, message, mentions, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [task_id, req.user.id, message.trim(), JSON.stringify(mentionedUserIds)]);

    // Ensure sender is a participant
    await client.query(`
      INSERT INTO task_participants (task_id, user_id, added_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (task_id, user_id) DO NOTHING
    `, [task_id, req.user.id, req.user.id]);

    // Add mentioned users to participants
    for (const userId of mentionedUserIds) {
      await client.query(`
        INSERT INTO task_participants (task_id, user_id, added_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (task_id, user_id) DO NOTHING
      `, [task_id, userId, req.user.id]);
    }

    await client.query('COMMIT');

    // Fetch full message data with sender
    const { rows: fullMsg } = await pool.query(`
      SELECT tm.*, u.name as sender_name, u.username as sender_username, u.role as sender_role, t.title as task_title
      FROM task_messages tm
      LEFT JOIN users u ON u.id = tm.sender_id
      JOIN tasks t ON t.id = tm.task_id
      WHERE tm.id = $1
    `, [newMsg.id]);

    const msgObj = fullMsg[0];

    if (msgObj) {
      // 1. Send mention notification if user was tagged (excluding sender)
      const validMentionedIds = mentionedUserIds.filter(id => id !== req.user.id);
      if (validMentionedIds.length > 0) {
        createNotification({
          recipientIds: validMentionedIds,
          senderId: req.user.id,
          section: 'tasks',
          title: '💬 Tagged in Task Chat',
          message: `${req.user.name} mentioned you in task "${msgObj.task_title}": "${msgObj.message}"`,
          entityType: 'task',
          entityId: parseInt(task_id, 10),
          actionUrl: `/tasks?taskId=${task_id}`,
        });
      }

      // 2. Send task message notification to task participants (excluding sender and mentioned users)
      const { rows: partRows } = await pool.query('SELECT user_id FROM task_participants WHERE task_id = $1', [task_id]);
      const participantIds = partRows.map(p => p.user_id).filter(id => !validMentionedIds.includes(id) && id !== req.user.id);
      if (participantIds.length > 0) {
        createNotification({
          recipientIds: participantIds,
          senderId: req.user.id,
          section: 'tasks',
          title: '💬 New Task Message',
          message: `${req.user.name} commented on task "${msgObj.task_title}"`,
          entityType: 'task',
          entityId: parseInt(task_id, 10),
          actionUrl: `/tasks?taskId=${task_id}`,
        });
      }
    }

    res.status(201).json({ message: msgObj });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// 5. Update Task Status/Stage/Details
// PATCH /api/tasks/:task_id
router.patch('/:task_id', authenticate, checkProjectAccess({ idIsResource: 'task' }), async (req, res) => {
  try {
    const { task_id } = req.params;
    const { status, stage, assigned_to, priority, due_date, title, description } = req.body;

    const { rows: [currentTask] } = await pool.query('SELECT status, assigned_to, created_by, project_id FROM tasks WHERE id = $1', [task_id]);
    if (!currentTask) return res.status(404).json({ error: 'Task not found' });

    const isPrivileged = req.user.role === 'admin' || req.user.role === 'design_head' || req.user.role === 'accounts' || req.user.department === 'accounts' || req.user.role === 'back_office' || req.user.role === 'project_head';
    const isCreator = currentTask.created_by === req.user.id;
    const canEditMetadata = isPrivileged || isCreator;

    // Check if client is trying to modify metadata fields
    const isAttemptingMetadataChange = assigned_to !== undefined || req.body.start_date !== undefined || priority !== undefined || due_date !== undefined || title !== undefined || description !== undefined;
    if (isAttemptingMetadataChange && !canEditMetadata) {
      return res.status(403).json({ error: 'Only task creator or Admin can modify task details' });
    }

    const updates = [];
    const params = [];
    let count = 1;
    let isStatusPassing = false;
    let isReassigning = false;

    if (title !== undefined) {
      if (!title?.trim()) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updates.push(`title = $${count++}`);
      params.push(title.trim());
    }

    if (description !== undefined) {
      updates.push(`description = $${count++}`);
      params.push(description ? description.trim() : null);
    }

    if (status) {
      if (!['pending', 'in_progress', 'review', 'done', 'passed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (status === 'passed' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can pass tasks' });
      }
      if ((currentTask.status === 'review' || currentTask.status === 'passed') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can change status of tasks in review or passed state' });
      }
      updates.push(`status = $${count++}`);
      params.push(status);

      if (status === 'passed') {
        isStatusPassing = true;
      } else if (status === 'in_progress' && (currentTask.status === 'review' || currentTask.status === 'passed')) {
        isReassigning = true;
      }
    }

    if (stage) {
      updates.push(`stage = $${count++}`);
      params.push(stage);
    }

    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${count++}`);
      const newAssignee = assigned_to ? parseInt(assigned_to, 10) : null;
      params.push(newAssignee);
      
      // If assignment changes, it counts as reassignment
      if (newAssignee !== currentTask.assigned_to) {
        isReassigning = true;
      }
    }

    if (req.body.start_date !== undefined) {
      updates.push(`start_date = $${count++}`);
      params.push(req.body.start_date || null);
    }

    if (priority) {
      if (!['low', 'medium', 'high'].includes(priority)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }
      updates.push(`priority = $${count++}`);
      params.push(priority);
    }

    if (due_date !== undefined) {
      updates.push(`due_date = $${count++}`);
      params.push(due_date || null);
    }

    if (isStatusPassing) {
      updates.push(`completed_at = NOW()`);
      updates.push(`reassigned_at = NULL`);
    } else if (isReassigning) {
      updates.push(`reassigned_at = NOW()`);
      updates.push(`completed_at = NULL`);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(task_id);

    const query = `
      UPDATE tasks 
      SET ${updates.join(', ')} 
      WHERE id = $${count}
      RETURNING *
    `;

    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });

    // Ensure the new assignee is added as a participant
    if (assigned_to) {
      await pool.query(`
        INSERT INTO task_participants (task_id, user_id, added_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (task_id, user_id) DO NOTHING
      `, [task_id, parseInt(assigned_to, 10), req.user.id]);
    }

    const updatedTask = rows[0];

    // Trigger notification to task creator & assignee on status/assignment change
    if (updatedTask) {
      const { rows: partRows } = await pool.query('SELECT user_id FROM task_participants WHERE task_id = $1', [task_id]);
      const rawRecipients = partRows.map(p => p.user_id);
      if (updatedTask.assigned_to) rawRecipients.push(updatedTask.assigned_to);
      if (updatedTask.created_by) rawRecipients.push(updatedTask.created_by);

      const recipientIds = [...new Set(rawRecipients)].filter(id => id !== req.user.id);
      if (recipientIds.length > 0) {
        createNotification({
          recipientIds,
          senderId: req.user.id,
          section: 'tasks',
          title: status ? `📌 Task Status: ${status.toUpperCase()}` : '📌 Task Updated',
          message: `${req.user.name} updated task "${updatedTask.title}"${status ? ` (Status: ${status})` : ''}`,
          entityType: 'task',
          entityId: updatedTask.id,
          actionUrl: `/tasks?taskId=${updatedTask.id}`,
        });
      }
    }

    res.json({ task: updatedTask });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5.5 Delete Task
// DELETE /api/tasks/:task_id
router.delete('/:task_id', authenticate, checkProjectAccess({ idIsResource: 'task' }), async (req, res) => {
  try {
    const { task_id } = req.params;
    const { rows } = await pool.query('SELECT created_by FROM tasks WHERE id = $1', [task_id]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });

    const isCreator = rows[0].created_by === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Only task creator or Admin can delete this task' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [task_id]);
    deleteEntityNotifications('task', task_id);
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 6. Cleanup old passed tasks (90 days based on completion date)
async function cleanupOldTasks() {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM tasks 
      WHERE status = 'passed' 
      AND COALESCE(completed_at, updated_at) < NOW() - INTERVAL '90 days'
    `);
    if (rowCount > 0) {
      console.log(`🧹 Cleaned up ${rowCount} old passed tasks.`);
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

module.exports = { router, cleanupOldTasks };
