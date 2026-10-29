const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const { checkPeriodLock } = require('../middleware/periodLock');
const { getISTDate } = require('../utils/date');
const { createNotification, getAdminAndAccountsUserIds } = require('../utils/notifier');

// GET /api/invoices - List all invoices
router.get('/', authenticate, requireAccounting, async (req, res) => {
  try {
    const { project_id, client_id, start_date, end_date, page, limit } = req.query;

    // 1. Fetch actual invoices matching filters
    let query = `
      SELECT i.*, p.name as project_name, 
             c.name as client_name_full, 
             c.company_name as client_company_full,
             c.address as bill_to_address,
             c.gst_number as bill_to_gst,
             c.phone as bill_to_phone,
             c.email as bill_to_email
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN clients c ON c.id = i.client_id
    `;
    const params = [];
    let idx = 1;

    const conditions = [];
    if (project_id) {
      conditions.push(`i.project_id = $${idx++}`);
      params.push(project_id);
    }
    if (client_id) {
      conditions.push(`i.client_id = $${idx++}`);
      params.push(client_id);
    }
    if (start_date) {
      conditions.push(`i.date >= $${idx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`i.date <= $${idx++}`);
      params.push(end_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY i.date DESC, i.created_at DESC`;
    const { rows: invoiceRows } = await pool.query(query, params);

    const formattedInvoices = invoiceRows.map(inv => {
      const isPaid = (inv.status || '').toLowerCase() === 'paid';
      const isCancelled = (inv.status || '').toLowerCase() === 'cancelled';
      const amt = parseFloat(inv.amount || 0);
      const received = parseFloat(inv.received_amount || 0);
      const tds = parseFloat(inv.tax_details?.tdsAmount || 0);
      const gstRate = parseFloat(inv.tax_details?.gstRate || inv.tax_details?.gst_rate || 0);
      const gstAmount = parseFloat(inv.tax_details?.gstAmount || inv.tax_details?.gst_amount || 0);
      const subtotal = parseFloat(inv.tax_details?.subtotal || (amt - gstAmount));
      const taxBreakdown = {
        subtotal: isNaN(subtotal) ? amt : Math.round(subtotal * 100) / 100,
        gst_rate: isNaN(gstRate) ? 0 : gstRate,
        gst_amount: isNaN(gstAmount) ? 0 : Math.round(gstAmount * 100) / 100,
        tds_amount: isNaN(tds) ? 0 : Math.round(tds * 100) / 100,
        total: Math.round(amt * 100) / 100
      };
      return {
        ...inv,
        received_amount: received,
        pending_amount: isCancelled ? 0 : Math.max(0, amt - received - tds),
        tax_breakdown: taxBreakdown,
        is_payment_stage: false
      };
    });

    // 2. Fetch active payment stages matching filters ONLY if project_id is provided
    // This prevents pending payment stages from polluting the global Invoice History and double-counting totals
    let virtualInvoices = [];
    if (project_id) {
      let stagesQuery = `
        SELECT pps.*, p.name as project_name, c.name as client_name_full, c.id as client_id
        FROM project_payment_stages pps
        JOIN projects p ON p.id = pps.project_id
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE LOWER(pps.status) IN ('payment initiated', 'bill generated', 'bill delivered')
          AND pps.project_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM invoices i 
            WHERE (i.payment_stage_id = pps.id
                   OR EXISTS (
                     SELECT 1 FROM invoice_payment_stages ips
                     WHERE ips.invoice_id = i.id AND ips.payment_stage_id = pps.id
                   ))
              AND i.status != 'cancelled'
          )
      `;
      const stagesParams = [project_id];
      let sIdx = 2;
      
      if (client_id) {
        stagesQuery += ` AND p.client_id = $${sIdx++}`;
        stagesParams.push(client_id);
      }
      if (start_date) {
        stagesQuery += ` AND pps.created_at >= $${sIdx++}`;
        stagesParams.push(start_date);
      }
      if (end_date) {
        stagesQuery += ` AND pps.created_at <= $${sIdx++}`;
        stagesParams.push(end_date);
      }

      stagesQuery += ` ORDER BY pps.created_at DESC`;
      const { rows: stageRows } = await pool.query(stagesQuery, stagesParams);

      virtualInvoices = stageRows.map(stage => {
        const lowerStatus = (stage.status || '').toLowerCase();
        let mappedStatus = 'draft';
        const amt = parseFloat(stage.amount || 0);
        let receivedAmount = 0;
        let pendingAmount = 0;

        if (lowerStatus === 'paid') {
          mappedStatus = 'paid';
          receivedAmount = amt;
        } else if (lowerStatus === 'bill generated' || lowerStatus === 'bill delivered') {
          mappedStatus = 'generated';
          pendingAmount = amt;
        }
        return {
          id: `stage-${stage.id}`,
          invoice_no: `${stage.document_type} (Stage)`,
          project_id: stage.project_id,
          client_id: stage.client_id,
          client_name: stage.client_name_full,
          client_name_full: stage.client_name_full,
          project_name: stage.project_name,
          amount: stage.amount,
          date: stage.created_at,
          status: mappedStatus,
          is_payment_stage: true,
          stage_status: stage.status,
          received_amount: receivedAmount,
          pending_amount: pendingAmount
        };
      });
    }

    // 3. Merge, sort, and slice
    const allInvoices = [...formattedInvoices, ...virtualInvoices];
    allInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));

    let paginatedInvoices = allInvoices;
    if (limit) {
      const pageInt = parseInt(page) || 1;
      const limitInt = parseInt(limit);
      const offset = (pageInt - 1) * limitInt;
      paginatedInvoices = allInvoices.slice(offset, offset + limitInt);
    }

    res.json({ 
      invoices: paginatedInvoices, 
      page: page ? parseInt(page) : 1, 
      limit: limit ? parseInt(limit) : allInvoices.length, 
      totalCount: allInvoices.length 
    });
  } catch (err) {
    console.error('Get invoices error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/invoices/latest/number
router.get('/latest/number', authenticate, requireAccounting, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT invoice_no 
      FROM invoices 
      WHERE invoice_no LIKE 'W4Y\\\\%' OR invoice_no LIKE 'W4Y-%' OR invoice_no LIKE 'DS16\\\\%' OR invoice_no LIKE 'DS16-%'
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const fullYear = today.getFullYear();
    let startYear, endYear;
    if (month >= 4) {
      startYear = fullYear;
      endYear = fullYear + 1;
    } else {
      startYear = fullYear - 1;
      endYear = fullYear;
    }
    const fyStr = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`; // e.g. "25-26"
    
    let nextNum = 1;
    
    if (rows.length > 0) {
      const lastNo = rows[0].invoice_no;
      let lastFY = '';
      let lastCount = 0;
      
      if (lastNo.includes('\\')) {
        const parts = lastNo.split('\\');
        if (parts.length === 3) {
          lastFY = parts[1];
          lastCount = parseInt(parts[2]);
        }
      } else if (lastNo.includes('-')) {
        const parts = lastNo.split('-');
        if (parts.length === 3) {
          lastFY = parts[1];
          lastCount = parseInt(parts[2]);
        }
      }
      
      if (lastCount > 0 && (lastFY === fyStr || lastFY === String(fullYear))) {
        nextNum = lastCount + 1;
      }
    }
    
    const paddedCount = String(nextNum).padStart(3, '0');
    res.json({ nextNo: `W4Y\\${fyStr}\\${paddedCount}` });
  } catch (err) {
    console.error('Get latest invoice number error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/invoices/:id - Get specific invoice details
router.get('/:id', authenticate, requireAccounting, checkProjectAccess({ idIsResource: 'invoice' }), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, p.name as project_name, 
              c.name as client_name_full, 
              c.company_name as client_company_full,
              c.address as bill_to_address,
              c.gst_number as bill_to_gst,
              c.phone as bill_to_phone,
              c.email as bill_to_email
       FROM invoices i
       LEFT JOIN projects p ON p.id = i.project_id
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const inv = rows[0];
    const amt = parseFloat(inv.amount || 0);
    const gstRate = parseFloat(inv.tax_details?.gstRate || inv.tax_details?.gst_rate || 0);
    const gstAmount = parseFloat(inv.tax_details?.gstAmount || inv.tax_details?.gst_amount || 0);
    const subtotal = parseFloat(inv.tax_details?.subtotal || (amt - gstAmount));
    const tds = parseFloat(inv.tax_details?.tdsAmount || 0);
    inv.tax_breakdown = {
      subtotal: isNaN(subtotal) ? amt : Math.round(subtotal * 100) / 100,
      gst_rate: isNaN(gstRate) ? 0 : gstRate,
      gst_amount: isNaN(gstAmount) ? 0 : Math.round(gstAmount * 100) / 100,
      tds_amount: isNaN(tds) ? 0 : Math.round(tds * 100) / 100,
      total: Math.round(amt * 100) / 100
    };

    res.json({ invoice: inv });
  } catch (err) {
    console.error('Get invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/invoices - Strictly CREATE a new invoice (no silent overwrites)
// Returns 409 Conflict if the invoice_no already exists
router.post('/', authenticate, requireAccounting, checkPeriodLock, async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      invoice_no, 
      project_id, 
      client_id, 
      client_name, 
      client_company, 
      amount, 
      date, 
      items, 
      tax_details, 
      status,
      due_date,
      signature_data,
      payment_stage_id,
      payment_stage_ids = [],
      received_amount
    } = req.body;

    if (!invoice_no || !client_name || !amount || !items) {
      return res.status(400).json({ error: 'Missing required fields: invoice_no, client_name, amount, items' });
    }

    // Validate amount is a positive number
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Validate status if provided
    const validStatuses = ['draft', 'generated', 'sent', 'paid', 'cancelled'];
    const resolvedStatus = status || 'generated';
    if (!validStatuses.includes(resolvedStatus)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Calculate received_amount
    const tdsAmount = parseFloat(tax_details?.tdsAmount || 0);
    let parsedReceivedAmount = 0;
    if (resolvedStatus === 'paid') {
      parsedReceivedAmount = Math.max(0, parsedAmount - tdsAmount);
    } else if (received_amount !== undefined && received_amount !== null) {
      parsedReceivedAmount = parseFloat(received_amount);
      if (isNaN(parsedReceivedAmount) || parsedReceivedAmount < 0) {
        parsedReceivedAmount = 0;
      }
    }

    // Begin atomic transaction
    await client.query('BEGIN');

    const firstPaymentStageId = (payment_stage_ids && payment_stage_ids.length > 0)
      ? payment_stage_ids[0]
      : (payment_stage_id || null);

    // Strict INSERT — will throw a unique_violation (code 23505) if invoice_no already exists
    const query = `
      INSERT INTO invoices (
        invoice_no, project_id, client_id, client_name, client_company, amount, 
        date, items, tax_details, status, due_date, signature_data, payment_stage_id, created_by, received_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `;

    const { rows } = await client.query(query, [
      invoice_no, 
      project_id || null, 
      client_id || null, 
      client_name, 
      client_company || null, 
      parsedAmount, 
      // E3: use IST date string when no date provided (avoids UTC day-shift on VPS)
      date || getISTDate(), 
      JSON.stringify(items), 
      JSON.stringify(tax_details || {}), 
      resolvedStatus,
      due_date || null,
      signature_data || null,
      firstPaymentStageId,
      req.user.id,
      parsedReceivedAmount
    ]);

    // Record income transaction in ledger if explicitly paid on creation
    if (resolvedStatus === 'paid' && project_id) {
      await client.query(
        `INSERT INTO transactions 
          (type, category, amount, description, project_id, reference_id, date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'income',
          'project_receipt',
          Math.max(0, parsedAmount - tdsAmount),
          `Invoice ${invoice_no} - ${client_name}`,
          project_id,
          invoice_no,
          date || new Date(),
          req.user.id
        ]
      );
    }

    let finalPaymentStageId = firstPaymentStageId;

    // Real-time Auto-healing: If payment_stage_id was not explicitly passed, try to auto-link
    if (!finalPaymentStageId && !(payment_stage_ids && payment_stage_ids.length > 0) && project_id) {
      const healQuery = `
        UPDATE invoices i
        SET payment_stage_id = pps.id
        FROM project_payment_stages pps
        WHERE i.id = $1
          AND i.payment_stage_id IS NULL
          AND i.project_id = pps.project_id
          AND ABS(i.amount - pps.amount) < 0.01
          AND (
            pps.document_type IS NULL 
            OR i.items::text ILIKE '%' || pps.document_type || '%'
            OR i.invoice_no ILIKE '%' || pps.document_type || '%'
          )
        RETURNING pps.id;
      `;
      const healRes = await client.query(healQuery, [rows[0].id]);
      if (healRes.rows.length > 0) {
        finalPaymentStageId = healRes.rows[0].id;
        rows[0].payment_stage_id = finalPaymentStageId;
      }
    }

    const finalPaymentStageIds = (payment_stage_ids && payment_stage_ids.length > 0)
      ? payment_stage_ids
      : (finalPaymentStageId ? [finalPaymentStageId] : []);

    // Save all to junction table and update status of each
    if (finalPaymentStageIds.length > 0) {
      for (const sid of finalPaymentStageIds) {
        await client.query(
          `INSERT INTO invoice_payment_stages (invoice_id, payment_stage_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [rows[0].id, sid]
        );
        
        const targetStageStatus = resolvedStatus === 'paid' ? 'paid' : 'bill generated';
        await client.query(
          `UPDATE project_payment_stages 
           SET status = $1, updated_at = NOW() 
           WHERE id = $2`,
          [targetStageStatus, sid]
        );
      }
    }

    await client.query('COMMIT');

    const createdInvoice = rows[0];

    // Trigger notification to Accounts & Admin team
    (async () => {
      const adminAccountsIds = await getAdminAndAccountsUserIds();
      createNotification({
        recipientIds: adminAccountsIds,
        senderId: req.user.id,
        section: 'invoices',
        title: `🧾 Invoice #${createdInvoice.invoice_no} Generated`,
        message: `${req.user.name} created invoice #${createdInvoice.invoice_no} for ${createdInvoice.client_name} (₹${parseFloat(createdInvoice.amount).toLocaleString('en-IN')})`,
        entityType: 'invoice',
        entityId: createdInvoice.id,
        actionUrl: `/admin/invoice`,
      });
    })();

    res.status(201).json({ invoice: createdInvoice });
  } catch (err) {
    await client.query('ROLLBACK');
    // PostgreSQL unique_violation error code
    if (err.code === '23505') {
      return res.status(409).json({ 
        error: 'Invoice number already exists', 
        code: 'DUPLICATE_INVOICE_NO',
        message: `An invoice with number "${req.body.invoice_no}" already exists. Please use a different invoice number.`
      });
    }
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/invoices/:id/status - Update invoice status and/or signature only
router.patch('/:id/status', authenticate, requireAccounting, checkPeriodLock, async (req, res) => {
  const client = await pool.connect();
  try {
    const { status, signature_data } = req.body;
    const { id } = req.params;

    const validStatuses = ['draft', 'generated', 'sent', 'paid', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Build update fields dynamically
    const updates = [];
    const params = [];
    let idx = 1;

    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
      if (status === 'paid') {
        updates.push(`received_amount = amount - COALESCE((tax_details->>'tdsAmount')::numeric, 0)`);
      }
    }
    if (signature_data !== undefined) {
      updates.push(`signature_data = $${idx++}`);
      params.push(signature_data);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await client.query('BEGIN');

    params.push(id);
    const query = `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await client.query(query, params);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = rows[0];

    let finalPaymentStageId = invoice.payment_stage_id || null;

    // Real-time Auto-healing: If payment_stage_id is NULL, try to auto-link
    if (!finalPaymentStageId && invoice.project_id) {
      const healQuery = `
        UPDATE invoices i
        SET payment_stage_id = pps.id
        FROM project_payment_stages pps
        WHERE i.id = $1
          AND i.payment_stage_id IS NULL
          AND i.project_id = pps.project_id
          AND ABS(i.amount - pps.amount) < 0.01
          AND (
            pps.document_type IS NULL 
            OR i.items::text ILIKE '%' || pps.document_type || '%'
            OR i.invoice_no ILIKE '%' || pps.document_type || '%'
          )
        RETURNING pps.id;
      `;
      const healRes = await client.query(healQuery, [invoice.id]);
      if (healRes.rows.length > 0) {
        finalPaymentStageId = healRes.rows[0].id;
        invoice.payment_stage_id = finalPaymentStageId;
      }
    }

    // Automate payment stage status transitions based on new invoice status
    if (finalPaymentStageId) {
      if (status === 'cancelled') {
        // Only revert to 'payment initiated' if no other active invoices are linked
        const { rows: otherInvoices } = await client.query(
          'SELECT id FROM invoices WHERE payment_stage_id = $1 AND id != $2 AND status != \'cancelled\'',
          [finalPaymentStageId, invoice.id]
        );
        if (otherInvoices.length === 0) {
          await client.query(
            `UPDATE project_payment_stages 
             SET status = 'payment initiated', updated_at = NOW() 
             WHERE id = $1`,
            [finalPaymentStageId]
          );
        }
      } else if (status === 'paid') {
        await client.query(
          `UPDATE project_payment_stages 
           SET status = 'paid', updated_at = NOW() 
           WHERE id = $1`,
          [finalPaymentStageId]
        );
      } else if (status === 'generated' || status === 'sent') {
        await client.query(
          `UPDATE project_payment_stages 
           SET status = 'bill generated', updated_at = NOW() 
           WHERE id = $1`,
          [finalPaymentStageId]
        );
      }
    }

    // Also automate status transitions for all junction-linked stages
    if (status) {
      if (status === 'cancelled') {
        const { rows: junctionRows } = await client.query(
          'SELECT payment_stage_id FROM invoice_payment_stages WHERE invoice_id = $1',
          [invoice.id]
        );
        for (const { payment_stage_id: sid } of junctionRows) {
          const { rows: others } = await client.query(
            `SELECT 1 FROM invoice_payment_stages ips
             JOIN invoices i ON i.id = ips.invoice_id
             WHERE ips.payment_stage_id = $1
               AND ips.invoice_id != $2
               AND i.status != 'cancelled'`,
            [sid, invoice.id]
          );
          const { rows: othersSingle } = await client.query(
            `SELECT 1 FROM invoices i
             WHERE i.payment_stage_id = $1
               AND i.id != $2
               AND i.status != 'cancelled'`,
            [sid, invoice.id]
          );
          if (others.length === 0 && othersSingle.length === 0) {
            await client.query(
              `UPDATE project_payment_stages 
               SET status = 'payment initiated', updated_at = NOW() 
               WHERE id = $1`,
              [sid]
            );
          }
        }
      } else {
        const targetStageStatus = status === 'paid' ? 'paid' : 'bill generated';
        await client.query(
          `UPDATE project_payment_stages pps
           SET status = $1, updated_at = NOW()
           FROM invoice_payment_stages ips
           WHERE ips.invoice_id = $2 AND ips.payment_stage_id = pps.id`,
          [targetStageStatus, invoice.id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ invoice });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update invoice status error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/invoices/:id/mark-paid — Atomic: records finance transaction + marks invoice paid
// Wrapped in a single DB transaction. If either step fails, both are rolled back.
router.post('/:id/mark-paid', authenticate, requireAccounting, checkPeriodLock, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // 1. Fetch invoice to get project/amount details
    const { rows: invoiceRows } = await client.query(
      'SELECT * FROM invoices WHERE id = $1',
      [id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already marked as paid' });
    }

    if (!invoice.project_id) {
      return res.status(400).json({ error: 'Invoice has no linked project. Cannot record income.' });
    }

    const amount = parseFloat(invoice.amount || 0);
    const received = parseFloat(invoice.received_amount || 0);
    const tds = parseFloat(invoice.tax_details?.tdsAmount || 0);
    const remainingAmount = Math.max(0, amount - received - tds);

    if (remainingAmount <= 0) {
      return res.status(400).json({ error: 'Invoice has no remaining balance to pay.' });
    }

    // Begin atomic transaction
    await client.query('BEGIN');

    // Step 1: Insert finance transaction (table: transactions, matches finances.js schema)
    await client.query(
      `INSERT INTO transactions 
        (type, category, amount, description, project_id, reference_id, date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'income',
        'project_receipt',
        remainingAmount,
        `Invoice ${invoice.invoice_no} - ${invoice.client_name} (Balance Payment)`,
        invoice.project_id,
        invoice.invoice_no,
        new Date(),
        req.user.id
      ]
    );

    // Step 2: Mark invoice as paid and set received_amount to full amount - tds
    const { rows: updatedRows } = await client.query(
      `UPDATE invoices SET status = 'paid', received_amount = amount - COALESCE((tax_details->>'tdsAmount')::numeric, 0) WHERE id = $1 RETURNING *`,
      [id]
    );

    // If the invoice is linked to a payment stage, mark the stage as 'paid'
    if (invoice.payment_stage_id) {
      await client.query(
        `UPDATE project_payment_stages 
         SET status = 'paid', updated_at = NOW() 
         WHERE id = $1`,
         [invoice.payment_stage_id]
      );
    }

    // Mark all junction-linked stages as paid
    await client.query(
      `UPDATE project_payment_stages pps
       SET status = 'paid', updated_at = NOW()
       FROM invoice_payment_stages ips
       WHERE ips.invoice_id = $1 AND ips.payment_stage_id = pps.id`,
      [id]
    );

    // Commit only if both steps succeeded
    await client.query('COMMIT');

    res.json({ 
      invoice: updatedRows[0],
      message: 'Invoice marked as paid and balance recorded successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Mark paid atomic transaction error:', err);
    res.status(500).json({ error: 'Failed to process payment. All changes have been rolled back.' });
  } finally {
    client.release();
  }
});

// POST /api/invoices/:id/record-payment — Atomic: records custom partial payment
router.post('/:id/record-payment', authenticate, requireAccounting, checkPeriodLock, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { amount } = req.body;

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be a positive number' });
    }

    // 1. Fetch invoice details
    const { rows: invoiceRows } = await client.query(
      'SELECT * FROM invoices WHERE id = $1',
      [id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already fully paid' });
    }

    // E4: Same guard as mark-paid — partial payments also insert into transactions which require project_id
    if (!invoice.project_id) {
      return res.status(400).json({ error: 'Invoice has no linked project. Cannot record income.' });
    }

    const totalAmount = parseFloat(invoice.amount || 0);
    const alreadyReceived = parseFloat(invoice.received_amount || 0);
    const tds = parseFloat(invoice.tax_details?.tdsAmount || 0);
    const remainingBalance = Math.max(0, totalAmount - alreadyReceived - tds);

    if (paymentAmount > remainingBalance + 0.01) {
      return res.status(400).json({ 
        error: `Payment amount (₹${paymentAmount.toLocaleString('en-IN')}) exceeds the remaining balance of ₹${remainingBalance.toLocaleString('en-IN')}` 
      });
    }

    // Begin atomic transaction
    await client.query('BEGIN');

    // Step 1: Insert custom receipt transaction into ledger
    await client.query(
      `INSERT INTO transactions 
        (type, category, amount, description, project_id, reference_id, date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'income',
        'project_receipt',
        paymentAmount,
        `Invoice ${invoice.invoice_no} - ${invoice.client_name} (Partial Payment)`,
        invoice.project_id,
        invoice.invoice_no,
        new Date(),
        req.user.id
      ]
    );

    // Step 2: Update received amount on invoice
    const newReceived = alreadyReceived + paymentAmount;
    const isFullyPaid = Math.abs(totalAmount - (newReceived + tds)) < 0.01 || (newReceived + tds) >= totalAmount;
    const newStatus = isFullyPaid ? 'paid' : invoice.status;
    const finalReceived = isFullyPaid ? (totalAmount - tds) : newReceived;

    const { rows: updatedRows } = await client.query(
      `UPDATE invoices SET status = $1, received_amount = $2 WHERE id = $3 RETURNING *`,
      [newStatus, finalReceived, id]
    );

    // Step 3: Transition milestones/payment stages to 'paid' if fully paid
    if (isFullyPaid) {
      if (invoice.payment_stage_id) {
        await client.query(
          `UPDATE project_payment_stages 
           SET status = 'paid', updated_at = NOW() 
           WHERE id = $1`,
           [invoice.payment_stage_id]
        );
      }

      await client.query(
        `UPDATE project_payment_stages pps
         SET status = 'paid', updated_at = NOW()
         FROM invoice_payment_stages ips
         WHERE ips.invoice_id = $1 AND ips.payment_stage_id = pps.id`,
        [id]
      );
    }

    await client.query('COMMIT');

    res.json({ 
      invoice: updatedRows[0],
      message: isFullyPaid 
        ? 'Payment recorded successfully! Invoice is now fully paid.' 
        : `Partial payment of ₹${paymentAmount.toLocaleString('en-IN')} recorded successfully.`,
      remainingBalance: isFullyPaid ? 0 : Math.max(0, totalAmount - finalReceived)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Record payment transaction error:', err);
    res.status(500).json({ error: 'Failed to record payment. All changes rolled back.' });
  } finally {
    client.release();
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', authenticate, requireAdmin, checkPeriodLock, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the invoice to see if it's linked to a payment stage
    const { rows: invoiceRows } = await client.query(
      'SELECT payment_stage_id, invoice_no, project_id FROM invoices WHERE id = $1',
      [req.params.id]
    );

    if (invoiceRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { payment_stage_id, invoice_no, project_id } = invoiceRows[0];

    // Fetch junction stages before deleting the invoice
    const { rows: junctionRows } = await client.query(
      'SELECT payment_stage_id FROM invoice_payment_stages WHERE invoice_id = $1',
      [req.params.id]
    );

    // Delete associated ledger transaction entries from transactions
    if (invoice_no) {
      await client.query(
        'DELETE FROM transactions WHERE reference_id = $1',
        [invoice_no]
      );
    }

    // 2. Delete the invoice (will cascade delete junction rows)
    await client.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);

    // 3. Revert payment stage status to 'payment initiated' if linked and no other active invoices exist
    if (payment_stage_id) {
      const { rows: otherInvoices } = await client.query(
        'SELECT id FROM invoices WHERE payment_stage_id = $1 AND id != $2 AND status != \'cancelled\'',
        [payment_stage_id, req.params.id]
      );
      if (otherInvoices.length === 0) {
        await client.query(
          `UPDATE project_payment_stages 
           SET status = 'payment initiated', updated_at = NOW() 
           WHERE id = $1`,
          [payment_stage_id]
        );
      }
    }

    // 4. Revert all junction-linked stages if no other active invoices exist
    for (const { payment_stage_id: sid } of junctionRows) {
      const { rows: others } = await client.query(
        `SELECT 1 FROM invoice_payment_stages ips
         JOIN invoices i ON i.id = ips.invoice_id
         WHERE ips.payment_stage_id = $1
           AND ips.invoice_id != $2
           AND i.status != 'cancelled'`,
        [sid, req.params.id]
      );
      const { rows: othersSingle } = await client.query(
        `SELECT 1 FROM invoices i
         WHERE i.payment_stage_id = $1
           AND i.id != $2
           AND i.status != 'cancelled'`,
        [sid, req.params.id]
      );
      if (others.length === 0 && othersSingle.length === 0) {
        await client.query(
          `UPDATE project_payment_stages 
           SET status = 'payment initiated', updated_at = NOW() 
           WHERE id = $1`,
          [sid]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
