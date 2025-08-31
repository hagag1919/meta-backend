const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { validateTimeEntry, validateUUID, validatePagination } = require('../middleware/validation');

// @route   GET /api/time
// @desc    Get time entries (with pagination and filters)
// @access  Private
router.get('/', validatePagination, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      project_id = '',
      task_id = '',
      user_id = '',
      start_date = '',
      end_date = '',
      is_billable = '',
      sort = 'date_worked',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Build WHERE clause based on user role
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'client') {
      // Clients can only see time entries from their company projects
      paramCount++;
      whereConditions.push(`te.project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
        )
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      // Developers can see their own time entries or entries from projects they manage/are part of
      paramCount++;
      whereConditions.push(`(te.user_id = $${paramCount} OR te.project_id IN (
        SELECT DISTINCT pm.project_id FROM project_members pm WHERE pm.user_id = $${paramCount}
        UNION
        SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $${paramCount}
      ))`);
      queryParams.push(req.user.id);
    }
    // Administrators can see all time entries

    if (project_id) {
      paramCount++;
      whereConditions.push(`te.project_id = $${paramCount}`);
      queryParams.push(project_id);
    }

    if (task_id) {
      paramCount++;
      whereConditions.push(`te.task_id = $${paramCount}`);
      queryParams.push(task_id);
    }

    if (user_id) {
      paramCount++;
      whereConditions.push(`te.user_id = $${paramCount}`);
      queryParams.push(user_id);
    }

    if (start_date) {
      paramCount++;
      whereConditions.push(`te.date_worked >= $${paramCount}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`te.date_worked <= $${paramCount}`);
      queryParams.push(end_date);
    }

    if (is_billable !== '') {
      paramCount++;
      whereConditions.push(`te.is_billable = $${paramCount}`);
      queryParams.push(is_billable === 'true');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM time_entries te
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const totalEntries = parseInt(countResult.rows[0].count);

    // Get time entries with related data
    const entriesQuery = `
      SELECT 
        te.id, te.description, te.hours_worked, te.hourly_rate,
        te.date_worked, te.start_time, te.end_time, te.is_billable,
        te.is_invoiced, te.created_at, te.updated_at,
        p.name as project_name, p.id as project_id,
        t.title as task_title, t.id as task_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.id as user_id
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      LEFT JOIN tasks t ON te.task_id = t.id
      LEFT JOIN users u ON te.user_id = u.id
      ${whereClause}
      ORDER BY te.${sort} ${order}, te.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(entriesQuery, queryParams);

    // Calculate totals
    const totalsQuery = `
      SELECT 
        SUM(te.hours_worked) as total_hours,
        SUM(te.hours_worked * COALESCE(te.hourly_rate, 0)) as total_amount,
        SUM(te.hours_worked) FILTER (WHERE te.is_billable = true) as billable_hours,
        SUM(te.hours_worked * COALESCE(te.hourly_rate, 0)) FILTER (WHERE te.is_billable = true) as billable_amount
      FROM time_entries te
      ${whereClause}
    `;

    const totalsResult = await db.query(totalsQuery, queryParams.slice(0, paramCount));

    const totalPages = Math.ceil(totalEntries / limit);

    res.json({
      time_entries: result.rows,
      totals: totalsResult.rows[0],
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_entries: totalEntries,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/time/:id
// @desc    Get time entry by ID
// @access  Private
router.get('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check time entry access based on user role
    let accessQuery = `
      SELECT 
        te.id, te.description, te.hours_worked, te.hourly_rate,
        te.date_worked, te.start_time, te.end_time, te.is_billable,
        te.is_invoiced, te.created_at, te.updated_at,
        p.name as project_name, p.id as project_id, p.company_id,
        t.title as task_title, t.id as task_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.id as user_id
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      LEFT JOIN tasks t ON te.task_id = t.id
      LEFT JOIN users u ON te.user_id = u.id
      WHERE te.id = $1
    `;
    let accessParams = [id];

    if (req.user.role === 'client') {
      accessQuery += ` AND p.company_id IN (
        SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
      )`;
      accessParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      accessQuery += ` AND (te.user_id = $2 OR te.project_id IN (
        SELECT DISTINCT pm.project_id FROM project_members pm WHERE pm.user_id = $2
        UNION
        SELECT DISTINCT p2.id FROM projects p2 WHERE p2.project_manager_id = $2
      ))`;
      accessParams.push(req.user.id);
    }

    const result = await db.query(accessQuery, accessParams);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    res.json({ time_entry: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/time
// @desc    Create new time entry
// @access  Private (Admin and Developer)
router.post('/', requireRole(['administrator', 'developer']), validateTimeEntry, async (req, res, next) => {
  try {
    const {
      project_id,
      task_id,
      description,
      hours_worked,
      hourly_rate,
      date_worked,
      start_time,
      end_time,
      is_billable = true,
      user_id
    } = req.body;

    // Determine the user for the time entry
    const entryUserId = user_id || req.user.id;

    // Only admins can create time entries for other users
    if (user_id && user_id !== req.user.id && req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can create time entries for other users' });
    }

    // Verify project exists and user has access
    let projectAccessQuery = 'SELECT id, name FROM projects WHERE id = $1 AND is_active = true';
    let projectAccessParams = [project_id];

    if (req.user.role === 'developer') {
      projectAccessQuery = `
        SELECT p.id, p.name FROM projects p
        WHERE p.id = $1 AND p.is_active = true AND (
          p.project_manager_id = $2 OR EXISTS (
            SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
          )
        )
      `;
      projectAccessParams = [project_id, req.user.id];
    }

    const projectResult = await db.query(projectAccessQuery, projectAccessParams);
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project not found or access denied' });
    }

    // Verify task belongs to project (if provided)
    if (task_id) {
      const taskCheck = await db.query(
        'SELECT id, title FROM tasks WHERE id = $1 AND project_id = $2',
        [task_id, project_id]
      );
      if (taskCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Task not found in this project' });
      }
    }

    // Verify user exists and is active (if different from current user)
    if (entryUserId !== req.user.id) {
      const userCheck = await db.query(
        'SELECT id FROM users WHERE id = $1 AND is_active = true',
        [entryUserId]
      );
      if (userCheck.rows.length === 0) {
        return res.status(400).json({ error: 'User not found or inactive' });
      }
    }

    // Get hourly rate from project member if not provided
    let finalHourlyRate = hourly_rate;
    if (!finalHourlyRate) {
      const rateQuery = `
        SELECT hourly_rate FROM project_members 
        WHERE project_id = $1 AND user_id = $2 AND left_at IS NULL
      `;
      const rateResult = await db.query(rateQuery, [project_id, entryUserId]);
      if (rateResult.rows.length > 0) {
        finalHourlyRate = rateResult.rows[0].hourly_rate;
      }
    }

    // Create time entry
    const insertQuery = `
      INSERT INTO time_entries (
        user_id, project_id, task_id, description, hours_worked,
        hourly_rate, date_worked, start_time, end_time, is_billable
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, hours_worked, date_worked, created_at
    `;

    const values = [
      entryUserId, project_id, task_id, description, hours_worked,
      finalHourlyRate, date_worked, start_time, end_time, is_billable
    ];

    const result = await db.query(insertQuery, values);
    const timeEntry = result.rows[0];

    // Update task actual hours if task_id provided
    if (task_id) {
      await db.query(
        'UPDATE tasks SET actual_hours = COALESCE(actual_hours, 0) + $1 WHERE id = $2',
        [hours_worked, task_id]
      );
    }

    // Update project actual hours
    await db.query(
      'UPDATE projects SET actual_hours = COALESCE(actual_hours, 0) + $1 WHERE id = $2',
      [hours_worked, project_id]
    );

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'time_entry_created', 'project', project_id, { 
        time_entry_id: timeEntry.id,
        hours_worked,
        for_user: entryUserId,
        task_id 
      }]
    );

    res.status(201).json({
      message: 'Time entry created successfully',
      time_entry: timeEntry
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/time/:id
// @desc    Update time entry
// @access  Private (Owner, Admin, or Project Manager)
router.put('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      description,
      hours_worked,
      hourly_rate,
      date_worked,
      start_time,
      end_time,
      is_billable
    } = req.body;

    // Check time entry access and get current data
    let accessQuery = `
      SELECT te.*, p.project_manager_id, t.project_id as task_project_id
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      LEFT JOIN tasks t ON te.task_id = t.id
      WHERE te.id = $1
    `;
    let accessParams = [id];

    if (req.user.role !== 'administrator') {
      accessQuery += ` AND (te.user_id = $2 OR p.project_manager_id = $2)`;
      accessParams.push(req.user.id);
    }

    const timeEntryResult = await db.query(accessQuery, accessParams);
    if (timeEntryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found or access denied' });
    }

    const currentEntry = timeEntryResult.rows[0];

    // Check if entry is already invoiced
    if (currentEntry.is_invoiced) {
      return res.status(400).json({ error: 'Cannot update invoiced time entry' });
    }

    // Filter allowed fields
    const allowedFields = ['description', 'hours_worked', 'hourly_rate', 'date_worked', 'start_time', 'end_time', 'is_billable'];
    const updates = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Validate hours_worked if provided
    if (updates.hours_worked !== undefined && (updates.hours_worked <= 0 || updates.hours_worked > 24)) {
      return res.status(400).json({ error: 'Hours worked must be between 0.1 and 24' });
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const updateQuery = `
      UPDATE time_entries 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, hours_worked, date_worked, updated_at
    `;

    const result = await db.query(updateQuery, values);

    // Update task/project hours if hours_worked changed
    if (updates.hours_worked !== undefined) {
      const hoursDifference = updates.hours_worked - currentEntry.hours_worked;
      
      if (currentEntry.task_id) {
        await db.query(
          'UPDATE tasks SET actual_hours = COALESCE(actual_hours, 0) + $1 WHERE id = $2',
          [hoursDifference, currentEntry.task_id]
        );
      }

      await db.query(
        'UPDATE projects SET actual_hours = COALESCE(actual_hours, 0) + $1 WHERE id = $2',
        [hoursDifference, currentEntry.project_id]
      );
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'time_entry_updated', 'time_entry', id, updates]
    );

    res.json({
      message: 'Time entry updated successfully',
      time_entry: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/time/:id
// @desc    Delete time entry
// @access  Private (Owner, Admin, or Project Manager)
router.delete('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check time entry access
    let accessQuery = `
      SELECT te.*, p.project_manager_id
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      WHERE te.id = $1
    `;
    let accessParams = [id];

    if (req.user.role !== 'administrator') {
      accessQuery += ` AND (te.user_id = $2 OR p.project_manager_id = $2)`;
      accessParams.push(req.user.id);
    }

    const timeEntryResult = await db.query(accessQuery, accessParams);
    if (timeEntryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found or access denied' });
    }

    const entry = timeEntryResult.rows[0];

    // Check if entry is already invoiced
    if (entry.is_invoiced) {
      return res.status(400).json({ error: 'Cannot delete invoiced time entry' });
    }

    // Delete time entry
    await db.query('DELETE FROM time_entries WHERE id = $1', [id]);

    // Update task/project hours
    if (entry.task_id) {
      await db.query(
        'UPDATE tasks SET actual_hours = GREATEST(COALESCE(actual_hours, 0) - $1, 0) WHERE id = $2',
        [entry.hours_worked, entry.task_id]
      );
    }

    await db.query(
      'UPDATE projects SET actual_hours = GREATEST(COALESCE(actual_hours, 0) - $1, 0) WHERE id = $2',
      [entry.hours_worked, entry.project_id]
    );

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'time_entry_deleted', 'time_entry', id, { 
        hours_worked: entry.hours_worked,
        date_worked: entry.date_worked 
      }]
    );

    res.json({ message: 'Time entry deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/time/stats/summary
// @desc    Get time tracking statistics
// @access  Private
router.get('/stats/summary', async (req, res, next) => {
  try {
    const { 
      project_id = '', 
      user_id = '', 
      start_date = '', 
      end_date = '' 
    } = req.query;

    // Build WHERE clause based on user role and filters
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'client') {
      paramCount++;
      whereConditions.push(`te.project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
        )
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      paramCount++;
      whereConditions.push(`(te.user_id = $${paramCount} OR te.project_id IN (
        SELECT DISTINCT pm.project_id FROM project_members pm WHERE pm.user_id = $${paramCount}
        UNION
        SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $${paramCount}
      ))`);
      queryParams.push(req.user.id);
    }

    if (project_id) {
      paramCount++;
      whereConditions.push(`te.project_id = $${paramCount}`);
      queryParams.push(project_id);
    }

    if (user_id) {
      paramCount++;
      whereConditions.push(`te.user_id = $${paramCount}`);
      queryParams.push(user_id);
    }

    if (start_date) {
      paramCount++;
      whereConditions.push(`te.date_worked >= $${paramCount}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`te.date_worked <= $${paramCount}`);
      queryParams.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get time statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_entries,
        SUM(te.hours_worked) as total_hours,
        SUM(te.hours_worked) FILTER (WHERE te.is_billable = true) as billable_hours,
        SUM(te.hours_worked) FILTER (WHERE te.is_billable = false) as non_billable_hours,
        SUM(te.hours_worked * COALESCE(te.hourly_rate, 0)) as total_amount,
        SUM(te.hours_worked * COALESCE(te.hourly_rate, 0)) FILTER (WHERE te.is_billable = true) as billable_amount,
        AVG(te.hours_worked) as avg_hours_per_entry,
        COUNT(DISTINCT te.user_id) as unique_users,
        COUNT(DISTINCT te.project_id) as unique_projects,
        COUNT(DISTINCT te.date_worked) as unique_days
      FROM time_entries te
      ${whereClause}
    `;

    const statsResult = await db.query(statsQuery, queryParams);

    // Get daily breakdown for the last 30 days
    const dailyQuery = `
      SELECT 
        te.date_worked,
        SUM(te.hours_worked) as daily_hours,
        COUNT(*) as daily_entries
      FROM time_entries te
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} te.date_worked >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY te.date_worked
      ORDER BY te.date_worked DESC
      LIMIT 30
    `;

    const dailyResult = await db.query(dailyQuery, queryParams);

    res.json({
      summary: statsResult.rows[0],
      daily_breakdown: dailyResult.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
