const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const ExcelJS = require('exceljs');


router.get('/projects', validatePagination, async (req, res, next) => {
  try {
    const {
      status = '',
      startDate = '',
      endDate = '',
      start_date = startDate, // Support both parameter names
      end_date = endDate,     // Support both parameter names
      company_id = '',
      manager_id = '',
      userId = '',           // Support userId from frontend
      projectId = ''         // Support projectId from frontend
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'client') {
      paramCount++;
      whereConditions.push(`p.company_id IN (
        SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      paramCount++;
      whereConditions.push(`p.project_manager_id = $${paramCount}`);
      queryParams.push(req.user.id);
    }

    if (status && ['ongoing', 'completed', 'stopped', 'planning'].includes(status)) {
      paramCount++;
      whereConditions.push(`p.status = $${paramCount}`);
      queryParams.push(status);
    }

    if (start_date) {
      paramCount++;
      whereConditions.push(`p.start_date >= $${paramCount}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`p.end_date <= $${paramCount}`);
      queryParams.push(end_date);
    }

    if (company_id) {
      paramCount++;
      whereConditions.push(`p.company_id = $${paramCount}`);
      queryParams.push(company_id);
    }

    if (manager_id) {
      paramCount++;
      whereConditions.push(`p.project_manager_id = $${paramCount}`);
      queryParams.push(manager_id);
    }

    // Handle userId filter (for project members)
    if (userId) {
      paramCount++;
      whereConditions.push(`(p.project_manager_id = $${paramCount} OR EXISTS (
        SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $${paramCount}
      ))`);
      queryParams.push(userId);
    }

    // Handle projectId filter
    if (projectId) {
      paramCount++;
      whereConditions.push(`p.id = $${paramCount}`);
      queryParams.push(projectId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const projectsQuery = `
      SELECT 
        p.id, p.name, p.description, p.status,
        p.start_date, p.end_date, p.budget, p.estimated_hours,
        c.name as company_name,
        u.first_name || ' ' || u.last_name as manager_name,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') as completed_tasks,
        COUNT(DISTINCT pm.user_id) as team_members,
        COALESCE(SUM(te.hours_worked), 0) as total_hours_worked,
        COALESCE(SUM(te.hours_worked * te.hourly_rate), 0) as total_cost,
        CASE 
          WHEN p.estimated_hours > 0 THEN 
            ROUND((COALESCE(SUM(te.hours_worked), 0) / p.estimated_hours * 100), 2)
          ELSE 0 
        END as hours_progress_percentage,
        CASE 
          WHEN COUNT(t.id) > 0 THEN 
            ROUND((COUNT(t.id) FILTER (WHERE t.status = 'completed') * 100.0 / COUNT(t.id)), 2)
          ELSE 0 
        END as task_completion_percentage
      FROM projects p
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN users u ON p.project_manager_id = u.id
      LEFT JOIN tasks t ON p.id = t.project_id
      LEFT JOIN project_members pm ON p.id = pm.project_id
      LEFT JOIN time_entries te ON p.id = te.project_id
      ${whereClause}
      GROUP BY p.id, c.name, u.first_name, u.last_name
      ORDER BY p.created_at DESC
    `;

    const result = await db.query(projectsQuery, queryParams);

    // Calculate summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_projects,
        COUNT(*) FILTER (WHERE status = 'ongoing') as ongoing_projects,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_projects,
        COUNT(*) FILTER (WHERE status = 'stopped') as stopped_projects,
        COUNT(*) FILTER (WHERE status = 'planning') as planning_projects,
        SUM(budget) as total_budget,
        AVG(budget) as average_budget
      FROM projects p
      ${whereClause}
    `;

    const summaryResult = await db.query(summaryQuery, queryParams);

    res.json({
      projects: result.rows,
      summary: summaryResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reports/tasks
// @desc    Get task reports by developer
// @access  Private
router.get('/tasks', validatePagination, async (req, res, next) => {
  try {
    const {
      developer_id = '',
      project_id = '',
      status = '',
      priority = '',
      startDate = '',
      endDate = '',
      start_date = startDate, // Support both parameter names
      end_date = endDate,     // Support both parameter names
      userId = developer_id || '', // Support userId from frontend
      projectId = project_id || '', // Support projectId from frontend
      group_by = 'developer'
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'client') {
      paramCount++;
      whereConditions.push(`t.project_id IN (
        SELECT DISTINCT p.id FROM projects p 
        WHERE p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
        )
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      // Developers can see tasks from projects they manage or are assigned to
      paramCount++;
      whereConditions.push(`(
        t.project_id IN (
          SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $${paramCount}
        ) OR t.assigned_to = $${paramCount}
      )`);
      queryParams.push(req.user.id);
    }

    if (developer_id || userId) {
      paramCount++;
      whereConditions.push(`t.assigned_to = $${paramCount}`);
      queryParams.push(developer_id || userId);
    }

    if (project_id || projectId) {
      paramCount++;
      whereConditions.push(`t.project_id = $${paramCount}`);
      queryParams.push(project_id || projectId);
    }

    if (status && ['new', 'in_progress', 'completed', 'canceled'].includes(status)) {
      paramCount++;
      whereConditions.push(`t.status = $${paramCount}`);
      queryParams.push(status);
    }

    if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
      paramCount++;
      whereConditions.push(`t.priority = $${paramCount}`);
      queryParams.push(priority);
    }

    if (start_date) {
      paramCount++;
      whereConditions.push(`t.created_at >= $${paramCount}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`t.created_at <= $${paramCount}`);
      queryParams.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    let tasksQuery;
    
    if (group_by === 'developer') {
      tasksQuery = `
        SELECT 
          u.id as developer_id,
          u.first_name || ' ' || u.last_name as developer_name,
          u.email as developer_email,
          COUNT(*) as total_tasks,
          COUNT(*) FILTER (WHERE t.status = 'completed') as completed_tasks,
          COUNT(*) FILTER (WHERE t.status = 'in_progress') as in_progress_tasks,
          COUNT(*) FILTER (WHERE t.status = 'to_do') as todo_tasks,
          COUNT(*) FILTER (WHERE t.status = 'blocked') as blocked_tasks,
          COUNT(*) FILTER (WHERE t.priority = 'urgent') as urgent_tasks,
          COUNT(*) FILTER (WHERE t.priority = 'high') as high_priority_tasks,
          COALESCE(SUM(te.hours_worked), 0) as total_hours_worked,
          ROUND(AVG(
            CASE 
              WHEN t.status = 'completed' AND t.due_date IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (t.updated_at::timestamp - t.due_date::timestamp)) / 86400
              ELSE NULL 
            END
          ), 2) as avg_completion_delay_days,
          ROUND(
            CASE 
              WHEN COUNT(*) > 0 THEN 
                (COUNT(*) FILTER (WHERE t.status = 'completed') * 100.0 / COUNT(*))
              ELSE 0 
            END, 2
          ) as completion_rate
        FROM users u
        LEFT JOIN tasks t ON u.id = t.assigned_to
        LEFT JOIN time_entries te ON t.id = te.task_id
        ${whereClause.replace('WHERE ', 'WHERE u.role = \'developer\' AND ')}
        GROUP BY u.id, u.first_name, u.last_name, u.email
        HAVING COUNT(t.id) > 0
        ORDER BY total_tasks DESC
      `;
    } else {
      tasksQuery = `
        SELECT 
          t.id, t.title, t.description, t.status, t.priority,
          t.estimated_hours, t.due_date, t.created_at, t.updated_at,
          p.name as project_name,
          u.first_name || ' ' || u.last_name as assigned_to_name,
          c.first_name || ' ' || c.last_name as created_by_name,
          COALESCE(SUM(te.hours_worked), 0) as hours_worked
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        LEFT JOIN time_entries te ON t.id = te.task_id
        ${whereClause}
        GROUP BY t.id, p.name, u.first_name, u.last_name, c.first_name, c.last_name
        ORDER BY t.created_at DESC
      `;
    }

    const result = await db.query(tasksQuery, queryParams);

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tasks,
        COUNT(*) FILTER (WHERE status = 'to_do') as todo_tasks,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked_tasks,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_tasks,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') as overdue_tasks
      FROM tasks t
      ${whereClause}
    `;

    const summaryResult = await db.query(summaryQuery, queryParams);

    res.json({
      tasks: result.rows,
      summary: summaryResult.rows[0],
      group_by
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reports/productivity
// @desc    Get productivity reports
// @access  Private
router.get('/productivity', async (req, res, next) => {
  try {
    const {
      user_id = '',
      project_id = '',
      startDate = '',
      endDate = '',
      start_date = startDate, // Support both parameter names
      end_date = endDate,     // Support both parameter names
      userId = user_id || '', // Support userId from frontend
      projectId = project_id || '', // Support projectId from frontend
      status = '',
      period = 'month'
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Default date range (last month if not specified)
    const defaultEndDate = end_date || new Date().toISOString().split('T')[0];
    const defaultStartDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    paramCount++;
    whereConditions.push(`te.date_worked >= $${paramCount}`);
    queryParams.push(defaultStartDate);

    paramCount++;
    whereConditions.push(`te.date_worked <= $${paramCount}`);
    queryParams.push(defaultEndDate);

    // Role-based filtering
    if (req.user.role === 'client') {
      paramCount++;
      whereConditions.push(`te.project_id IN (
        SELECT DISTINCT p.id FROM projects p 
        WHERE p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
        )
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      paramCount++;
      whereConditions.push(`(
        te.project_id IN (
          SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $${paramCount}
        ) OR te.user_id = $${paramCount}
      )`);
      queryParams.push(req.user.id);
    }

    if (user_id || userId) {
      paramCount++;
      whereConditions.push(`te.user_id = $${paramCount}`);
      queryParams.push(user_id || userId);
    }

    if (project_id || projectId) {
      paramCount++;
      whereConditions.push(`te.project_id = $${paramCount}`);
      queryParams.push(project_id || projectId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Time period grouping
    let dateGrouping;
    switch (period) {
      case 'day':
        dateGrouping = 'te.date_worked';
        break;
      case 'week':
        dateGrouping = 'DATE_TRUNC(\'week\', te.date_worked)';
        break;
      case 'month':
        dateGrouping = 'DATE_TRUNC(\'month\', te.date_worked)';
        break;
      default:
        dateGrouping = 'DATE_TRUNC(\'month\', te.date_worked)';
    }

    // Productivity by time period
    const productivityQuery = `
      SELECT 
        ${dateGrouping} as period,
        COUNT(DISTINCT te.user_id) as active_users,
        COUNT(DISTINCT te.project_id) as active_projects,
        COUNT(DISTINCT te.task_id) as tasks_worked_on,
        SUM(te.hours_worked) as total_hours,
        COUNT(te.id) as total_entries,
        AVG(te.hours_worked) as avg_hours_per_entry,
        SUM(te.hours_worked * te.hourly_rate) as total_value
      FROM time_entries te
      ${whereClause}
      GROUP BY ${dateGrouping}
      ORDER BY period DESC
    `;

    const productivityResult = await db.query(productivityQuery, queryParams);

    // User productivity
    const userProductivityQuery = `
      SELECT 
        u.id as user_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.role,
        SUM(te.hours_worked) as total_hours,
        COUNT(DISTINCT te.project_id) as projects_count,
        COUNT(DISTINCT te.task_id) as tasks_count,
        COUNT(te.id) as entries_count,
        AVG(te.hours_worked) as avg_hours_per_entry,
        SUM(te.hours_worked * te.hourly_rate) as total_value
      FROM users u
      JOIN time_entries te ON u.id = te.user_id
      ${whereClause}
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY total_hours DESC
    `;

    const userProductivityResult = await db.query(userProductivityQuery, queryParams);

    // Project productivity
    const projectProductivityQuery = `
      SELECT 
        p.id as project_id,
        p.name as project_name,
        p.status as project_status,
        SUM(te.hours_worked) as total_hours,
        COUNT(DISTINCT te.user_id) as contributors_count,
        COUNT(DISTINCT te.task_id) as tasks_count,
        COUNT(te.id) as entries_count,
        SUM(te.hours_worked * te.hourly_rate) as total_cost,
        CASE 
          WHEN p.estimated_hours > 0 THEN 
            ROUND((SUM(te.hours_worked) / p.estimated_hours * 100), 2)
          ELSE NULL 
        END as progress_percentage
      FROM projects p
      JOIN time_entries te ON p.id = te.project_id
      ${whereClause}
      GROUP BY p.id, p.name, p.status, p.estimated_hours
      ORDER BY total_hours DESC
    `;

    const projectProductivityResult = await db.query(projectProductivityQuery, queryParams);

    // Overall summary
    const summaryQuery = `
      SELECT 
        SUM(te.hours_worked) as total_hours,
        COUNT(DISTINCT te.user_id) as active_users,
        COUNT(DISTINCT te.project_id) as active_projects,
        COUNT(DISTINCT te.task_id) as tasks_worked_on,
        COUNT(te.id) as total_entries,
        AVG(te.hours_worked) as avg_hours_per_entry,
        SUM(te.hours_worked * te.hourly_rate) as total_value,
        COUNT(te.id) FILTER (WHERE te.is_billable = true) as billable_entries,
        SUM(te.hours_worked) FILTER (WHERE te.is_billable = true) as billable_hours
      FROM time_entries te
      ${whereClause}
    `;

    const summaryResult = await db.query(summaryQuery, queryParams);

    res.json({
      period_data: productivityResult.rows,
      user_productivity: userProductivityResult.rows,
      project_productivity: projectProductivityResult.rows,
      summary: summaryResult.rows[0],
      date_range: {
        start_date: defaultStartDate,
        end_date: defaultEndDate,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reports/financial
// @desc    Get financial reports
// @access  Private (Admin and Manager)
router.get('/financial', requireRole(['administrator', 'developer']), async (req, res, next) => {
  try {
    const {
      startDate = '',
      endDate = '',
      start_date = startDate, // Support both parameter names
      end_date = endDate,     // Support both parameter names
      company_id = '',
      project_id = '',
      projectId = project_id || '', // Support projectId from frontend
      status = '',
      userId = ''
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Default date range (last 3 months if not specified)
    const defaultEndDate = end_date || new Date().toISOString().split('T')[0];
    const defaultStartDate = start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    paramCount++;
    whereConditions.push(`i.issue_date >= $${paramCount}`);
    queryParams.push(defaultStartDate);

    paramCount++;
    whereConditions.push(`i.issue_date <= $${paramCount}`);
    queryParams.push(defaultEndDate);

    // Role-based filtering
    if (req.user.role === 'developer') {
      paramCount++;
      whereConditions.push(`i.project_id IN (
        SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $${paramCount}
      )`);
      queryParams.push(req.user.id);
    }

    if (company_id) {
      paramCount++;
      whereConditions.push(`i.company_id = $${paramCount}`);
      queryParams.push(company_id);
    }

    if (project_id) {
      paramCount++;
      whereConditions.push(`i.project_id = $${paramCount}`);
      queryParams.push(project_id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Invoice summary
    const invoiceQuery = `
      SELECT 
        COUNT(*) as total_invoices,
        SUM(total_amount) as total_invoiced,
        SUM(total_amount) FILTER (WHERE status = 'paid') as total_paid,
        SUM(total_amount) FILTER (WHERE status = 'pending') as total_pending,
        SUM(total_amount) FILTER (WHERE status = 'overdue') as total_overdue,
        AVG(total_amount) as average_invoice_amount,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
      FROM invoices i
      ${whereClause}
    `;

    const invoiceResult = await db.query(invoiceQuery, queryParams);

    // Monthly breakdown
    const monthlyQuery = `
      SELECT 
        DATE_TRUNC('month', i.issue_date) as month,
        COUNT(*) as invoices_count,
        SUM(i.total_amount) as total_invoiced,
        SUM(p.amount) as total_paid,
        COUNT(DISTINCT i.company_id) as unique_clients
      FROM invoices i
      LEFT JOIN payments p ON i.id = p.invoice_id
      ${whereClause}
      GROUP BY DATE_TRUNC('month', i.issue_date)
      ORDER BY month DESC
    `;

    const monthlyResult = await db.query(monthlyQuery, queryParams);

    // Top clients by revenue
    const clientsQuery = `
      SELECT 
        c.id, c.name,
        COUNT(i.id) as invoice_count,
        SUM(i.total_amount) as total_invoiced,
        SUM(p.amount) as total_paid,
        SUM(i.total_amount) - COALESCE(SUM(p.amount), 0) as outstanding_amount
      FROM companies c
      JOIN invoices i ON c.id = i.company_id
      LEFT JOIN payments p ON i.id = p.invoice_id
      ${whereClause.replace('WHERE ', 'WHERE ')}
      GROUP BY c.id, c.name
      ORDER BY total_invoiced DESC
      LIMIT 10
    `;

    const clientsResult = await db.query(clientsQuery, queryParams);

    // Payment analysis
    const paymentQuery = `
      SELECT 
        AVG(EXTRACT(EPOCH FROM (p.payment_date::timestamp - i.issue_date::timestamp)) / 86400) as avg_payment_days,
        COUNT(p.id) as total_payments,
        SUM(p.amount) as total_payment_amount
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      ${whereClause}
    `;

    const paymentResult = await db.query(paymentQuery, queryParams);

    res.json({
      invoice_summary: invoiceResult.rows[0],
      monthly_breakdown: monthlyResult.rows,
      top_clients: clientsResult.rows,
      payment_analysis: paymentResult.rows[0],
      date_range: {
        start_date: defaultStartDate,
        end_date: defaultEndDate
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/reports/export
// @desc    Export reports as PDF (projects | financial)
// @access  Private (role-restricted per type)
router.post('/export', async (req, res, next) => {
  try {
    const { type, format = 'pdf', ...filters } = req.body || {};

    if (!type) {
      return res.status(400).json({ error: 'Report type is required' });
    }

    if (!['pdf', 'excel', 'xlsx'].includes(format)) {
      return res.status(400).json({ error: 'Supported formats: pdf, excel, xlsx' });
    }

    // Role restrictions for financial exports
    if (type === 'financial' && !['administrator', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions to export financial reports' });
    }

    // Role restrictions for financial exports
    if (type === 'financial' && !['administrator', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions to export financial reports' });
    }

    // Normalize date filters
    const startDate = filters.start_date || filters.startDate || '';
    const endDate = filters.end_date || filters.endDate || '';
    const title = `${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    let reportData = {};

    // Fetch data based on type
    if (type === 'projects') {
      const {
        status = '',
        company_id = '',
        manager_id = '',
        userId = filters.userId || '',
        projectId = filters.projectId || ''
      } = filters;

      let whereConditions = [];
      let queryParams = [];
      let paramCount = 0;

      if (req.user.role === 'client') {
        paramCount++;
        whereConditions.push(`p.company_id IN (
          SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
        )`);
        queryParams.push(req.user.id);
      } else if (req.user.role === 'developer') {
        paramCount++;
        whereConditions.push(`p.project_manager_id = $${paramCount}`);
        queryParams.push(req.user.id);
      }

      if (status && ['ongoing', 'completed', 'stopped', 'planning'].includes(status)) {
        paramCount++;
        whereConditions.push(`p.status = $${paramCount}`);
        queryParams.push(status);
      }
      if (startDate) {
        paramCount++;
        whereConditions.push(`p.start_date >= $${paramCount}`);
        queryParams.push(startDate);
      }
      if (endDate) {
        paramCount++;
        whereConditions.push(`p.end_date <= $${paramCount}`);
        queryParams.push(endDate);
      }
      if (company_id) {
        paramCount++;
        whereConditions.push(`p.company_id = $${paramCount}`);
        queryParams.push(company_id);
      }
      if (manager_id) {
        paramCount++;
        whereConditions.push(`p.project_manager_id = $${paramCount}`);
        queryParams.push(manager_id);
      }
      if (userId) {
        paramCount++;
        whereConditions.push(`(p.project_manager_id = $${paramCount} OR EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $${paramCount}
        ))`);
        queryParams.push(userId);
      }
      if (projectId) {
        paramCount++;
        whereConditions.push(`p.id = $${paramCount}`);
        queryParams.push(projectId);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const query = `
        SELECT p.id, p.name, p.status, p.budget, p.start_date, p.end_date,
               c.name as company_name, u.first_name || ' ' || u.last_name as manager_name
        FROM projects p
        LEFT JOIN companies c ON p.company_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT 100
      `;

      const result = await db.query(query, queryParams);
      reportData = {
        type: 'projects',
        title: title,
        dateRange: `${startDate || 'Any'} to ${endDate || 'Any'}`,
        count: result.rows.length,
        data: result.rows
      };
    } else if (type === 'financial') {
      // Only admin/dev reach here due to role check above
      let whereConditions = [];
      let queryParams = [];
      let paramCount = 0;

      const defaultEndDate = endDate || new Date().toISOString().split('T')[0];
      const defaultStartDate = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      paramCount++; whereConditions.push(`i.issue_date >= $${paramCount}`); queryParams.push(defaultStartDate);
      paramCount++; whereConditions.push(`i.issue_date <= $${paramCount}`); queryParams.push(defaultEndDate);

      if (filters.company_id) {
        paramCount++; whereConditions.push(`i.company_id = $${paramCount}`); queryParams.push(filters.company_id);
      }
      if (filters.project_id || filters.projectId) {
        paramCount++; whereConditions.push(`i.project_id = $${paramCount}`); queryParams.push(filters.project_id || filters.projectId);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const invoiceQuery = `
        SELECT 
          COUNT(*) as total_invoices,
          SUM(total_amount) as total_invoiced,
          SUM(total_amount) FILTER (WHERE status = 'paid') as total_paid,
          SUM(total_amount) FILTER (WHERE status = 'pending') as total_pending,
          SUM(total_amount) FILTER (WHERE status = 'overdue') as total_overdue
        FROM invoices i
        ${whereClause}
      `;
      const invoiceSummary = await db.query(invoiceQuery, queryParams);
      const s = invoiceSummary.rows[0] || {};

      reportData = {
        type: 'financial',
        title: title,
        dateRange: `${defaultStartDate} to ${defaultEndDate}`,
        summary: {
          total_invoices: s.total_invoices || 0,
          total_invoiced: s.total_invoiced || 0,
          total_paid: s.total_paid || 0,
          total_pending: s.total_pending || 0,
          total_overdue: s.total_overdue || 0
        }
      };
    } else if (type === 'time') {
      // Time/Productivity report export
      const { user_id = '', project_id = '', period = 'month' } = filters;
      
      let timeWhereConditions = [];
      let timeQueryParams = [];
      let timeParamCount = 0;

      const timeDefaultEndDate = endDate || new Date().toISOString().split('T')[0];
      const timeDefaultStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      timeParamCount++; timeWhereConditions.push(`te.date_worked >= $${timeParamCount}`); timeQueryParams.push(timeDefaultStartDate);
      timeParamCount++; timeWhereConditions.push(`te.date_worked <= $${timeParamCount}`); timeQueryParams.push(timeDefaultEndDate);

      if (user_id || filters.userId) {
        timeParamCount++; timeWhereConditions.push(`te.user_id = $${timeParamCount}`); timeQueryParams.push(user_id || filters.userId);
      }
      if (project_id || filters.projectId) {
        timeParamCount++; timeWhereConditions.push(`te.project_id = $${timeParamCount}`); timeQueryParams.push(project_id || filters.projectId);
      }

      const timeWhereClause = timeWhereConditions.length > 0 ? `WHERE ${timeWhereConditions.join(' AND ')}` : '';

      const timeQuery = `
        SELECT 
          te.date_worked,
          u.first_name || ' ' || u.last_name as user_name,
          p.name as project_name,
          t.title as task_name,
          te.hours_worked,
          te.description
        FROM time_entries te
        LEFT JOIN users u ON te.user_id = u.id
        LEFT JOIN projects p ON te.project_id = p.id
        LEFT JOIN tasks t ON te.task_id = t.id
        ${timeWhereClause}
        ORDER BY te.date_worked DESC, u.first_name
        LIMIT 100
      `;

      const timeResult = await db.query(timeQuery, timeQueryParams);
      const totalHours = timeResult.rows.reduce((sum, row) => sum + (row.hours_worked || 0), 0);

      reportData = {
        type: 'time',
        title: title,
        dateRange: `${timeDefaultStartDate} to ${timeDefaultEndDate}`,
        count: timeResult.rows.length,
        totalHours: totalHours.toFixed(2),
        data: timeResult.rows
      };
    } else if (type === 'users') {
      // User performance report export
      const { userId = filters.userId || '' } = filters;
      
      let usersWhereConditions = [];
      let usersQueryParams = [];
      let usersParamCount = 0;

      const usersDefaultEndDate = endDate || new Date().toISOString().split('T')[0];
      const usersDefaultStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      usersParamCount++; usersWhereConditions.push(`t.created_at >= $${usersParamCount}`); usersQueryParams.push(usersDefaultStartDate);
      usersParamCount++; usersWhereConditions.push(`t.created_at <= $${usersParamCount}`); usersQueryParams.push(usersDefaultEndDate);

      if (userId) {
        usersParamCount++; usersWhereConditions.push(`u.id = $${usersParamCount}`); usersQueryParams.push(userId);
      }

      const usersWhereClause = usersWhereConditions.length > 0 ? `WHERE ${usersWhereConditions.join(' AND ')}` : '';

      const userQuery = `
        SELECT 
          u.id,
          u.first_name || ' ' || u.last_name as user_name,
          u.email,
          u.role,
          COUNT(t.id) as total_tasks,
          COUNT(*) FILTER (WHERE t.status = 'completed') as completed_tasks,
          COUNT(*) FILTER (WHERE t.status = 'in_progress') as in_progress_tasks,
          COALESCE(SUM(te.hours_worked), 0) as total_hours_worked
        FROM users u
        LEFT JOIN tasks t ON u.id = t.assigned_to
        LEFT JOIN time_entries te ON u.id = te.user_id AND te.date_worked >= $1 AND te.date_worked <= $2
        ${usersWhereClause}
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.role
        HAVING COUNT(t.id) > 0 OR COALESCE(SUM(te.hours_worked), 0) > 0
        ORDER BY total_hours_worked DESC
        LIMIT 50
      `;

      const userResult = await db.query(userQuery, usersQueryParams);

      reportData = {
        type: 'users',
        title: title,
        dateRange: `${usersDefaultStartDate} to ${usersDefaultEndDate}`,
        count: userResult.rows.length,
        data: userResult.rows
      };
    } else {
      return res.status(400).json({ error: 'Unsupported report type' });
    }

    // Generate output based on format
    if (format === 'pdf') {
      return await generatePDFReport(reportData, res, now);
    } else if (format === 'excel' || format === 'xlsx') {
      return await generateExcelReport(reportData, res, now);
    }

  } catch (error) {
    next(error);
  }
});

// Helper function to generate PDF reports
async function generatePDFReport(reportData, res, now) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 800;
  const lineHeight = 18;
  const drawText = (text, x = 40, size = 12, color = rgb(0, 0, 0)) => {
    page.drawText(String(text ?? ''), { x, y, size, font, color });
    y -= lineHeight;
  };

  // Header
  drawText('Meta Software', 40, 16);
  drawText(reportData.title, 40, 20);
  drawText(`Generated: ${now}`, 40, 10, rgb(0.3, 0.3, 0.3));
  y -= 10;

  if (reportData.type === 'projects') {
    drawText(`Date range: ${reportData.dateRange}`);
    drawText(`Projects: ${reportData.count}`);
    y -= 6;
    drawText('List:', 40, 12);
    y -= 4;
    reportData.data.forEach((pRow, idx) => {
      if (y < 60) { page = pdfDoc.addPage([595.28, 841.89]); y = 780; }
      drawText(`${idx + 1}. ${pRow.name} | ${pRow.company_name || '-'} | ${pRow.status} | Budget: ${pRow.budget || 0}`);
    });
  } else if (reportData.type === 'financial') {
    drawText(`Date range: ${reportData.dateRange}`);
    drawText(`Total Invoices: ${reportData.summary.total_invoices}`);
    drawText(`Total Invoiced: ${reportData.summary.total_invoiced}`);
    drawText(`Total Paid: ${reportData.summary.total_paid}`);
    drawText(`Total Pending: ${reportData.summary.total_pending}`);
    drawText(`Total Overdue: ${reportData.summary.total_overdue}`);
  } else if (reportData.type === 'time') {
    drawText(`Date range: ${reportData.dateRange}`);
    drawText(`Total entries: ${reportData.count}`);
    drawText(`Total hours: ${reportData.totalHours}`);
    y -= 6;
    drawText('Time Entries:', 40, 12);
    y -= 4;
    
    reportData.data.forEach((entry, idx) => {
      if (y < 60) { page = pdfDoc.addPage([595.28, 841.89]); y = 780; }
      const date = new Date(entry.date_worked).toLocaleDateString();
      drawText(`${idx + 1}. ${date} | ${entry.user_name} | ${entry.project_name || 'N/A'} | ${entry.hours_worked}h`);
      if (entry.task_name) {
        drawText(`   Task: ${entry.task_name}`, 60, 10, rgb(0.4, 0.4, 0.4));
      }
    });
  } else if (reportData.type === 'users') {
    drawText(`Date range: ${reportData.dateRange}`);
    drawText(`Users with activity: ${reportData.count}`);
    y -= 6;
    drawText('User Performance:', 40, 12);
    y -= 4;
    
    reportData.data.forEach((user, idx) => {
      if (y < 60) { page = pdfDoc.addPage([595.28, 841.89]); y = 780; }
      const completionRate = user.total_tasks > 0 ? Math.round((user.completed_tasks / user.total_tasks) * 100) : 0;
      drawText(`${idx + 1}. ${user.user_name} (${user.role})`);
      drawText(`   Tasks: ${user.completed_tasks}/${user.total_tasks} (${completionRate}%) | Hours: ${user.total_hours_worked}`, 60, 10, rgb(0.4, 0.4, 0.4));
    });
  }

  const pdfBytes = await pdfDoc.save();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportData.type}-report.pdf"`);
  return res.status(200).send(Buffer.from(pdfBytes));
}

// Helper function to generate Excel reports
async function generateExcelReport(reportData, res, now) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(reportData.title);

  // Style definitions
  const headerStyle = {
    font: { bold: true, size: 14 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } },
    font: { color: { argb: 'FFFFFFFF' }, bold: true }
  };

  const subHeaderStyle = {
    font: { bold: true, size: 12 }
  };

  // Header
  worksheet.mergeCells('A1:D1');
  worksheet.getCell('A1').value = 'Meta Software';
  worksheet.getCell('A1').style = headerStyle;

  worksheet.mergeCells('A2:D2');
  worksheet.getCell('A2').value = reportData.title;
  worksheet.getCell('A2').style = subHeaderStyle;

  worksheet.mergeCells('A3:D3');
  worksheet.getCell('A3').value = `Generated: ${now}`;

  worksheet.mergeCells('A4:D4');
  worksheet.getCell('A4').value = `Date range: ${reportData.dateRange}`;

  let currentRow = 6;

  if (reportData.type === 'projects') {
    worksheet.getCell('A5').value = `Projects: ${reportData.count}`;
    
    // Column headers
    worksheet.getCell('A6').value = 'ID';
    worksheet.getCell('B6').value = 'Name';
    worksheet.getCell('C6').value = 'Company';
    worksheet.getCell('D6').value = 'Status';
    worksheet.getCell('E6').value = 'Budget';
    worksheet.getCell('F6').value = 'Start Date';
    worksheet.getCell('G6').value = 'End Date';
    worksheet.getCell('H6').value = 'Manager';

    // Apply header style
    ['A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6'].forEach(cell => {
      worksheet.getCell(cell).style = subHeaderStyle;
    });

    currentRow = 7;
    reportData.data.forEach(project => {
      worksheet.getCell(`A${currentRow}`).value = project.id;
      worksheet.getCell(`B${currentRow}`).value = project.name;
      worksheet.getCell(`C${currentRow}`).value = project.company_name || '-';
      worksheet.getCell(`D${currentRow}`).value = project.status;
      worksheet.getCell(`E${currentRow}`).value = project.budget || 0;
      worksheet.getCell(`F${currentRow}`).value = project.start_date;
      worksheet.getCell(`G${currentRow}`).value = project.end_date;
      worksheet.getCell(`H${currentRow}`).value = project.manager_name || '-';
      currentRow++;
    });

  } else if (reportData.type === 'financial') {
    worksheet.getCell('A6').value = 'Metric';
    worksheet.getCell('B6').value = 'Value';
    
    ['A6', 'B6'].forEach(cell => {
      worksheet.getCell(cell).style = subHeaderStyle;
    });

    currentRow = 7;
    Object.entries(reportData.summary).forEach(([key, value]) => {
      worksheet.getCell(`A${currentRow}`).value = key.replace(/_/g, ' ').toUpperCase();
      worksheet.getCell(`B${currentRow}`).value = value;
      currentRow++;
    });

  } else if (reportData.type === 'time') {
    worksheet.getCell('A5').value = `Total entries: ${reportData.count} | Total hours: ${reportData.totalHours}`;
    
    // Column headers
    worksheet.getCell('A6').value = 'Date';
    worksheet.getCell('B6').value = 'User';
    worksheet.getCell('C6').value = 'Project';
    worksheet.getCell('D6').value = 'Task';
    worksheet.getCell('E6').value = 'Hours';
    worksheet.getCell('F6').value = 'Description';

    ['A6', 'B6', 'C6', 'D6', 'E6', 'F6'].forEach(cell => {
      worksheet.getCell(cell).style = subHeaderStyle;
    });

    currentRow = 7;
    reportData.data.forEach(entry => {
      worksheet.getCell(`A${currentRow}`).value = new Date(entry.date_worked).toLocaleDateString();
      worksheet.getCell(`B${currentRow}`).value = entry.user_name;
      worksheet.getCell(`C${currentRow}`).value = entry.project_name || 'N/A';
      worksheet.getCell(`D${currentRow}`).value = entry.task_name || '-';
      worksheet.getCell(`E${currentRow}`).value = entry.hours_worked;
      worksheet.getCell(`F${currentRow}`).value = entry.description || '';
      currentRow++;
    });

  } else if (reportData.type === 'users') {
    worksheet.getCell('A5').value = `Users with activity: ${reportData.count}`;
    
    // Column headers
    worksheet.getCell('A6').value = 'Name';
    worksheet.getCell('B6').value = 'Email';
    worksheet.getCell('C6').value = 'Role';
    worksheet.getCell('D6').value = 'Total Tasks';
    worksheet.getCell('E6').value = 'Completed';
    worksheet.getCell('F6').value = 'In Progress';
    worksheet.getCell('G6').value = 'Completion Rate %';
    worksheet.getCell('H6').value = 'Total Hours';

    ['A6', 'B6', 'C6', 'D6', 'E6', 'F6', 'G6', 'H6'].forEach(cell => {
      worksheet.getCell(cell).style = subHeaderStyle;
    });

    currentRow = 7;
    reportData.data.forEach(user => {
      const completionRate = user.total_tasks > 0 ? Math.round((user.completed_tasks / user.total_tasks) * 100) : 0;
      worksheet.getCell(`A${currentRow}`).value = user.user_name;
      worksheet.getCell(`B${currentRow}`).value = user.email;
      worksheet.getCell(`C${currentRow}`).value = user.role;
      worksheet.getCell(`D${currentRow}`).value = user.total_tasks;
      worksheet.getCell(`E${currentRow}`).value = user.completed_tasks;
      worksheet.getCell(`F${currentRow}`).value = user.in_progress_tasks;
      worksheet.getCell(`G${currentRow}`).value = completionRate;
      worksheet.getCell(`H${currentRow}`).value = user.total_hours_worked;
      currentRow++;
    });
  }

  // Auto-size columns
  worksheet.columns.forEach(column => {
    column.width = 15;
  });

  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer();
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${reportData.type}-report.xlsx"`);
  return res.status(200).send(Buffer.from(buffer));
}

module.exports = router;
