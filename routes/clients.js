const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { validateCompany, validateUUID, validatePagination } = require('../middleware/validation');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');


router.get('/', requireRole(['administrator', 'developer']), validatePagination, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      is_active = '',
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereConditions.push(`(c.name ILIKE $${paramCount} OR c.email ILIKE $${paramCount} OR c.contact_person ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }

    if (is_active !== '') {
      paramCount++;
      whereConditions.push(`c.is_active = $${paramCount}`);
      queryParams.push(is_active === 'true');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM companies c ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const totalCompanies = parseInt(countResult.rows[0].count);

    const companiesQuery = `
      SELECT 
        c.id, c.name, c.email, c.phone, c.address, c.website,
        c.contact_person, c.logo_url, c.is_active, c.created_at, c.updated_at,
        COUNT(DISTINCT p.id) as total_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ongoing') as ongoing_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'completed') as completed_projects,
        COUNT(DISTINCT cu.user_id) as total_users,
        SUM(p.budget) as total_budget
      FROM companies c
      LEFT JOIN projects p ON c.id = p.company_id AND p.is_active = true
      LEFT JOIN client_users cu ON c.id = cu.company_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.${sort} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(companiesQuery, queryParams);

    const totalPages = Math.ceil(totalCompanies / limit);

    res.json({
      companies: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_companies: totalCompanies,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});


router.get('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check access permissions for client users
    if (req.user.role === 'client') {
      const accessCheck = await db.query(
        'SELECT 1 FROM client_users WHERE company_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
    }

    const companyQuery = `
      SELECT 
        c.id, c.name, c.email, c.phone, c.address, c.website,
        c.contact_person, c.logo_url, c.notes, c.is_active,
        c.created_at, c.updated_at
      FROM companies c
      WHERE c.id = $1 AND c.is_active = true
    `;

    const companyResult = await db.query(companyQuery, [id]);
    
    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];

    // Get company users
    const usersQuery = `
      SELECT 
        cu.id as client_user_id, cu.is_primary_contact, cu.joined_at,
        u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active
      FROM client_users cu
      JOIN users u ON cu.user_id = u.id
      WHERE cu.company_id = $1
      ORDER BY cu.is_primary_contact DESC, u.first_name
    `;

    const usersResult = await db.query(usersQuery, [id]);

    // Get company projects (only basic info for clients)
    let projectsQuery;
    if (req.user.role === 'client') {
      projectsQuery = `
        SELECT 
          p.id, p.name, p.description, p.status, p.progress_percentage,
          p.start_date, p.end_date, p.created_at
        FROM projects p
        WHERE p.company_id = $1 AND p.is_active = true
        ORDER BY p.created_at DESC
      `;
    } else {
      projectsQuery = `
        SELECT 
          p.id, p.name, p.description, p.status, p.progress_percentage,
          p.start_date, p.end_date, p.budget, p.currency, p.created_at,
          u.first_name || ' ' || u.last_name as project_manager_name
        FROM projects p
        LEFT JOIN users u ON p.project_manager_id = u.id
        WHERE p.company_id = $1 AND p.is_active = true
        ORDER BY p.created_at DESC
      `;
    }

    const projectsResult = await db.query(projectsQuery, [id]);

    // Get company statistics
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT p.id) as total_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ongoing') as ongoing_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'completed') as completed_projects,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
        SUM(p.budget) as total_budget,
        SUM(i.total_amount) FILTER (WHERE i.status = 'paid') as total_paid
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      LEFT JOIN invoices i ON p.id = i.project_id
      WHERE p.company_id = $1 AND p.is_active = true
    `;

    const statsResult = await db.query(statsQuery, [id]);

    res.json({
      company: {
        ...company,
        users: usersResult.rows,
        projects: projectsResult.rows,
        statistics: statsResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/clients
// @desc    Create a new client
// @access  Private (Administrator)
router.post('/', requireRole(['administrator']), [
    body('first_name', 'First name is required').not().isEmpty(),
    body('last_name', 'Last name is required').not().isEmpty(),
    body('email', 'Please include a valid email').isEmail(),
    body('company_id', 'Company is required').isUUID(4)
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { first_name, last_name, email, phone, company_id } = req.body;

    try {
        // Check if company exists
        const company = await db.query('SELECT id FROM companies WHERE id = $1', [company_id]);
        if (company.rows.length === 0) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        // Check if user already exists
        let user = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (user.rows.length > 0) {
            return res.status(400).json({ msg: 'User with this email already exists' });
        }

        // Create a new user with role 'client'
        const password = Math.random().toString(36).slice(-8); // Generate a random password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await db.query(
      'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [first_name, last_name, email, hashedPassword, 'client']
    );
        const userId = newUser.rows[0].id;

        // Link user to the company in client_users table
        await db.query('INSERT INTO client_users (user_id, company_id) VALUES ($1, $2)', [userId, company_id]);

        // TODO: Send an email to the new client with their login credentials

        res.status(201).json({ msg: 'Client created successfully', userId: userId });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   PUT /api/clients/:id
// @desc    Update client/company
// @access  Private (Admin and Developer)
router.put('/:id', validateUUID, requireRole(['administrator', 'developer']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowedFields = ['name', 'email', 'phone', 'address', 'website', 'contact_person', 'notes'];
    
    // Filter allowed fields
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Check if company exists
    const existingCompany = await db.query('SELECT name FROM companies WHERE id = $1', [id]);
    if (existingCompany.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check for duplicate name if updating name
    if (updates.name) {
      const nameCheck = await db.query(
        'SELECT id FROM companies WHERE name = $1 AND id != $2 AND is_active = true',
        [updates.name, id]
      );
      if (nameCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Company name already exists' });
      }
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const updateQuery = `
      UPDATE companies 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, name, email, updated_at
    `;

    const result = await db.query(updateQuery, values);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'company_updated', 'company', id, updates]
    );

    res.json({
      message: 'Company updated successfully',
      company: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/clients/:id
// @desc    Deactivate client/company
// @access  Private (Admin only)
router.delete('/:id', validateUUID, requireRole(['administrator']), async (req, res, next) => {
  try {
    const { id } = req.params;

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

    // Deactivate company
    await db.query('UPDATE companies SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'company_deactivated', 'company', id, { name: existingCompany.rows[0].name }]
    );

    res.json({ message: 'Company deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/clients/:id/users
// @desc    Add user to client company
// @access  Private (Admin and Developer)
router.post('/:id/users', validateUUID, requireRole(['administrator', 'developer']), [
  body('user_id').isUUID(),
  body('is_primary_contact').optional().isBoolean()
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_id, is_primary_contact = false } = req.body;

    // Check if company exists
    const companyCheck = await db.query('SELECT name FROM companies WHERE id = $1 AND is_active = true', [id]);
    if (companyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check if user exists and is a client
    const userCheck = await db.query(
      'SELECT id, first_name, last_name, email FROM users WHERE id = $1 AND role = $2 AND is_active = true',
      [user_id, 'client']
    );
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ error: 'User not found or not a client' });
    }

    // Check if user is already linked to this company
    const existingLink = await db.query(
      'SELECT id FROM client_users WHERE company_id = $1 AND user_id = $2',
      [id, user_id]
    );
    if (existingLink.rows.length > 0) {
      return res.status(409).json({ error: 'User is already linked to this company' });
    }

    // If setting as primary contact, remove primary status from others
    if (is_primary_contact) {
      await db.query(
        'UPDATE client_users SET is_primary_contact = false WHERE company_id = $1',
        [id]
      );
    }

    // Link user to company
    const insertQuery = `
      INSERT INTO client_users (company_id, user_id, is_primary_contact)
      VALUES ($1, $2, $3)
      RETURNING id, joined_at
    `;

    const result = await db.query(insertQuery, [id, user_id, is_primary_contact]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'client_user_added', 'company', id, { 
        added_user: userCheck.rows[0].email,
        is_primary_contact 
      }]
    );

    res.status(201).json({
      message: 'User added to company successfully',
      client_user: {
        ...result.rows[0],
        user: userCheck.rows[0],
        is_primary_contact
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/clients/:id/users/:userId
// @desc    Remove user from client company
// @access  Private (Admin and Developer)
router.delete('/:id/users/:userId', validateUUID, requireRole(['administrator', 'developer']), async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    // Check if link exists
    const linkCheck = await db.query(
      `SELECT cu.id, u.email FROM client_users cu
       JOIN users u ON cu.user_id = u.id
       WHERE cu.company_id = $1 AND cu.user_id = $2`,
      [id, userId]
    );

    if (linkCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User is not linked to this company' });
    }

    // Remove link
    await db.query('DELETE FROM client_users WHERE company_id = $1 AND user_id = $2', [id, userId]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'client_user_removed', 'company', id, { 
        removed_user: linkCheck.rows[0].email 
      }]
    );

    res.json({ message: 'User removed from company successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/clients/:id/projects
// @desc    Get company projects
// @access  Private
router.get('/:id/projects', validateUUID, validatePagination, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, status = '' } = req.query;
    const offset = (page - 1) * limit;

    // Check access permissions
    if (req.user.role === 'client') {
      const accessCheck = await db.query(
        'SELECT 1 FROM client_users WHERE company_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (accessCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
    }

    // Build WHERE clause
    let whereConditions = ['p.company_id = $1', 'p.is_active = true'];
    let queryParams = [id];
    let paramCount = 1;

    if (status && ['planning', 'ongoing', 'completed', 'stopped'].includes(status)) {
      paramCount++;
      whereConditions.push(`p.status = $${paramCount}`);
      queryParams.push(status);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get projects
    let projectsQuery;
    if (req.user.role === 'client') {
      projectsQuery = `
        SELECT 
          p.id, p.name, p.description, p.status, p.progress_percentage,
          p.start_date, p.end_date, p.created_at, p.updated_at,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        ${whereClause}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
    } else {
      projectsQuery = `
        SELECT 
          p.id, p.name, p.description, p.status, p.progress_percentage,
          p.start_date, p.end_date, p.budget, p.currency, p.estimated_hours,
          p.actual_hours, p.created_at, p.updated_at,
          u.first_name || ' ' || u.last_name as project_manager_name,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          COUNT(DISTINCT pm.user_id) as team_size
        FROM projects p
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.left_at IS NULL
        ${whereClause}
        GROUP BY p.id, u.first_name, u.last_name
        ORDER BY p.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
    }

    queryParams.push(limit, offset);
    const result = await db.query(projectsQuery, queryParams);

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM projects p ${whereClause}`;
    const countParams = queryParams.slice(0, paramCount);
    const countResult = await db.query(countQuery, countParams);
    const totalProjects = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProjects / limit);

    res.json({
      projects: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_projects: totalProjects,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/clients/stats
// @desc    Get client statistics (Admin and Developer only)
// @access  Private (Admin and Developer)
router.get('/stats/overview', requireRole(['administrator', 'developer']), async (req, res, next) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_companies,
        COUNT(*) FILTER (WHERE is_active = true) as active_companies,
        COUNT(DISTINCT cu.user_id) as total_client_users,
        AVG(project_counts.project_count) as avg_projects_per_company
      FROM companies c
      LEFT JOIN client_users cu ON c.id = cu.company_id
      LEFT JOIN (
        SELECT company_id, COUNT(*) as project_count
        FROM projects
        WHERE is_active = true
        GROUP BY company_id
      ) project_counts ON c.id = project_counts.company_id
      WHERE c.is_active = true
    `;

    const result = await db.query(statsQuery);
    
    res.json({ stats: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
