// server/routes/documents.js
// Document upload and management — supports multi-format, multi-file uploads

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAccounting, canViewFinancials } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const {
  DOCUMENT_TAGS,
  ALLOWED_EXTENSIONS_FLAT,
  BLOCKED_EXTENSIONS,
  FILE_SIZE_LIMITS,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  GENERIC_MIME_TYPES,
  getExtensionCategory,
  getDocumentTypeSlug,
} = require('../utils/constants');

// ---------------------------------------------------------------------------
// Filename sanitizer — strips path traversal, spaces → hyphens, lowercase ext
// ---------------------------------------------------------------------------
function sanitizeFilename(originalname) {
  // Remove any directory traversal characters
  let name = originalname
    .replace(/\.\.[/\\]/g, '')   // ../
    .replace(/[/\\:*?"<>|]/g, '') // filesystem-unsafe chars
    .replace(/\s+/g, '-')         // spaces to hyphens
    .trim();

  // Ensure extension is lowercase
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name));
  return base + ext;
}

// ---------------------------------------------------------------------------
// Multer storage — new uploads land in uploads/projects/{pid}/{typeSlug}/
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // project_id may be in query (GET-style) or body (POST multipart)
    const project_id = req.query.project_id || req.body.project_id;
    const pid = parseInt(project_id);
    if (isNaN(pid)) {
      return cb(new Error('Invalid project_id — cannot determine upload directory'));
    }

    // document_type comes through body; may not be parsed yet on first call
    // multer parses fields in field order, so document_type could be undefined here.
    // We use req.body.document_type if available, else fall back to 'others'
    const docType = req.body.document_type || null;
    const slug = getDocumentTypeSlug(docType);

    const dir = path.join(__dirname, '..', 'uploads', 'projects', String(pid), slug);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    } catch (err) {
      console.error('[Multer] Directory creation error:', err);
      cb(err);
    }
  },

  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString('hex'); // 8 hex chars
    const safeName = sanitizeFilename(file.originalname);
    cb(null, `${timestamp}-${randomHex}-${safeName}`);
  },
});

// ---------------------------------------------------------------------------
// Multer fileFilter — dual validation: blocked-list → extension whitelist → MIME
// ---------------------------------------------------------------------------
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  // 1. Hard block dangerous extensions regardless of MIME
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`Blocked file type: ${ext} files are not permitted`), false);
  }

  // 2. Extension must be in the whitelist
  if (!ALLOWED_EXTENSIONS_FLAT.includes(ext)) {
    return cb(new Error(`Unsupported file type: ${ext} — please upload an allowed format`), false);
  }

  // 3. MIME type check
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return cb(new Error(`Invalid MIME type (${mime}) for file: ${file.originalname}`), false);
  }

  // 4. Generic MIME (octet-stream, binary) is only accepted for CAD / archive extensions
  if (GENERIC_MIME_TYPES.has(mime)) {
    const category = getExtensionCategory(ext);
    if (category !== 'cad' && category !== 'archive' && category !== 'future') {
      return cb(new Error(
        `File ${file.originalname} reported as binary but extension ${ext} is not a recognized CAD or archive format`
      ), false);
    }
  }

  cb(null, true);
}

// ---------------------------------------------------------------------------
// Multer instance — 200 MB hard cap, up to 20 files per request
// ---------------------------------------------------------------------------
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

// ---------------------------------------------------------------------------
// POST /api/documents/upload
// Accepts multiple files (up to 20) in field "files"
// ---------------------------------------------------------------------------
router.post('/upload', authenticate, checkProjectAccess(), (req, res, next) => {
  upload.fields([{ name: 'files', maxCount: 20 }, { name: 'file', maxCount: 20 }])(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `File too large — maximum allowed size is 200 MB per file`,
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Maximum 20 files per upload' });
      }
      console.error('[Upload] Multer error:', err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error('[Upload] Validation error:', err.message);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const client = await pool.connect();
  let inTxn = false;
  try {
    const project_id = req.query.project_id || req.body.project_id;
    const { remark, category = 'document', document_type } = req.body;
    const files = req.files ? [...(req.files.files || []), ...(req.files.file || [])] : [];

    // Validate project_id
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    // Validate document_type against known tags
    if (document_type && !DOCUMENT_TAGS.includes(document_type)) {
      return res.status(400).json({ error: 'Invalid document_type' });
    }

    // Must have at least one file
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    // ---------------------------------------------------------------------------
    // Per-category size validation — finer-grained than multer's global cap
    // ---------------------------------------------------------------------------
    const sizeErrors = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const fileCategory = getExtensionCategory(ext);
      const limit = FILE_SIZE_LIMITS[fileCategory] || FILE_SIZE_LIMITS.default;
      if (file.size > limit) {
        const limitMB = Math.round(limit / (1024 * 1024));
        sizeErrors.push(
          `"${file.originalname}" exceeds the ${limitMB} MB limit for ${fileCategory} files`
        );
        // Clean up oversized file from disk
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
    }
    if (sizeErrors.length > 0) {
      // Clean up any already-written files for this batch
      for (const file of files) {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_) {}
      }
      return res.status(413).json({ error: sizeErrors.join('; ') });
    }

    // ---------------------------------------------------------------------------
    // Determine storage slug for consistent path building
    // ---------------------------------------------------------------------------
    const typeSlug = getDocumentTypeSlug(document_type);

    await client.query('BEGIN');
    inTxn = true;

    const insertedDocs = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      // Build relative path using forward slashes (OS-agnostic, safe for DB storage)
      const relativePath = [
        'uploads', 'projects', String(pid), typeSlug, file.filename
      ].join('/');

      const { rows: docRows } = await client.query(
        `INSERT INTO documents
           (project_id, uploaded_by, file_name, file_path, file_type, file_size,
            remark, category, document_type, original_name, stored_name, extension, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         RETURNING *`,
        [
          pid,
          req.user.id,
          file.originalname,          // file_name — display name (original)
          relativePath,               // file_path — relative path on disk
          file.mimetype,              // file_type
          file.size,                  // file_size
          remark || null,             // remark
          category,                   // category
          document_type || null,      // document_type
          file.originalname,          // original_name — explicit original filename
          file.filename,              // stored_name — collision-safe disk filename
          ext,                        // extension — for fast filtering/search
        ]
      );
      insertedDocs.push(docRows[0]);
    }

    // Insert comment if remark provided (once per upload batch, not per file)
    if (remark && remark.trim()) {
      const fileList = files.map(f => `**${f.originalname}**`).join(', ');
      const typeLabel = category === 'photo' ? '📸 Site photograph' : '📎 File';
      await client.query(
        `INSERT INTO comments (project_id, user_id, message, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [pid, req.user.id, `${typeLabel}: ${fileList}\n\n${remark.trim()}`]
      );
    }

    await client.query('COMMIT');
    inTxn = false;
    res.status(201).json({ documents: insertedDocs });
  } catch (err) {
    if (inTxn) { try { await client.query('ROLLBACK'); } catch (_) {} }
    // Clean up any uploaded files on transaction failure
    if (req.files) {
      for (const file of req.files) {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_) {}
      }
    }
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Server error during upload' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents?project_id=X
// ---------------------------------------------------------------------------
router.get('/', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id, category, grouped } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    let query = `
      SELECT
        d.id, d.project_id, d.uploaded_by, d.file_name, d.file_path,
        d.file_type, d.file_size, d.remark, d.category, d.document_type,
        d.original_name, d.stored_name, d.extension, d.created_at,
        u.name AS uploaded_by_name
      FROM documents d
      JOIN users u ON u.id = d.uploaded_by
      WHERE d.project_id = $1`;
    const params = [pid];

    if (category) {
      query += ` AND d.category = $2`;
      params.push(category);
    }

    query += ` ORDER BY d.created_at DESC`;
    const { rows } = await pool.query(query, params);

    if (grouped === 'true') {
      const groupedDocs = rows.reduce((acc, doc) => {
        const type = doc.document_type || 'Others';
        if (!acc[type]) acc[type] = [];
        acc[type].push({
          id: doc.id,
          name: doc.original_name || doc.file_name,  // prefer original_name
          file_name: doc.file_name,
          original_name: doc.original_name,
          stored_name: doc.stored_name,
          extension: doc.extension,
          url: doc.file_path,
          type: doc.file_type,
          size: doc.file_size,
          uploaded_by: doc.uploaded_by_name,
          created_at: doc.created_at,
          remark: doc.remark,
        });
        return acc;
      }, {});

      if (canViewFinancials(req.user)) {
        // Fetch amounts from project_document_amounts
        const amountsQuery = await pool.query(
          'SELECT document_type, amount FROM project_document_amounts WHERE project_id = $1',
          [pid]
        );
        const amountsMap = amountsQuery.rows.reduce((acc, row) => {
          acc[row.document_type] = row.amount;
          return acc;
        }, {});

        // Override with payment stage amounts (canonical billed amounts)
        const stagesQuery = await pool.query(
          'SELECT document_type, amount FROM project_payment_stages WHERE project_id = $1',
          [pid]
        );
        if (stagesQuery.rows.length > 0) {
          stagesQuery.rows.forEach(row => {
            if (row.document_type && row.amount !== null && row.amount !== undefined) {
              amountsMap[row.document_type] = row.amount;
            }
          });
        }

        return res.json({ documents: groupedDocs, amounts: amountsMap });
      }

      return res.json({ documents: groupedDocs, amounts: {} });
    }

    res.json({ documents: rows });
  } catch (err) {
    console.error('GET /api/documents error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/payment-stages?project_id=X
// ---------------------------------------------------------------------------
router.get('/payment-stages', authenticate, requireAccounting, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const { rows } = await pool.query(
      `SELECT pps.*,
         CASE WHEN EXISTS (
           SELECT 1 FROM invoices i 
           WHERE (i.payment_stage_id = pps.id 
                  OR EXISTS (SELECT 1 FROM invoice_payment_stages ips WHERE ips.invoice_id = i.id AND ips.payment_stage_id = pps.id))
             AND i.status NOT IN ('cancelled')
         ) THEN true ELSE false END as has_active_invoice
       FROM project_payment_stages pps
       WHERE pps.project_id = $1
       ORDER BY pps.created_at DESC`,
      [project_id]
    );
    res.json({ paymentStages: rows });
  } catch (err) {
    console.error('Get payment stages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/documents/payment-stages
// ---------------------------------------------------------------------------
router.post('/payment-stages', authenticate, requireAccounting, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id, document_type, amount } = req.body;
    if (!project_id || !document_type) {
      return res.status(400).json({ error: 'project_id and document_type are required' });
    }

    if (!DOCUMENT_TAGS.includes(document_type)) {
      return res.status(400).json({ error: 'Invalid document_type' });
    }

    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    const existing = await pool.query(
      'SELECT id FROM project_payment_stages WHERE project_id = $1 AND document_type = $2',
      [pid, document_type]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Payment stage already initiated for this tag' });
    }

    const { rows } = await pool.query(
      `INSERT INTO project_payment_stages (project_id, document_type, amount, initiated_by, status)
       VALUES ($1, $2, $3, $4, 'payment initiated')
       RETURNING *`,
      [pid, document_type, parseFloat(amount) || 0, req.user.id]
    );
    res.status(201).json({ paymentStage: rows[0] });
  } catch (err) {
    console.error('Create payment stage error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/documents/payment-stages/:id
// ---------------------------------------------------------------------------
router.patch('/payment-stages/:id', authenticate, requireAccounting, checkProjectAccess({ idIsResource: 'payment-stage' }), async (req, res) => {
  try {
    const { status, amount } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (amount !== undefined) { updates.push(`amount = $${idx++}`); values.push(amount); }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    values.push(req.params.id);
    updates.push(`updated_at = NOW()`);

    const { rows } = await pool.query(
      `UPDATE project_payment_stages SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Payment stage not found' });
    res.json({ paymentStage: rows[0] });
  } catch (err) {
    console.error('Update payment stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/documents/payment-stages/:id
// ---------------------------------------------------------------------------
router.delete('/payment-stages/:id', authenticate, requireAccounting, checkProjectAccess({ idIsResource: 'payment-stage' }), async (req, res) => {
  try {
    await pool.query('DELETE FROM project_payment_stages WHERE id = $1', [req.params.id]);
    res.json({ message: 'Payment stage removed' });
  } catch (err) {
    console.error('Delete payment stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/documents/payment-stages/remove/tag
// ---------------------------------------------------------------------------
router.delete('/payment-stages/remove/tag', authenticate, requireAccounting, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id, document_type } = req.body;
    const pid = parseInt(project_id);
    await pool.query(
      `DELETE FROM project_payment_stages
       WHERE project_id = $1 AND document_type = $2 AND status = 'payment initiated'`,
      [pid, document_type]
    );
    res.json({ message: 'Payment stage removed' });
  } catch (err) {
    console.error('Remove payment stage by tag error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/documents/amounts
// ---------------------------------------------------------------------------
router.post('/amounts', authenticate, requireAccounting, checkProjectAccess(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, document_type, amount } = req.body;
    if (!project_id || !document_type) {
      return res.status(400).json({ error: 'project_id and document_type are required' });
    }
    if (!DOCUMENT_TAGS.includes(document_type)) {
      return res.status(400).json({ error: 'Invalid document_type' });
    }
    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO project_document_amounts (project_id, document_type, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, document_type)
       DO UPDATE SET amount = EXCLUDED.amount
       RETURNING *`,
      [pid, document_type, amount || null]
    );

    // Keep payment stage amount in sync (if not yet paid)
    const numericAmount = parseFloat(amount);
    if (!isNaN(numericAmount)) {
      await client.query(
        `UPDATE project_payment_stages
         SET amount = $1, updated_at = NOW()
         WHERE project_id = $2 AND document_type = $3 AND status != 'paid'`,
        [numericAmount, project_id, document_type]
      );
    }

    await client.query('COMMIT');
    res.json({ amount: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save amount error:', err);
    res.status(500).json({ error: 'Server error saving amount' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:id/download
// ---------------------------------------------------------------------------
router.get('/:id/download', authenticate, checkProjectAccess({ idIsResource: 'document' }), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT file_path, file_name, original_name FROM documents WHERE id = $1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    const doc = rows[0];
    const absolutePath = path.join(__dirname, '..', doc.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Serve with original filename so browser saves/opens it correctly
    const downloadName = doc.original_name || doc.file_name;
    res.download(absolutePath, downloadName, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error downloading file' });
        }
      }
    });
  } catch (err) {
    console.error('Get document download error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/documents/:id
// ---------------------------------------------------------------------------
router.delete('/:id', authenticate, checkProjectAccess({ idIsResource: 'document' }), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows } = await client.query('SELECT file_path, uploaded_by FROM documents WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    // Authorization: only the uploader or admin/heads can delete documents
    const isOwner = rows[0].uploaded_by === req.user.id;
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'design_head' || req.user.role === 'project_head';
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ error: 'Unauthorized: you can only delete documents uploaded by yourself' });
    }

    const filePath = rows[0].file_path;
    const absolutePath = path.join(__dirname, '..', filePath);

    await client.query('BEGIN');
    await client.query('DELETE FROM documents WHERE id = $1', [id]);

    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (fsErr) {
      console.error('File deletion error (non-fatal):', fsErr);
      // DB row is deleted; filesystem error is logged but does not fail the request
    }

    await client.query('COMMIT');
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Server error during deletion' });
  } finally {
    client.release();
  }
});

module.exports = router;
