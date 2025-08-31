const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole, requireAdminOrOwner } = require('../middleware/auth');
const { validateUUID, validatePagination } = require('../middleware/validation');
const { body } = require('express-validator');

// @route   GET /api/users
// @desc    Get all users (with pagination and filters)
// @access  Private (Admin and Developer)
router.get('/', requireRole(['administrator', 'developer']), validatePagination, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = '',
      is_active = '',
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereConditions.push(`(first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR email ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }

    if (role && ['administrator', 'developer', 'client'].includes(role)) {
      paramCount++;
      whereConditions.push(`role = $${paramCount}`);
      queryParams.push(role);
    }

    if (is_active !== '') {
      paramCount++;
      whereConditions.push(`is_active = $${paramCount}`);
      queryParams.push(is_active === 'true');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const totalUsers = parseInt(countResult.rows[0].count);

    // Get users
    const usersQuery = `
      SELECT 
        id, email, first_name, last_name, phone, role, is_active, 
        email_verified, last_login, profile_image_url, language_preference,
        created_at, updated_at
      FROM users 
      ${whereClause}
      ORDER BY ${sort} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(usersQuery, queryParams);

    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      users: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_users: totalUsers,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT 
        id, email, first_name, last_name, phone, role, 
        profile_image_url, language_preference, timezone,
        email_verified, last_login, created_at, updated_at
      FROM users 
      WHERE id = $1
    `;
    
    const result = await db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (Admin or owner)
router.get('/:id', validateUUID, requireAdminOrOwner, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        id, email, first_name, last_name, phone, role, is_active,
        profile_image_url, language_preference, timezone,
        email_verified, last_login, created_at, updated_at
      FROM users 
      WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/profile
// @desc    Update current user profile
// @access  Private
router.put('/profile', [
  body('first_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('language_preference').optional().isIn(['en', 'ar']),
  body('timezone').optional().trim().isLength({ max: 50 })
], async (req, res, next) => {
  try {
    const userId = req.user.id;
    const allowedFields = ['first_name', 'last_name', 'phone', 'language_preference', 'timezone'];
    
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

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [userId, ...Object.values(updates)];

    const query = `
      UPDATE users 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, first_name, last_name, phone, role,
                profile_image_url, language_preference, timezone, updated_at
    `;

    const result = await db.query(query, values);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'profile_updated', 'user', userId, updates]
    );

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/:id
// @desc    Update user (Admin only)
// @access  Private (Admin only)
router.put('/:id', validateUUID, requireRole(['administrator']), [
  body('first_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('role').optional().isIn(['administrator', 'developer', 'client']),
  body('is_active').optional().isBoolean(),
  body('language_preference').optional().isIn(['en', 'ar'])
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'role', 'is_active', 'language_preference'];
    
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

    // Check if user exists
    const existingUser = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If updating email, check for duplicates
    if (updates.email) {
      const emailCheck = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [updates.email, id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const query = `
      UPDATE users 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, first_name, last_name, phone, role, is_active,
                profile_image_url, language_preference, updated_at
    `;

    const result = await db.query(query, values);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'user_updated', 'user', id, updates]
    );

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/users/:id
// @desc    Deactivate user (Admin only)
// @access  Private (Admin only)
router.delete('/:id', validateUUID, requireRole(['administrator']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    // Prevent admin from deactivating themselves
    if (id === currentUserId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Check if user exists
    const existingUser = await db.query('SELECT id, email FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deactivate user instead of deleting
    await db.query('UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [currentUserId, 'user_deactivated', 'user', id, { email: existingUser.rows[0].email }]
    );

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/users/:id/activate
// @desc    Activate user (Admin only)
// @access  Private (Admin only)
router.post('/:id/activate', validateUUID, requireRole(['administrator']), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await db.query('SELECT id, email, is_active FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.rows[0].is_active) {
      return res.status(400).json({ error: 'User is already active' });
    }

    // Activate user
    await db.query('UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'user_activated', 'user', id, { email: existingUser.rows[0].email }]
    );

    res.json({ message: 'User activated successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/:id/activity
// @desc    Get user activity log
// @access  Private (Admin or owner)
router.get('/:id/activity', validateUUID, requireAdminOrOwner, validatePagination, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if user exists
    const userExists = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get activity logs
    const query = `
      SELECT 
        id, action, entity_type, entity_id, details, 
        ip_address, created_at
      FROM activity_logs 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [id, limit, offset]);

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM activity_logs WHERE user_id = $1',
      [id]
    );
    const totalLogs = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalLogs / limit);

    res.json({
      activity_logs: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_logs: totalLogs,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics (Admin only)
// @access  Private (Admin only)
router.get('/stats/overview', requireRole(['administrator']), async (req, res, next) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_active = true) as active_users,
        COUNT(*) FILTER (WHERE role = 'administrator') as admin_users,
        COUNT(*) FILTER (WHERE role = 'developer') as developer_users,
        COUNT(*) FILTER (WHERE role = 'client') as client_users,
        COUNT(*) FILTER (WHERE last_login >= CURRENT_DATE - INTERVAL '30 days') as recent_logins
      FROM users
    `;

    const result = await db.query(statsQuery);
    
    res.json({ stats: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
