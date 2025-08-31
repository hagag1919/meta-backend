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
    const companies = await db.query('SELECT id, name FROM companies ORDER BY name');
    res.json(companies.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
