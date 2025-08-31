const express = require('express');
const router = express.Router({ mergeParams: true }); // Important: merge params to access :projectId
const db = require('../config/database');
const { validateUUID } = require('../middleware/validation');
const { requireAdminOrOwner } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

// Custom validation for projectId
const validateProjectId = (req, res, next) => {
  const { projectId } = req.params;
  console.log('🔍 Validating projectId:', projectId);
  
  if (!projectId) {
    console.log('❌ Project ID missing');
    return res.status(400).json({ error: 'Project ID is required' });
  }
  
  // Simple UUID format check (more lenient)
  if (projectId.length !== 36 || !/^[0-9a-f-]+$/i.test(projectId)) {
    console.log('❌ Invalid project ID format:', projectId);
    return res.status(400).json({ error: 'Invalid project ID format' });
  }
  
  console.log('✅ Project ID validation passed');
  next();
};

// Custom validation for milestoneId 
const validateMilestoneId = (req, res, next) => {
  const { milestoneId } = req.params;
  if (!milestoneId) return next();
  
  // Simple UUID format check (more lenient)
  if (milestoneId.length !== 36 || !/^[0-9a-f-]+$/i.test(milestoneId)) {
    return res.status(400).json({ error: 'Invalid milestone ID format' });
  }
  next();
};

// @route   GET /api/projects/:projectId/milestones
// @desc    Get all milestones for a project
// @access  Private
router.get('/', validateProjectId, async (req, res, next) => {
  try {
    console.log('📋 Getting milestones for project:', req.params.projectId);
    const { projectId } = req.params;

    // Check project access
    let accessQuery = 'SELECT 1 FROM projects WHERE id = $1';
    let accessParams = [projectId];

    if (req.user.role === 'client') {
      accessQuery = `
        SELECT 1 FROM projects p
        WHERE p.id = $1 AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
        )
      `;
      accessParams = [projectId, req.user.id];
    } else if (req.user.role === 'developer') {
      accessQuery = `
        SELECT 1 FROM projects p
        WHERE p.id = $1 AND (p.project_manager_id = $2 OR EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
        ))
      `;
      accessParams = [projectId, req.user.id];
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Get milestones
    const milestonesQuery = `
      SELECT 
        id, name, description, due_date, is_completed, 
        completed_at, order_index, created_at, updated_at
      FROM milestones
      WHERE project_id = $1
      ORDER BY order_index ASC, due_date ASC
    `;

    const result = await db.query(milestonesQuery, [projectId]);

    res.json({
      milestones: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/projects/:projectId/milestones
// @desc    Create a new milestone for a project
// @access  Private (Admin, Project Manager, or Team Member)
router.post('/', validateProjectId, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name is required and must be less than 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('due_date')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('order_index')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Order index must be a positive integer')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { projectId } = req.params;
    const { name, description, due_date, order_index } = req.body;

    // Check project access and permissions
    let accessQuery = 'SELECT project_manager_id FROM projects WHERE id = $1';
    let accessParams = [projectId];

    if (req.user.role === 'client') {
      return res.status(403).json({ error: 'Clients cannot create milestones' });
    } else if (req.user.role === 'developer') {
      accessQuery = `
        SELECT project_manager_id FROM projects p
        WHERE p.id = $1 AND (p.project_manager_id = $2 OR EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
        ))
      `;
      accessParams = [projectId, req.user.id];
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Get next order index if not provided
    let finalOrderIndex = order_index;
    if (finalOrderIndex === undefined) {
      const maxOrderQuery = 'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM milestones WHERE project_id = $1';
      const maxOrderResult = await db.query(maxOrderQuery, [projectId]);
      finalOrderIndex = maxOrderResult.rows[0].next_order;
    }

    // Create milestone
    const insertQuery = `
      INSERT INTO milestones (project_id, name, description, due_date, order_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, description, due_date, is_completed, completed_at, order_index, created_at
    `;

    const values = [projectId, name, description, due_date, finalOrderIndex];
    const result = await db.query(insertQuery, values);
    const milestone = result.rows[0];

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'milestone_created', 'milestone', milestone.id, { name: milestone.name, project_id: projectId }]
    );

    // Emit socket event
    const io = req.app.get('socketio');
    if (io) {
      io.to(`project_${projectId}`).emit('milestone_created', { 
        milestone, 
        project_id: projectId,
        created_by: req.user 
      });
    }

    res.status(201).json({
      message: 'Milestone created successfully',
      milestone
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/projects/:projectId/milestones/:milestoneId
// @desc    Update a milestone
// @access  Private (Admin, Project Manager, or Team Member)
router.put('/:milestoneId', validateProjectId, validateMilestoneId, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name must be less than 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('due_date')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('is_completed')
    .optional()
    .isBoolean()
    .withMessage('is_completed must be a boolean'),
  body('order_index')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Order index must be a positive integer')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { projectId, milestoneId } = req.params;
    const { name, description, due_date, is_completed, order_index } = req.body;

    // Check milestone exists and belongs to project
    const milestoneCheck = await db.query(
      'SELECT id, is_completed FROM milestones WHERE id = $1 AND project_id = $2',
      [milestoneId, projectId]
    );

    if (milestoneCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Check project access
    let accessQuery = 'SELECT project_manager_id FROM projects WHERE id = $1';
    let accessParams = [projectId];

    if (req.user.role === 'client') {
      return res.status(403).json({ error: 'Clients cannot update milestones' });
    } else if (req.user.role === 'developer') {
      accessQuery = `
        SELECT project_manager_id FROM projects p
        WHERE p.id = $1 AND (p.project_manager_id = $2 OR EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
        ))
      `;
      accessParams = [projectId, req.user.id];
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build update fields
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (due_date !== undefined) updates.due_date = due_date;
    if (order_index !== undefined) updates.order_index = order_index;

    // Handle completion status
    const wasCompleted = milestoneCheck.rows[0].is_completed;
    if (is_completed !== undefined) {
      updates.is_completed = is_completed;
      if (is_completed && !wasCompleted) {
        updates.completed_at = 'CURRENT_TIMESTAMP';
      } else if (!is_completed && wasCompleted) {
        updates.completed_at = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => {
      if (key === 'completed_at' && updates[key] === 'CURRENT_TIMESTAMP') {
        return `${key} = CURRENT_TIMESTAMP`;
      }
      return `${key} = $${index + 3}`;
    }).join(', ');

    const values = [milestoneId, projectId];
    Object.entries(updates).forEach(([key, value]) => {
      if (!(key === 'completed_at' && value === 'CURRENT_TIMESTAMP')) {
        values.push(value);
      }
    });

    const updateQuery = `
      UPDATE milestones 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND project_id = $2
      RETURNING id, name, description, due_date, is_completed, completed_at, order_index, updated_at
    `;

    const result = await db.query(updateQuery, values);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'milestone_updated', 'milestone', milestoneId, updates]
    );

    // Emit socket event
    const io = req.app.get('socketio');
    if (io) {
      io.to(`project_${projectId}`).emit('milestone_updated', { 
        milestone: result.rows[0], 
        project_id: projectId,
        updated_by: req.user 
      });
    }

    res.json({
      message: 'Milestone updated successfully',
      milestone: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/projects/:projectId/milestones/:milestoneId
// @desc    Delete a milestone
// @access  Private (Admin or Project Manager)
router.delete('/:milestoneId', validateProjectId, validateMilestoneId, async (req, res, next) => {
  try {
    const { projectId, milestoneId } = req.params;

    // Check milestone exists and belongs to project
    const milestoneCheck = await db.query(
      'SELECT name FROM milestones WHERE id = $1 AND project_id = $2',
      [milestoneId, projectId]
    );

    if (milestoneCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Check permissions (only admin or project manager can delete)
    let hasPermission = req.user.role === 'administrator';
    
    if (!hasPermission) {
      const projectQuery = 'SELECT project_manager_id FROM projects WHERE id = $1';
      const projectResult = await db.query(projectQuery, [projectId]);
      
      if (projectResult.rows.length > 0) {
        hasPermission = projectResult.rows[0].project_manager_id === req.user.id;
      }
    }

    if (!hasPermission) {
      return res.status(403).json({ error: 'Only administrators and project managers can delete milestones' });
    }

    // Check if milestone has associated tasks
    const taskCheck = await db.query(
      'SELECT COUNT(*) as task_count FROM tasks WHERE milestone_id = $1',
      [milestoneId]
    );

    if (parseInt(taskCheck.rows[0].task_count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete milestone with associated tasks. Please reassign or delete tasks first.' 
      });
    }

    // Delete milestone
    await db.query('DELETE FROM milestones WHERE id = $1', [milestoneId]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'milestone_deleted', 'milestone', milestoneId, { 
        name: milestoneCheck.rows[0].name, 
        project_id: projectId 
      }]
    );

    // Emit socket event
    const io = req.app.get('socketio');
    if (io) {
      io.to(`project_${projectId}`).emit('milestone_deleted', { 
        milestone_id: milestoneId, 
        project_id: projectId,
        deleted_by: req.user 
      });
    }

    res.json({ message: 'Milestone deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
