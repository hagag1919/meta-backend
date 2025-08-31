const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole, requireAdminOrOwner } = require('../middleware/auth');
const { validateProject, validateUUID, validatePagination } = require('../middleware/validation');
const { body } = require('express-validator');

// @route   GET /api/projects
// @desc    Get all projects (with pagination and filters)
// @access  Private
router.get('/', validatePagination, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      company_id = '',
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Build WHERE clause based on user role
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'client') {
      // Clients can only see projects from their company
      paramCount++;
      whereConditions.push(`p.company_id IN (
        SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      // Developers can see projects they're assigned to or managing
      paramCount++;
      whereConditions.push(`(p.project_manager_id = $${paramCount} OR EXISTS (
        SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $${paramCount}
      ))`);
      queryParams.push(req.user.id);
    }
    // Administrators can see all projects

    if (search) {
      paramCount++;
      whereConditions.push(`(p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }

    if (status && ['planning', 'ongoing', 'completed', 'stopped'].includes(status)) {
      paramCount++;
      whereConditions.push(`p.status = $${paramCount}`);
      queryParams.push(status);
    }

    if (company_id) {
      paramCount++;
      whereConditions.push(`p.company_id = $${paramCount}`);
      queryParams.push(company_id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM projects p
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const totalProjects = parseInt(countResult.rows[0].count);

    // Get projects with related data
    const projectsQuery = `
      SELECT 
        p.id, p.name, p.description, p.budget, p.currency,
        p.start_date, p.end_date, p.estimated_hours, p.actual_hours,
        p.status, p.progress_percentage, p.repository_url,
        p.created_at, p.updated_at,
        c.name as company_name, c.id as company_id,
        u.first_name || ' ' || u.last_name as project_manager_name,
        u.id as project_manager_id,
        COUNT(DISTINCT pm.user_id) as team_size,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks
      FROM projects p
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN users u ON p.project_manager_id = u.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.left_at IS NULL
      LEFT JOIN tasks t ON p.id = t.project_id
      ${whereClause}
      GROUP BY p.id, c.id, c.name, u.id, u.first_name, u.last_name
      ORDER BY p.${sort} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(projectsQuery, queryParams);

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

// @route   GET /api/projects/:id
// @desc    Get project by ID
// @access  Private
router.get('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check access permissions
    let accessQuery = 'SELECT 1 FROM projects WHERE id = $1';
    let accessParams = [id];

    if (req.user.role === 'client') {
      accessQuery = `
        SELECT 1 FROM projects p
        WHERE p.id = $1 AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
        )
      `;
      accessParams = [id, req.user.id];
    } else if (req.user.role === 'developer') {
      accessQuery = `
        SELECT 1 FROM projects p
        WHERE p.id = $1 AND (p.project_manager_id = $2 OR EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
        ))
      `;
      accessParams = [id, req.user.id];
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get project details
    const projectQuery = `
      SELECT 
        p.id, p.name, p.description, p.budget, p.currency,
        p.start_date, p.end_date, p.estimated_hours, p.actual_hours,
        p.status, p.progress_percentage, p.repository_url,
        p.created_at, p.updated_at,
        c.name as company_name, c.id as company_id, c.email as company_email,
        c.phone as company_phone, c.website as company_website,
        u.first_name || ' ' || u.last_name as project_manager_name,
        u.id as project_manager_id, u.email as project_manager_email
      FROM projects p
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN users u ON p.project_manager_id = u.id
      WHERE p.id = $1
    `;

    const projectResult = await db.query(projectQuery, [id]);
    const project = projectResult.rows[0];

    // Get team members
    const teamQuery = `
      SELECT 
        pm.id, pm.role, pm.hourly_rate, pm.joined_at,
        u.id as user_id, u.first_name, u.last_name, u.email, u.role as user_role
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = $1 AND pm.left_at IS NULL
      ORDER BY pm.joined_at
    `;

    const teamResult = await db.query(teamQuery, [id]);

    // Get milestones
    const milestonesQuery = `
      SELECT 
        id, name, description, due_date, is_completed, 
        completed_at, order_index, created_at
      FROM milestones
      WHERE project_id = $1
      ORDER BY order_index, due_date
    `;

    const milestonesResult = await db.query(milestonesQuery, [id]);

    // Get task statistics
    const taskStatsQuery = `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'new') as new_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'canceled') as canceled_tasks,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority_tasks,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') as overdue_tasks
      FROM tasks
      WHERE project_id = $1
    `;

    const taskStatsResult = await db.query(taskStatsQuery, [id]);

    res.json({
      project: {
        ...project,
        team_members: teamResult.rows,
        milestones: milestonesResult.rows,
        task_stats: taskStatsResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/projects
// @desc    Create new project
// @access  Private (Admin or Developer)
router.post('/', requireRole(['administrator', 'developer']), validateProject, async (req, res, next) => {
  try {
    const {
      name,
      description,
      company_id,
      project_manager_id,
      budget,
      currency = 'USD',
      start_date,
      end_date,
      estimated_hours,
      repository_url
    } = req.body;

    // Verify company exists
    const companyCheck = await db.query('SELECT id FROM companies WHERE id = $1', [company_id]);
    if (companyCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Company not found' });
    }

    // Verify project manager exists (if provided)
    if (project_manager_id) {
      const managerCheck = await db.query(
        'SELECT id FROM users WHERE id = $1 AND role IN ($2, $3) AND is_active = true',
        [project_manager_id, 'administrator', 'developer']
      );
      if (managerCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid project manager' });
      }
    }

    // Create project
    const insertQuery = `
      INSERT INTO projects (
        name, description, company_id, project_manager_id,
        budget, currency, start_date, end_date, estimated_hours, repository_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, status, created_at
    `;

    const values = [
      name, description, company_id, project_manager_id || req.user.id,
      budget, currency, start_date, end_date, estimated_hours, repository_url
    ];

    const result = await db.query(insertQuery, values);
    const project = result.rows[0];

    // Add creator as team member if not already project manager
    if (!project_manager_id || project_manager_id !== req.user.id) {
      await db.query(
        'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
        [project.id, req.user.id, 'Project Creator']
      );
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'project_created', 'project', project.id, { name: project.name }]
    );

    // Emit socket event for real-time updates
    const io = req.app.get('socketio');
    io.emit('project_created', { project, created_by: req.user });

    res.status(201).json({
      message: 'Project created successfully',
      project
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/projects/:id
// @desc    Update project
// @access  Private (Admin, Project Manager, or Team Member)
router.put('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      budget,
      currency,
      start_date,
      end_date,
      estimated_hours,
      status,
      progress_percentage,
      repository_url
    } = req.body;

    // Check project access
    let accessQuery = 'SELECT project_manager_id FROM projects WHERE id = $1';
    let accessParams = [id];

    if (req.user.role !== 'administrator') {
      accessQuery = `
        SELECT project_manager_id FROM projects p
        WHERE p.id = $1 AND (p.project_manager_id = $2 OR EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
        ))
      `;
      accessParams = [id, req.user.id];
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Only admin or project manager can change status and certain fields
    const isManagerOrAdmin = req.user.role === 'administrator' || 
                           accessResult.rows[0].project_manager_id === req.user.id;

    const allowedFields = ['name', 'description', 'repository_url'];
    if (isManagerOrAdmin) {
      allowedFields.push('budget', 'currency', 'start_date', 'end_date', 'estimated_hours', 'status', 'progress_percentage');
    }

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

    // Validate status
    if (updates.status && !['planning', 'ongoing', 'completed', 'stopped'].includes(updates.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Validate progress percentage
    if (updates.progress_percentage !== undefined) {
      if (updates.progress_percentage < 0 || updates.progress_percentage > 100) {
        return res.status(400).json({ error: 'Progress percentage must be between 0 and 100' });
      }
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const updateQuery = `
      UPDATE projects 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, name, status, progress_percentage, updated_at
    `;

    const result = await db.query(updateQuery, values);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'project_updated', 'project', id, updates]
    );

    // Emit socket event
    const io = req.app.get('socketio');
    io.to(`project_${id}`).emit('project_updated', { project: result.rows[0], updated_by: req.user });

    res.json({
      message: 'Project updated successfully',
      project: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/projects/:id
// @desc    Delete project (Admin only)
// @access  Private (Admin only)
router.delete('/:id', validateUUID, requireRole(['administrator']), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if project exists
    const projectCheck = await db.query('SELECT name FROM projects WHERE id = $1', [id]);
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Soft delete by marking as inactive
    await db.query('UPDATE projects SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'project_deleted', 'project', id, { name: projectCheck.rows[0].name }]
    );

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/projects/:id/members
// @desc    Add team member to project
// @access  Private (Admin or Project Manager)
router.post('/:id/members', validateUUID, [
  body('user_id').isUUID(),
  body('role').optional().trim().isLength({ min: 1, max: 100 }),
  body('hourly_rate').optional().isFloat({ min: 0 })
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_id, role = 'Developer', hourly_rate } = req.body;

    // Check project access and get project manager
    const projectQuery = `
      SELECT project_manager_id, name FROM projects 
      WHERE id = $1 AND is_active = true
    `;
    const projectResult = await db.query(projectQuery, [id]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check permissions
    const isManagerOrAdmin = req.user.role === 'administrator' || 
                           projectResult.rows[0].project_manager_id === req.user.id;

    if (!isManagerOrAdmin) {
      return res.status(403).json({ error: 'Only project managers and administrators can add team members' });
    }

    // Verify user exists and is active
    const userCheck = await db.query(
      'SELECT id, first_name, last_name, email FROM users WHERE id = $1 AND is_active = true',
      [user_id]
    );
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ error: 'User not found or inactive' });
    }

    // Check if user is already a team member
    const memberCheck = await db.query(
      'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2 AND left_at IS NULL',
      [id, user_id]
    );
    if (memberCheck.rows.length > 0) {
      return res.status(409).json({ error: 'User is already a team member' });
    }

    // Add team member
    const insertQuery = `
      INSERT INTO project_members (project_id, user_id, role, hourly_rate)
      VALUES ($1, $2, $3, $4)
      RETURNING id, joined_at
    `;

    const result = await db.query(insertQuery, [id, user_id, role, hourly_rate]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'member_added', 'project', id, { 
        added_user: userCheck.rows[0].email,
        role 
      }]
    );

    // Emit socket event
    const io = req.app.get('socketio');
    io.to(`project_${id}`).emit('member_added', { 
      project_id: id,
      member: { ...userCheck.rows[0], role },
      added_by: req.user 
    });

    res.status(201).json({
      message: 'Team member added successfully',
      member: {
        ...result.rows[0],
        user: userCheck.rows[0],
        role
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/projects/:id/members/:memberId
// @desc    Remove team member from project
// @access  Private (Admin or Project Manager)
router.delete('/:id/members/:memberId', validateUUID, async (req, res, next) => {
  try {
    const { id, memberId } = req.params;

    // Check project access
    const projectQuery = `
      SELECT project_manager_id FROM projects 
      WHERE id = $1 AND is_active = true
    `;
    const projectResult = await db.query(projectQuery, [id]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check permissions
    const isManagerOrAdmin = req.user.role === 'administrator' || 
                           projectResult.rows[0].project_manager_id === req.user.id;

    if (!isManagerOrAdmin) {
      return res.status(403).json({ error: 'Only project managers and administrators can remove team members' });
    }

    // Check if member exists
    const memberQuery = `
      SELECT pm.user_id, u.email 
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.id = $1 AND pm.project_id = $2 AND pm.left_at IS NULL
    `;
    const memberResult = await db.query(memberQuery, [memberId, id]);

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    // Remove team member (soft delete)
    await db.query(
      'UPDATE project_members SET left_at = CURRENT_TIMESTAMP WHERE id = $1',
      [memberId]
    );

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'member_removed', 'project', id, { 
        removed_user: memberResult.rows[0].email 
      }]
    );

    res.json({ message: 'Team member removed successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
