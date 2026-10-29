// server/routes/vendors.js
// Vendor catalog - grouped by category with full CRUD

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/vendors - Get all vendors grouped by category
router.get('/', authenticate, async (req, res) => {
  try {
    const query = 'SELECT * FROM vendors v ORDER BY v.category, v.name';
    const { rows } = await pool.query(query);

    const grouped = {};
    rows.forEach((v) => {
      if (!grouped[v.category]) grouped[v.category] = [];
      grouped[v.category].push(v);
    });

    res.json({ vendors: rows, grouped });
  } catch (err) {
    console.error('Vendors GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// M1 FIX: GET /api/vendors/categories must be declared BEFORE GET /:id
// otherwise Express matches "categories" as the :id param value
// GET /api/vendors/categories - Get distinct categories
router.get('/categories', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT category FROM vendors ORDER BY category'
    );
    res.json({ categories: rows.map((r) => r.category) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/vendors - Create a new vendor (accessible to all authenticated staff)
router.post('/', authenticate, async (req, res) => {
  const { name, category, phone, email, remarks } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Name and category are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO vendors (name, category, phone, email, remarks)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, category, phone, email, remarks]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Vendors POST error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/vendors/:id - Update a vendor (accessible to all authenticated staff)
router.patch('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, category, phone, email, remarks } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE vendors 
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           phone = COALESCE($3, phone),
           email = COALESCE($4, email),
           remarks = COALESCE($5, remarks)
       WHERE id = $6
       RETURNING *`,
      [name, category, phone, email, remarks, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Vendors PATCH error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/vendors/:id - Delete a vendor
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM vendors WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ message: 'Vendor deleted successfully' });
  } catch (err) {
    console.error('Vendors DELETE error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
