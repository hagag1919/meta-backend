const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// @route   POST /api/companies
// @desc    Create a new company
// @access  Private (Administrator)
router.post(
  '/',
  requireRole(['administrator']),
  [
    body('name', 'Company name is required').not().isEmpty(),
    body('email', 'Please include a valid email').isEmail().optional({ nullable: true }),
    body('phone', 'Phone number must be a valid phone number').isString().optional({ nullable: true }),
    body('website', 'Website must be a valid URL').isURL().optional({ nullable: true }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, website, address } = req.body;

    try {
      const newCompany = await db.query(
        'INSERT INTO companies (name, email, phone, website, address) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, email, phone, website, address]
      );

      res.status(201).json(newCompany.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET /api/companies
// @desc    Get all companies
// @access  Private (Administrator, Developer)
router.get('/', requireRole(['administrator', 'developer']), async (req, res) => {
  try {
    const companies = await db.query(
      `SELECT id, name, email, phone, website, address, contact_person, notes, 
              is_active, created_at, updated_at,
              (SELECT COUNT(*) FROM projects WHERE company_id = companies.id) as projects_count
       FROM companies 
       ORDER BY name`
    );
    res.json({ companies: companies.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/companies/:id
// @desc    Update company
// @access  Private (Administrator)
router.put('/:id', requireRole(['administrator']), [
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('email').optional().isEmail(),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('website').optional().isURL(),
  body('address').optional().trim().isLength({ max: 500 }),
  body('contact_person').optional().trim().isLength({ max: 255 }),
  body('notes').optional().trim().isLength({ max: 1000 }),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { name, email, phone, website, address, contact_person, notes, is_active } = req.body;

  try {
    // Check if company exists
    const existingCompany = await db.query('SELECT * FROM companies WHERE id = $1', [id]);
    if (existingCompany.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Build update query dynamically
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (website !== undefined) updates.website = website;
    if (address !== undefined) updates.address = address;
    if (contact_person !== undefined) updates.contact_person = contact_person;
    if (notes !== undefined) updates.notes = notes;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Build SET clause
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const result = await db.query(
      `UPDATE companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE /api/companies/:id
// @desc    Deactivate company
// @access  Private (Administrator)
router.delete('/:id', requireRole(['administrator']), async (req, res) => {
  const { id } = req.params;

  try {
    // Check if company exists
    const existingCompany = await db.query('SELECT name FROM companies WHERE id = $1', [id]);
    if (existingCompany.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check if company has active projects
    const activeProjects = await db.query(
      'SELECT COUNT(*) FROM projects WHERE company_id = $1 AND status IN ($2, $3) AND is_active = true',
      [id, 'ongoing', 'planning']
    );

    if (parseInt(activeProjects.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot deactivate company with active projects. Complete or stop all projects first.' 
      });
    }

    // Deactivate company instead of deleting
    await db.query('UPDATE companies SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    res.json({ message: 'Company deactivated successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
