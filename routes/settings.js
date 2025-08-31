const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { body } = require('express-validator');

// @route   GET /api/settings/system
// @desc    Get system settings
// @access  Private (Admin only)
router.get('/system', requireRole(['administrator']), async (req, res, next) => {
  try {
    const settingsQuery = `
      SELECT setting_key, setting_value, description, data_type
      FROM system_settings 
      WHERE is_active = true
      ORDER BY setting_key
    `;

    const result = await db.query(settingsQuery);
    
    // Transform array to object for easier frontend consumption
    const settings = {};
    result.rows.forEach(row => {
      let value = row.setting_value;
      
      // Parse value based on data type
      switch (row.data_type) {
        case 'boolean':
          value = value === 'true';
          break;
        case 'number':
          value = parseFloat(value);
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch (e) {
            value = row.setting_value;
          }
          break;
        default:
          value = row.setting_value;
      }
      
      settings[row.setting_key] = {
        value,
        description: row.description,
        data_type: row.data_type
      };
    });

    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/settings/system
// @desc    Update system settings
// @access  Private (Admin only)
router.put('/system', requireRole(['administrator']), [
  body('settings').isObject()
], async (req, res, next) => {
  try {
    const { settings } = req.body;
    const updatedSettings = [];

    for (const [key, value] of Object.entries(settings)) {
      // Validate setting exists
      const existingQuery = 'SELECT * FROM system_settings WHERE setting_key = $1 AND is_active = true';
      const existingResult = await db.query(existingQuery, [key]);
      
      if (existingResult.rows.length === 0) {
        continue; // Skip invalid settings
      }

      const setting = existingResult.rows[0];
      let settingValue;

      // Convert value to string based on data type
      switch (setting.data_type) {
        case 'boolean':
          settingValue = Boolean(value).toString();
          break;
        case 'number':
          settingValue = Number(value).toString();
          break;
        case 'json':
          settingValue = JSON.stringify(value);
          break;
        default:
          settingValue = String(value);
      }

      // Update setting
      const updateQuery = `
        UPDATE system_settings 
        SET setting_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE setting_key = $3
        RETURNING setting_key, setting_value
      `;

      const updateResult = await db.query(updateQuery, [settingValue, req.user.id, key]);
      if (updateResult.rows.length > 0) {
        updatedSettings.push(updateResult.rows[0]);
      }
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'settings_updated', 'system_settings', null, { updated_settings: updatedSettings }]
    );

    res.json({
      message: 'Settings updated successfully',
      updated_settings: updatedSettings
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/settings/company
// @desc    Get company settings for user's company
// @access  Private
router.get('/company', async (req, res, next) => {
  try {
    let companyId;

    if (req.user.role === 'client') {
      // Get company from client_users table
      const clientQuery = 'SELECT company_id FROM client_users WHERE user_id = $1';
      const clientResult = await db.query(clientQuery, [req.user.id]);
      
      if (clientResult.rows.length === 0) {
        return res.status(400).json({ error: 'No company associated with this user' });
      }
      
      companyId = clientResult.rows[0].company_id;
    } else {
      // For admin/developer, use query param or get all companies
      companyId = req.query.company_id;
      
      if (!companyId && req.user.role !== 'administrator') {
        return res.status(400).json({ error: 'Company ID required' });
      }
    }

    if (companyId) {
      // Get specific company settings
      const companyQuery = `
        SELECT 
          id, name, email, phone, address, website,
          logo_url, primary_color, secondary_color,
          default_currency, default_language, timezone,
          is_active, created_at, updated_at
        FROM companies 
        WHERE id = $1
      `;

      const result = await db.query(companyQuery, [companyId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }

      res.json({ company: result.rows[0] });
    } else {
      // Admin can see all companies
      const companiesQuery = `
        SELECT 
          id, name, email, phone, address, website,
          logo_url, primary_color, secondary_color,
          default_currency, default_language, timezone,
          is_active, created_at,
          (SELECT COUNT(*) FROM projects WHERE company_id = c.id) as projects_count,
          (SELECT COUNT(*) FROM client_users WHERE company_id = c.id) as users_count
        FROM companies c
        ORDER BY name
      `;

      const result = await db.query(companiesQuery);
      res.json({ companies: result.rows });
    }
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/settings/company/:id
// @desc    Update company settings
// @access  Private (Admin or Company Client)
router.put('/company/:id', [
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('email').optional().isEmail(),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('address').optional().trim().isLength({ max: 500 }),
  body('website').optional().isURL(),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i),
  body('default_currency').optional().isLength({ min: 3, max: 3 }),
  body('default_language').optional().isIn(['en', 'ar']),
  body('timezone').optional().trim().isLength({ max: 100 })
], async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check access rights
    if (req.user.role === 'client') {
      const clientQuery = 'SELECT company_id FROM client_users WHERE user_id = $1 AND company_id = $2';
      const clientResult = await db.query(clientQuery, [req.user.id, id]);
      
      if (clientResult.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this company' });
      }
    } else if (req.user.role === 'developer') {
      // Developers can only update companies they manage projects for
      const projectQuery = `
        SELECT DISTINCT p.company_id FROM projects p 
        WHERE p.project_manager_id = $1 AND p.company_id = $2
      `;
      const projectResult = await db.query(projectQuery, [req.user.id, id]);
      
      if (projectResult.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this company' });
      }
    }

    // Filter allowed fields
    const allowedFields = [
      'name', 'email', 'phone', 'address', 'website',
      'primary_color', 'secondary_color', 'default_currency',
      'default_language', 'timezone'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const updateQuery = `
      UPDATE companies 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, name, updated_at
    `;

    const result = await db.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'company_updated', 'company', id, updates]
    );

    res.json({
      message: 'Company settings updated successfully',
      company: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/settings/user
// @desc    Get user preferences
// @access  Private
router.get('/user', async (req, res, next) => {
  try {
    const userQuery = `
      SELECT 
        id, email, first_name, last_name, role,
        language, timezone, notification_preferences,
        theme_preference, created_at, last_login
      FROM users 
      WHERE id = $1
    `;

    const result = await db.query(userQuery, [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    // Parse notification preferences if it's a JSON string
    if (typeof user.notification_preferences === 'string') {
      try {
        user.notification_preferences = JSON.parse(user.notification_preferences);
      } catch (e) {
        user.notification_preferences = {};
      }
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/settings/user
// @desc    Update user preferences
// @access  Private
router.put('/user', [
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('language').optional().isIn(['en', 'ar']),
  body('timezone').optional().trim().isLength({ max: 100 }),
  body('theme_preference').optional().isIn(['light', 'dark', 'auto']),
  body('notification_preferences').optional().isObject()
], async (req, res, next) => {
  try {
    const allowedFields = [
      'first_name', 'last_name', 'language', 'timezone',
      'theme_preference', 'notification_preferences'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'notification_preferences') {
          updates[field] = JSON.stringify(req.body[field]);
        } else {
          updates[field] = req.body[field];
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [req.user.id, ...Object.values(updates)];

    const updateQuery = `
      UPDATE users 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, first_name, last_name, language, timezone, theme_preference, updated_at
    `;

    const result = await db.query(updateQuery, values);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'profile_updated', 'user', req.user.id, updates]
    );

    res.json({
      message: 'User preferences updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/settings/permissions
// @desc    Get role permissions
// @access  Private (Admin only)
router.get('/permissions', requireRole(['administrator']), async (req, res, next) => {
  try {
    const permissionsQuery = `
      SELECT 
        role,
        array_agg(permission ORDER BY permission) as permissions
      FROM role_permissions 
      WHERE is_active = true
      GROUP BY role
      ORDER BY role
    `;

    const result = await db.query(permissionsQuery);
    
    const permissions = {};
    result.rows.forEach(row => {
      permissions[row.role] = row.permissions;
    });

    res.json({ permissions });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/settings/permissions
// @desc    Update role permissions
// @access  Private (Admin only)
router.put('/permissions', requireRole(['administrator']), [
  body('role').isIn(['administrator', 'developer', 'client']),
  body('permissions').isArray()
], async (req, res, next) => {
  try {
    const { role, permissions } = req.body;

    // Validate permissions
    const validPermissions = [
      'users.read', 'users.write', 'users.delete',
      'projects.read', 'projects.write', 'projects.delete',
      'tasks.read', 'tasks.write', 'tasks.delete',
      'companies.read', 'companies.write', 'companies.delete',
      'invoices.read', 'invoices.write', 'invoices.delete',
      'reports.read', 'reports.write',
      'settings.read', 'settings.write',
      'files.read', 'files.write', 'files.delete',
      'time.read', 'time.write', 'time.delete'
    ];

    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid permissions', 
        invalid: invalidPermissions 
      });
    }

    // Remove existing permissions for role
    await db.query('DELETE FROM role_permissions WHERE role = $1', [role]);

    // Add new permissions
    for (const permission of permissions) {
      await db.query(
        'INSERT INTO role_permissions (role, permission, granted_by) VALUES ($1, $2, $3)',
        [role, permission, req.user.id]
      );
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'permissions_updated', 'role_permissions', null, { role, permissions }]
    );

    res.json({
      message: 'Permissions updated successfully',
      role,
      permissions
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
