const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { validateTask, validateUUID, validatePagination } = require('../middleware/validation');
const { body } = require('express-validator');

// @route   GET /api/tasks
// @desc    Get all tasks (with pagination and filters)
// @access  Private
router.get('/', validatePagination, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      priority = '',
      project_id = '',
      assigned_to = '',
      overdue = '',
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
      // Clients can only see tasks from projects in their company
      paramCount++;
      whereConditions.push(`t.project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
        )
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      // Developers can see tasks assigned to them or from projects they're part of
      paramCount++;
      whereConditions.push(`(t.assigned_to = $${paramCount} OR t.project_id IN (
        SELECT DISTINCT pm.project_id FROM project_members pm WHERE pm.user_id = $${paramCount}
        UNION
        SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $${paramCount}
      ))`);
      queryParams.push(req.user.id);
    }
    // Administrators can see all tasks

    if (search) {
      paramCount++;
      whereConditions.push(`(t.title ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }

    if (status && ['new', 'in_progress', 'completed', 'canceled'].includes(status)) {
      paramCount++;
      whereConditions.push(`t.status = $${paramCount}`);
      queryParams.push(status);
    }

    if (priority && ['low', 'medium', 'high'].includes(priority)) {
      paramCount++;
      whereConditions.push(`t.priority = $${paramCount}`);
      queryParams.push(priority);
    }

    if (project_id) {
      paramCount++;
      whereConditions.push(`t.project_id = $${paramCount}`);
      queryParams.push(project_id);
    }

    if (assigned_to) {
      paramCount++;
      whereConditions.push(`t.assigned_to = $${paramCount}`);
      queryParams.push(assigned_to);
    }

    if (overdue === 'true') {
      whereConditions.push(`t.due_date < CURRENT_DATE AND t.status != 'completed'`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM tasks t
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const totalTasks = parseInt(countResult.rows[0].count);

    // Get tasks with related data
    const tasksQuery = `
      SELECT 
        t.id, t.title, t.description, t.priority, t.status,
        t.estimated_hours, t.actual_hours, t.due_date,
        t.started_at, t.completed_at, t.created_at, t.updated_at,
        p.name as project_name, p.id as project_id,
        assigned_user.first_name || ' ' || assigned_user.last_name as assigned_to_name,
        assigned_user.id as assigned_to_id,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        creator.id as created_by_id,
        m.name as milestone_name, m.id as milestone_id
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN milestones m ON t.milestone_id = m.id
      ${whereClause}
      ORDER BY 
        CASE WHEN t.priority = 'high' THEN 1 WHEN t.priority = 'medium' THEN 2 ELSE 3 END,
        t.${sort} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(tasksQuery, queryParams);

    const totalPages = Math.ceil(totalTasks / limit);

    res.json({
      tasks: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_tasks: totalTasks,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/tasks/:id
// @desc    Get task by ID
// @access  Private
router.get('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check task access based on user role
    let accessQuery = 'SELECT 1 FROM tasks t WHERE t.id = $1';
    let accessParams = [id];

    if (req.user.role === 'client') {
      accessQuery = `
        SELECT 1 FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.id = $1 AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
        )
      `;
      accessParams = [id, req.user.id];
    } else if (req.user.role === 'developer') {
      accessQuery = `
        SELECT 1 FROM tasks t
        WHERE t.id = $1 AND (t.assigned_to = $2 OR t.project_id IN (
          SELECT DISTINCT pm.project_id FROM project_members pm WHERE pm.user_id = $2
          UNION
          SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $2
        ))
      `;
      accessParams = [id, req.user.id];
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get task details
    const taskQuery = `
      SELECT 
        t.id, t.title, t.description, t.priority, t.status,
        t.estimated_hours, t.actual_hours, t.due_date, t.order_index,
        t.started_at, t.completed_at, t.created_at, t.updated_at,
        p.name as project_name, p.id as project_id,
        assigned_user.first_name || ' ' || assigned_user.last_name as assigned_to_name,
        assigned_user.id as assigned_to_id, assigned_user.email as assigned_to_email,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        creator.id as created_by_id,
        m.name as milestone_name, m.id as milestone_id, m.due_date as milestone_due_date
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN milestones m ON t.milestone_id = m.id
      WHERE t.id = $1
    `;

    const taskResult = await db.query(taskQuery, [id]);
    const task = taskResult.rows[0];

    // Get task dependencies
    const dependenciesQuery = `
      SELECT 
        td.id, td.depends_on_task_id,
        dep_task.title as depends_on_title,
        dep_task.status as depends_on_status
      FROM task_dependencies td
      JOIN tasks dep_task ON td.depends_on_task_id = dep_task.id
      WHERE td.task_id = $1
    `;

    const dependenciesResult = await db.query(dependenciesQuery, [id]);

    // Get tasks that depend on this task
    const dependentsQuery = `
      SELECT 
        td.id, td.task_id,
        dep_task.title as dependent_title,
        dep_task.status as dependent_status
      FROM task_dependencies td
      JOIN tasks dep_task ON td.task_id = dep_task.id
      WHERE td.depends_on_task_id = $1
    `;

    const dependentsResult = await db.query(dependentsQuery, [id]);

    // Get time entries for this task
    const timeQuery = `
      SELECT 
        te.id, te.description, te.hours_worked, te.date_worked,
        te.start_time, te.end_time, te.is_billable,
        u.first_name || ' ' || u.last_name as user_name
      FROM time_entries te
      JOIN users u ON te.user_id = u.id
      WHERE te.task_id = $1
      ORDER BY te.date_worked DESC, te.start_time DESC
    `;

    const timeResult = await db.query(timeQuery, [id]);

    res.json({
      task: {
        ...task,
        dependencies: dependenciesResult.rows,
        dependents: dependentsResult.rows,
        time_entries: timeResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/tasks
// @desc    Create new task
// @access  Private (Admin, Project Manager, or Team Member)
router.post('/', validateTask, async (req, res, next) => {
  try {
    const {
      title,
      description,
      project_id,
      milestone_id,
      assigned_to,
      priority = 'medium',
      estimated_hours,
      due_date
    } = req.body;

    // Check project access
    let accessQuery = 'SELECT id, name FROM projects WHERE id = $1 AND is_active = true';
    let accessParams = [project_id];

    if (req.user.role === 'developer') {
      accessQuery = `
        SELECT p.id, p.name FROM projects p
        WHERE p.id = $1 AND p.is_active = true AND (
          p.project_manager_id = $2 OR EXISTS (
            SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
          )
        )
      `;
      accessParams = [project_id, req.user.id];
    }

    const projectResult = await db.query(accessQuery, accessParams);
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project not found or access denied' });
    }

    // Verify milestone belongs to project (if provided)
    if (milestone_id) {
      const milestoneCheck = await db.query(
        'SELECT id FROM milestones WHERE id = $1 AND project_id = $2',
        [milestone_id, project_id]
      );
      if (milestoneCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Milestone not found in this project' });
      }
    }

    // Verify assigned user exists and has access to project (if provided)
    if (assigned_to) {
      const assigneeCheck = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email FROM users u
         WHERE u.id = $1 AND u.is_active = true AND (
           u.role = 'administrator' OR
           EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $2 AND pm.user_id = u.id) OR
           EXISTS (SELECT 1 FROM projects p WHERE p.id = $2 AND p.project_manager_id = u.id)
         )`,
        [assigned_to, project_id]
      );
      if (assigneeCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned user not found or not part of project' });
      }
    }

    // Create task
    const insertQuery = `
      INSERT INTO tasks (
        title, description, project_id, milestone_id, assigned_to,
        created_by, priority, estimated_hours, due_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, title, status, created_at
    `;

    const values = [
      title, description, project_id, milestone_id, assigned_to,
      req.user.id, priority, estimated_hours, due_date
    ];

    const result = await db.query(insertQuery, values);
    const task = result.rows[0];

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'task_created', 'task', task.id, { 
        title: task.title,
        project_id,
        assigned_to 
      }]
    );

    // Send notification to assigned user
    if (assigned_to && assigned_to !== req.user.id) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          assigned_to,
          'task_assigned',
          'New Task Assigned',
          `You have been assigned a new task: ${title}`,
          JSON.stringify({ task_id: task.id, project_id, assigned_by: req.user.id })
        ]
      );
    }

    // Emit socket event
    const io = req.app.get('socketio');
    io.to(`project_${project_id}`).emit('task_created', { 
      task, 
      created_by: req.user,
      project_name: projectResult.rows[0].name
    });

    res.status(201).json({
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      priority,
      status,
      estimated_hours,
      actual_hours,
      due_date,
      assigned_to
    } = req.body;

    // Check task access and get current task info
    let accessQuery = `
      SELECT t.*, p.name as project_name FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `;
    let accessParams = [id];

    if (req.user.role === 'developer') {
      accessQuery = `
        SELECT t.*, p.name as project_name FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.id = $1 AND (
          t.assigned_to = $2 OR
          t.created_by = $2 OR
          p.project_manager_id = $2 OR
          EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2)
        )
      `;
      accessParams = [id, req.user.id];
    } else if (req.user.role === 'client') {
      accessQuery = `
        SELECT t.*, p.name as project_name FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.id = $1 AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
        )
      `;
      accessParams = [id, req.user.id];
    }

    const taskResult = await db.query(accessQuery, accessParams);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    const currentTask = taskResult.rows[0];

    // Clients can only update their own tasks and limited fields
    let allowedFields = ['title', 'description', 'actual_hours'];
    
    if (req.user.role !== 'client') {
      allowedFields = ['title', 'description', 'priority', 'status', 'estimated_hours', 'actual_hours', 'due_date'];
      
      // Only admin, project manager, or task creator can reassign tasks
      const canReassign = req.user.role === 'administrator' || 
                         currentTask.project_manager_id === req.user.id ||
                         currentTask.created_by === req.user.id;
      
      if (canReassign) {
        allowedFields.push('assigned_to');
      }
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
    if (updates.status && !['new', 'in_progress', 'completed', 'canceled'].includes(updates.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Validate priority
    if (updates.priority && !['low', 'medium', 'high'].includes(updates.priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    // Handle status changes
    if (updates.status && updates.status !== currentTask.status) {
      if (updates.status === 'in_progress' && !currentTask.started_at) {
        updates.started_at = new Date();
      } else if (updates.status === 'completed' && !currentTask.completed_at) {
        updates.completed_at = new Date();
      } else if (updates.status === 'new') {
        updates.started_at = null;
        updates.completed_at = null;
      }
    }

    // Verify assigned user if changing assignment
    if (updates.assigned_to && updates.assigned_to !== currentTask.assigned_to) {
      const assigneeCheck = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email FROM users u
         WHERE u.id = $1 AND u.is_active = true AND (
           u.role = 'administrator' OR
           EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $2 AND pm.user_id = u.id) OR
           EXISTS (SELECT 1 FROM projects p WHERE p.id = $2 AND p.project_manager_id = u.id)
         )`,
        [updates.assigned_to, currentTask.project_id]
      );
      if (assigneeCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned user not found or not part of project' });
      }
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const updateQuery = `
      UPDATE tasks 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, status, priority, assigned_to, updated_at
    `;

    const result = await db.query(updateQuery, values);
    const updatedTask = result.rows[0];

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'task_updated', 'task', id, updates]
    );

    // Send notifications for status changes or reassignments
    if (updates.status && updates.status !== currentTask.status) {
      // Notify project team about status change
      const teamQuery = `
        SELECT DISTINCT u.id FROM users u
        WHERE u.id IN (
          SELECT pm.user_id FROM project_members pm WHERE pm.project_id = $1
          UNION
          SELECT p.project_manager_id FROM projects p WHERE p.id = $1
        ) AND u.id != $2
      `;
      
      const teamResult = await db.query(teamQuery, [currentTask.project_id, req.user.id]);
      
      for (const member of teamResult.rows) {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            member.id,
            'task_status_changed',
            'Task Status Updated',
            `Task "${currentTask.title}" status changed to ${updates.status}`,
            JSON.stringify({ 
              task_id: id, 
              old_status: currentTask.status, 
              new_status: updates.status,
              updated_by: req.user.id 
            })
          ]
        );
      }
    }

    if (updates.assigned_to && updates.assigned_to !== currentTask.assigned_to) {
      // Notify new assignee
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          updates.assigned_to,
          'task_assigned',
          'Task Assigned to You',
          `You have been assigned to task: ${currentTask.title}`,
          JSON.stringify({ task_id: id, assigned_by: req.user.id })
        ]
      );
    }

    // Emit socket event
    const io = req.app.get('socketio');
    io.to(`project_${currentTask.project_id}`).emit('task_updated', { 
      task: updatedTask,
      updated_by: req.user,
      changes: updates
    });

    res.json({
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete task
// @access  Private (Admin, Project Manager, or Task Creator)
router.delete('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check task access
    let accessQuery = `
      SELECT t.title, t.project_id, p.project_manager_id FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `;
    let accessParams = [id];

    if (req.user.role !== 'administrator') {
      accessQuery = `
        SELECT t.title, t.project_id, p.project_manager_id FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.id = $1 AND (
          t.created_by = $2 OR p.project_manager_id = $2
        )
      `;
      accessParams = [id, req.user.id];
    }

    const taskResult = await db.query(accessQuery, accessParams);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    const task = taskResult.rows[0];

    // Delete task (this will cascade to dependencies and time entries)
    await db.query('DELETE FROM tasks WHERE id = $1', [id]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'task_deleted', 'task', id, { title: task.title }]
    );

    // Emit socket event
    const io = req.app.get('socketio');
    io.to(`project_${task.project_id}`).emit('task_deleted', { 
      task_id: id,
      title: task.title,
      deleted_by: req.user
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/tasks/:id/dependencies
// @desc    Add task dependency
// @access  Private (Admin, Project Manager, or Team Member)
router.post('/:id/dependencies', validateUUID, [
  body('depends_on_task_id').isUUID()
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { depends_on_task_id } = req.body;

    if (id === depends_on_task_id) {
      return res.status(400).json({ error: 'Task cannot depend on itself' });
    }

    // Check access to both tasks
    const accessQuery = `
      SELECT t1.id as task_id, t1.project_id as task_project_id,
             t2.id as depends_on_id, t2.project_id as depends_on_project_id
      FROM tasks t1, tasks t2
      WHERE t1.id = $1 AND t2.id = $2
    `;

    const result = await db.query(accessQuery, [id, depends_on_task_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'One or both tasks not found' });
    }

    // Tasks must be in the same project
    const { task_project_id, depends_on_project_id } = result.rows[0];
    if (task_project_id !== depends_on_project_id) {
      return res.status(400).json({ error: 'Tasks must be in the same project' });
    }

    // Check if dependency already exists
    const existingDep = await db.query(
      'SELECT id FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
      [id, depends_on_task_id]
    );

    if (existingDep.rows.length > 0) {
      return res.status(409).json({ error: 'Dependency already exists' });
    }

    // Add dependency
    await db.query(
      'INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)',
      [id, depends_on_task_id]
    );

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'task_dependency_added', 'task', id, { depends_on_task_id }]
    );

    res.status(201).json({ message: 'Task dependency added successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/tasks/:id/dependencies/:dependencyId
// @desc    Remove task dependency
// @access  Private (Admin, Project Manager, or Team Member)
router.delete('/:id/dependencies/:dependencyId', validateUUID, async (req, res, next) => {
  try {
    const { id, dependencyId } = req.params;

    // Check if dependency exists
    const depResult = await db.query(
      'SELECT depends_on_task_id FROM task_dependencies WHERE id = $1 AND task_id = $2',
      [dependencyId, id]
    );

    if (depResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dependency not found' });
    }

    // Remove dependency
    await db.query('DELETE FROM task_dependencies WHERE id = $1', [dependencyId]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'task_dependency_removed', 'task', id, { 
        dependency_id: dependencyId,
        depends_on_task_id: depResult.rows[0].depends_on_task_id 
      }]
    );

    res.json({ message: 'Task dependency removed successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
