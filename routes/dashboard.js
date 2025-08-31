const express = require('express');
const router = express.Router();
const db = require('../config/database');

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics
// @access  Private
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let stats = {};

    if (userRole === 'administrator') {
      // Admin sees all statistics
      const adminStatsQuery = `
        SELECT 
          -- Project stats
          COUNT(DISTINCT p.id) as total_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ongoing') as ongoing_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'completed') as completed_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'planning') as planning_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'stopped') as stopped_projects,
          
          -- Task stats
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'new') as new_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'in_progress') as in_progress_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'completed') as overdue_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.priority = 'high') as high_priority_tasks,
          
          -- User stats
          COUNT(DISTINCT u.id) as total_users,
          COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true) as active_users,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'developer') as developers,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'client') as clients,
          
          -- Company stats
          COUNT(DISTINCT c.id) as total_companies,
          COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true) as active_companies,
          
          -- Financial stats
          SUM(p.budget) as total_budget,
          SUM(i.total_amount) FILTER (WHERE i.status = 'paid') as total_revenue,
          SUM(i.total_amount) FILTER (WHERE i.status = 'pending') as pending_invoices,
          SUM(i.total_amount) FILTER (WHERE i.status = 'overdue') as overdue_invoices
          
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN users u ON u.is_active = true
        LEFT JOIN companies c ON c.id = p.company_id
        LEFT JOIN invoices i ON p.id = i.project_id
        WHERE p.is_active = true
      `;

      const adminResult = await db.query(adminStatsQuery);
      stats = adminResult.rows[0];

    } else if (userRole === 'developer') {
      // Developer sees projects they're involved in
      const developerStatsQuery = `
        SELECT 
          -- Project stats (projects where user is manager or member)
          COUNT(DISTINCT p.id) as total_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ongoing') as ongoing_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'completed') as completed_projects,
          
          -- Task stats (tasks assigned to user or in their projects)
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.assigned_to = $1) as assigned_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.assigned_to = $1 AND t.status = 'new') as new_assigned_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.assigned_to = $1 AND t.status = 'in_progress') as in_progress_assigned_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.assigned_to = $1 AND t.status = 'completed') as completed_assigned_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.assigned_to = $1 AND t.due_date < CURRENT_DATE AND t.status != 'completed') as overdue_assigned_tasks,
          
          -- Time tracking
          SUM(te.hours_worked) FILTER (WHERE te.user_id = $1 AND te.date_worked >= CURRENT_DATE - INTERVAL '30 days') as hours_this_month,
          SUM(te.hours_worked) FILTER (WHERE te.user_id = $1 AND te.date_worked >= CURRENT_DATE - INTERVAL '7 days') as hours_this_week
          
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN time_entries te ON t.id = te.task_id
        WHERE p.is_active = true AND (
          p.project_manager_id = $1 OR 
          EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1 AND pm.left_at IS NULL)
        )
      `;

      const developerResult = await db.query(developerStatsQuery, [userId]);
      stats = developerResult.rows[0];

    } else if (userRole === 'client') {
      // Client sees only their company's projects
      const clientStatsQuery = `
        SELECT 
          -- Project stats (company projects)
          COUNT(DISTINCT p.id) as total_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'ongoing') as ongoing_projects,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'completed') as completed_projects,
          
          -- Task stats (tasks in company projects)
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'completed') as overdue_tasks,
          
          -- Financial stats
          SUM(p.budget) as total_budget,
          SUM(i.total_amount) FILTER (WHERE i.status = 'paid') as total_paid,
          SUM(i.total_amount) FILTER (WHERE i.status = 'pending') as pending_invoices
          
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN invoices i ON p.id = i.project_id
        WHERE p.is_active = true AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $1
        )
      `;

      const clientResult = await db.query(clientStatsQuery, [userId]);
      stats = clientResult.rows[0];
    }

    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/dashboard/recent-activity
// @desc    Get recent activity
// @access  Private
router.get('/recent-activity', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let activityQuery;
    let queryParams = [limit];

    if (userRole === 'administrator') {
      // Admin sees all activity
      activityQuery = `
        SELECT 
          al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
          u.first_name || ' ' || u.last_name as user_name,
          u.id as user_id
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT $1
      `;
    } else if (userRole === 'developer') {
      // Developer sees activity from their projects
      activityQuery = `
        SELECT 
          al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
          u.first_name || ' ' || u.last_name as user_name,
          u.id as user_id
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 
          al.user_id = $2 OR
          (al.entity_type = 'project' AND al.entity_id IN (
            SELECT p.id FROM projects p 
            WHERE p.project_manager_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
            )
          )) OR
          (al.entity_type = 'task' AND al.entity_id IN (
            SELECT t.id FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE t.assigned_to = $2 OR p.project_manager_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
            )
          ))
        ORDER BY al.created_at DESC
        LIMIT $1
      `;
      queryParams.push(userId);
    } else {
      // Client sees activity from their company projects
      activityQuery = `
        SELECT 
          al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
          u.first_name || ' ' || u.last_name as user_name,
          u.id as user_id
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 
          (al.entity_type = 'project' AND al.entity_id IN (
            SELECT p.id FROM projects p 
            WHERE p.company_id IN (
              SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
            )
          )) OR
          (al.entity_type = 'task' AND al.entity_id IN (
            SELECT t.id FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE p.company_id IN (
              SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
            )
          ))
        ORDER BY al.created_at DESC
        LIMIT $1
      `;
      queryParams.push(userId);
    }

    const result = await db.query(activityQuery, queryParams);

    res.json({ activities: result.rows });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/dashboard/active-projects
// @desc    Get active projects for dashboard
// @access  Private
router.get('/active-projects', async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let projectsQuery;
    let queryParams = [limit];

    if (userRole === 'administrator') {
      projectsQuery = `
        SELECT 
          p.id, p.name, p.status, p.progress_percentage,
          c.name as company_name,
          u.first_name || ' ' || u.last_name as project_manager_name,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          COUNT(DISTINCT pm.user_id) as team_size
        FROM projects p
        LEFT JOIN companies c ON p.company_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.left_at IS NULL
        WHERE p.is_active = true AND p.status IN ('ongoing', 'planning')
        GROUP BY p.id, c.name, u.first_name, u.last_name
        ORDER BY p.created_at DESC
        LIMIT $1
      `;
    } else if (userRole === 'developer') {
      projectsQuery = `
        SELECT 
          p.id, p.name, p.status, p.progress_percentage,
          c.name as company_name,
          u.first_name || ' ' || u.last_name as project_manager_name,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          COUNT(DISTINCT pm.user_id) as team_size
        FROM projects p
        LEFT JOIN companies c ON p.company_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN tasks t ON p.id = t.project_id
        LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.left_at IS NULL
        WHERE p.is_active = true AND p.status IN ('ongoing', 'planning') AND (
          p.project_manager_id = $2 OR EXISTS (
            SELECT 1 FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.user_id = $2
          )
        )
        GROUP BY p.id, c.name, u.first_name, u.last_name
        ORDER BY p.created_at DESC
        LIMIT $1
      `;
      queryParams.push(userId);
    } else {
      projectsQuery = `
        SELECT 
          p.id, p.name, p.status, p.progress_percentage,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        WHERE p.is_active = true AND p.status IN ('ongoing', 'planning') AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
        )
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT $1
      `;
      queryParams.push(userId);
    }

    const result = await db.query(projectsQuery, queryParams);

    res.json({ projects: result.rows });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/dashboard/upcoming-tasks
// @desc    Get upcoming tasks for dashboard
// @access  Private
router.get('/upcoming-tasks', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let tasksQuery;
    let queryParams = [limit];

    if (userRole === 'administrator') {
      tasksQuery = `
        SELECT 
          t.id, t.title, t.priority, t.status, t.due_date,
          p.name as project_name, p.id as project_id,
          u.first_name || ' ' || u.last_name as assigned_to_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.due_date IS NOT NULL AND t.status != 'completed'
        ORDER BY t.due_date ASC, t.priority DESC
        LIMIT $1
      `;
    } else if (userRole === 'developer') {
      tasksQuery = `
        SELECT 
          t.id, t.title, t.priority, t.status, t.due_date,
          p.name as project_name, p.id as project_id
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.due_date IS NOT NULL AND t.status != 'completed' AND (
          t.assigned_to = $2 OR 
          p.project_manager_id = $2 OR 
          EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2)
        )
        ORDER BY 
          CASE WHEN t.assigned_to = $2 THEN 0 ELSE 1 END,
          t.due_date ASC, 
          t.priority DESC
        LIMIT $1
      `;
      queryParams.push(userId);
    } else {
      tasksQuery = `
        SELECT 
          t.id, t.title, t.priority, t.status, t.due_date,
          p.name as project_name, p.id as project_id,
          u.first_name || ' ' || u.last_name as assigned_to_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.due_date IS NOT NULL AND t.status != 'completed' AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
        )
        ORDER BY t.due_date ASC, t.priority DESC
        LIMIT $1
      `;
      queryParams.push(userId);
    }

    const result = await db.query(tasksQuery, queryParams);

    res.json({ tasks: result.rows });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/dashboard/project-progress
// @desc    Get project progress data for charts
// @access  Private
router.get('/project-progress', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let progressQuery;
    let queryParams = [];

    if (userRole === 'administrator') {
      progressQuery = `
        SELECT 
          p.id, p.name, p.progress_percentage, p.status,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          p.start_date, p.end_date
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        WHERE p.is_active = true
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 10
      `;
    } else if (userRole === 'developer') {
      progressQuery = `
        SELECT 
          p.id, p.name, p.progress_percentage, p.status,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          p.start_date, p.end_date
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        WHERE p.is_active = true AND (
          p.project_manager_id = $1 OR EXISTS (
            SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1
          )
        )
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 10
      `;
      queryParams.push(userId);
    } else {
      progressQuery = `
        SELECT 
          p.id, p.name, p.progress_percentage, p.status,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
          p.start_date, p.end_date
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        WHERE p.is_active = true AND p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $1
        )
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 10
      `;
      queryParams.push(userId);
    }

    const result = await db.query(progressQuery, queryParams);

    res.json({ projects: result.rows });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/dashboard/notifications
// @desc    Get user notifications
// @access  Private
router.get('/notifications', async (req, res, next) => {
  try {
    const { limit = 10, unread_only = 'false' } = req.query;
    const userId = req.user.id;

    let whereClause = 'WHERE user_id = $1';
    let queryParams = [userId, limit];

    if (unread_only === 'true') {
      whereClause += ' AND is_read = false';
    }

    const notificationsQuery = `
      SELECT 
        id, type, title, message, data, is_read, created_at
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await db.query(notificationsQuery, queryParams);

    // Get unread count
    const unreadCountQuery = `
      SELECT COUNT(*) as unread_count
      FROM notifications
      WHERE user_id = $1 AND is_read = false
    `;

    const unreadResult = await db.query(unreadCountQuery, [userId]);

    res.json({
      notifications: result.rows,
      unread_count: parseInt(unreadResult.rows[0].unread_count)
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/dashboard/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/notifications/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/dashboard/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/notifications/read-all', async (req, res, next) => {
  try {
    const userId = req.user.id;

    await db.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
