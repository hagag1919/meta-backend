const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');
const { validateUUID, validatePagination } = require('../middleware/validation');
const { body } = require('express-validator');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');


router.get('/', validatePagination, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = '',
      project_id = '',
      company_id = '',
      start_date = '',
      end_date = '',
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
      // Clients can only see invoices from their company
      paramCount++;
      whereConditions.push(`i.company_id IN (
        SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $${paramCount}
      )`);
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      // Developers can see invoices from projects they manage
      paramCount++;
      whereConditions.push(`i.project_id IN (
        SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $${paramCount}
      )`);
      queryParams.push(req.user.id);
    }
    // Administrators can see all invoices

    if (status && ['pending', 'paid', 'overdue', 'canceled'].includes(status)) {
      paramCount++;
      whereConditions.push(`i.status = $${paramCount}`);
      queryParams.push(status);
    }

    if (project_id) {
      paramCount++;
      whereConditions.push(`i.project_id = $${paramCount}`);
      queryParams.push(project_id);
    }

    if (company_id) {
      paramCount++;
      whereConditions.push(`i.company_id = $${paramCount}`);
      queryParams.push(company_id);
    }

    if (start_date) {
      paramCount++;
      whereConditions.push(`i.issue_date >= $${paramCount}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`i.issue_date <= $${paramCount}`);
      queryParams.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM invoices i ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const totalInvoices = parseInt(countResult.rows[0].count);

    // Get invoices with related data
    const invoicesQuery = `
      SELECT 
        i.id, i.invoice_number, i.issue_date, i.due_date,
        i.subtotal, i.tax_rate, i.tax_amount, i.total_amount,
        i.currency, i.status, i.paid_date, i.notes,
        i.created_at, i.updated_at,
        p.name as project_name, p.id as project_id,
        c.name as company_name, c.id as company_id,
        u.first_name || ' ' || u.last_name as issued_by_name,
        COUNT(DISTINCT ii.id) as item_count,
        SUM(DISTINCT pay.amount) as total_paid
      FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.issued_by = u.id
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      LEFT JOIN payments pay ON i.id = pay.invoice_id
      ${whereClause}
      GROUP BY i.id, p.id, p.name, c.id, c.name, u.first_name, u.last_name
      ORDER BY i.${sort} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(invoicesQuery, queryParams);

    const totalPages = Math.ceil(totalInvoices / limit);

    res.json({
      invoices: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_invoices: totalInvoices,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/invoices/:id
// @desc    Get invoice by ID
// @access  Private
router.get('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check invoice access based on user role
    let accessQuery = `
      SELECT 
        i.*, 
        p.name as project_name, p.id as project_id,
        c.name as company_name, c.email as company_email,
        c.address as company_address, c.phone as company_phone,
        u.first_name || ' ' || u.last_name as issued_by_name
      FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.issued_by = u.id
      WHERE i.id = $1
    `;
    let accessParams = [id];

    if (req.user.role === 'client') {
      accessQuery += ` AND i.company_id IN (
        SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
      )`;
      accessParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      accessQuery += ` AND i.project_id IN (
        SELECT DISTINCT p2.id FROM projects p2 WHERE p2.project_manager_id = $2
      )`;
      accessParams.push(req.user.id);
    }

    const invoiceResult = await db.query(accessQuery, accessParams);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsQuery = `
      SELECT 
        ii.id, ii.description, ii.quantity, ii.unit_price, ii.total_price,
        te.description as time_entry_description, te.date_worked
      FROM invoice_items ii
      LEFT JOIN time_entries te ON ii.time_entry_id = te.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.created_at
    `;

    const itemsResult = await db.query(itemsQuery, [id]);

    // Get payments
    const paymentsQuery = `
      SELECT 
        id, amount, payment_date, payment_method, 
        transaction_id, notes, created_at
      FROM payments
      WHERE invoice_id = $1
      ORDER BY payment_date DESC
    `;

    const paymentsResult = await db.query(paymentsQuery, [id]);

    res.json({
      invoice: {
        ...invoice,
        items: itemsResult.rows,
        payments: paymentsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/invoices
// @desc    Create new invoice
// @access  Private (Admin and Developer)
router.post('/', requireRole(['administrator', 'developer']), [
  body('project_id').isUUID(),
  body('issue_date').isISO8601().toDate(),
  body('due_date').isISO8601().toDate(),
  body('currency').optional().isLength({ min: 3, max: 3 }),
  body('tax_rate').optional().isFloat({ min: 0, max: 100 }),
  body('notes').optional().trim().isLength({ max: 1000 })
], async (req, res, next) => {
  try {
    const {
      project_id,
      issue_date,
      due_date,
      currency = 'USD',
      tax_rate = 0,
      notes,
      include_unbilled_time = true,
      time_entry_ids = []
    } = req.body;

    // Verify project exists and user has access
    let projectQuery = `
      SELECT p.*, c.id as company_id FROM projects p
      JOIN companies c ON p.company_id = c.id
      WHERE p.id = $1 AND p.is_active = true
    `;
    let projectParams = [project_id];

    if (req.user.role === 'developer') {
      projectQuery += ` AND p.project_manager_id = $2`;
      projectParams.push(req.user.id);
    }

    const projectResult = await db.query(projectQuery, projectParams);
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project not found or access denied' });
    }

    const project = projectResult.rows[0];

    // Generate invoice number
    const invoiceNumberQuery = `
      SELECT COUNT(*) + 1 as next_number FROM invoices 
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    `;
    const numberResult = await db.query(invoiceNumberQuery);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(numberResult.rows[0].next_number).padStart(4, '0')}`;

    // Get time entries to include
    let timeEntries = [];
    if (include_unbilled_time) {
      const timeQuery = `
        SELECT id, description, hours_worked, hourly_rate, date_worked
        FROM time_entries
        WHERE project_id = $1 AND is_billable = true AND is_invoiced = false
        ORDER BY date_worked ASC
      `;
      const timeResult = await db.query(timeQuery, [project_id]);
      timeEntries = timeResult.rows;
    } else if (time_entry_ids.length > 0) {
      const timeQuery = `
        SELECT id, description, hours_worked, hourly_rate, date_worked
        FROM time_entries
        WHERE id = ANY($1) AND project_id = $2 AND is_billable = true AND is_invoiced = false
        ORDER BY date_worked ASC
      `;
      const timeResult = await db.query(timeQuery, [time_entry_ids, project_id]);
      timeEntries = timeResult.rows;
    }

    // Calculate totals
    let subtotal = 0;
    const invoiceItems = [];

    for (const entry of timeEntries) {
      const lineTotal = entry.hours_worked * (entry.hourly_rate || 0);
      subtotal += lineTotal;
      
      invoiceItems.push({
        description: entry.description || `Time worked on ${entry.date_worked}`,
        quantity: entry.hours_worked,
        unit_price: entry.hourly_rate || 0,
        total_price: lineTotal,
        time_entry_id: entry.id
      });
    }

    const taxAmount = subtotal * (tax_rate / 100);
    const totalAmount = subtotal + taxAmount;

    // Create invoice
    const insertQuery = `
      INSERT INTO invoices (
        invoice_number, project_id, company_id, issued_by,
        issue_date, due_date, subtotal, tax_rate, tax_amount,
        total_amount, currency, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, invoice_number, created_at
    `;

    const values = [
      invoiceNumber, project_id, project.company_id, req.user.id,
      issue_date, due_date, subtotal, tax_rate, taxAmount,
      totalAmount, currency, notes
    ];

    const invoiceResult = await db.query(insertQuery, values);
    const invoice = invoiceResult.rows[0];

    // Create invoice items
    for (const item of invoiceItems) {
      await db.query(
        `INSERT INTO invoice_items (
          invoice_id, description, quantity, unit_price, total_price, time_entry_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [invoice.id, item.description, item.quantity, item.unit_price, item.total_price, item.time_entry_id]
      );

      // Mark time entry as invoiced
      if (item.time_entry_id) {
        await db.query(
          'UPDATE time_entries SET is_invoiced = true WHERE id = $1',
          [item.time_entry_id]
        );
      }
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'invoice_created', 'invoice', invoice.id, { 
        invoice_number: invoice.invoice_number,
        project_id,
        total_amount: totalAmount 
      }]
    );

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/invoices/:id
// @desc    Update invoice
// @access  Private (Admin and Project Manager)
router.put('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes, due_date } = req.body;

    // Check invoice access
    let accessQuery = `
      SELECT i.*, p.project_manager_id FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = $1
    `;
    let accessParams = [id];

    if (req.user.role === 'developer') {
      accessQuery += ` AND p.project_manager_id = $2`;
      accessParams.push(req.user.id);
    }

    const invoiceResult = await db.query(accessQuery, accessParams);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or access denied' });
    }

    const currentInvoice = invoiceResult.rows[0];

    // Only allow certain updates based on current status
    if (currentInvoice.status === 'paid') {
      return res.status(400).json({ error: 'Cannot update paid invoice' });
    }

    // Filter allowed fields
    const updates = {};
    if (status && ['pending', 'paid', 'overdue', 'canceled'].includes(status)) {
      updates.status = status;
      if (status === 'paid' && !currentInvoice.paid_date) {
        updates.paid_date = new Date();
      }
    }
    if (notes !== undefined) updates.notes = notes;
    if (due_date) updates.due_date = due_date;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Build update query
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const updateQuery = `
      UPDATE invoices 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, invoice_number, status, updated_at
    `;

    const result = await db.query(updateQuery, values);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'invoice_updated', 'invoice', id, updates]
    );

    res.json({
      message: 'Invoice updated successfully',
      invoice: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/invoices/:id/payments
// @desc    Add payment to invoice
// @access  Private (Admin and Project Manager)
router.post('/:id/payments', validateUUID, [
  body('amount').isFloat({ min: 0.01 }),
  body('payment_date').isISO8601().toDate(),
  body('payment_method').optional().trim().isLength({ max: 100 }),
  body('transaction_id').optional().trim().isLength({ max: 255 }),
  body('notes').optional().trim().isLength({ max: 1000 })
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, payment_date, payment_method, transaction_id, notes } = req.body;

    // Check invoice access
    let accessQuery = `
      SELECT i.*, p.project_manager_id FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = $1
    `;
    let accessParams = [id];

    if (req.user.role === 'developer') {
      accessQuery += ` AND p.project_manager_id = $2`;
      accessParams.push(req.user.id);
    }

    const invoiceResult = await db.query(accessQuery, accessParams);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or access denied' });
    }

    const invoice = invoiceResult.rows[0];

    // Check if payment amount is valid
    const paymentsQuery = 'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1';
    const paymentsResult = await db.query(paymentsQuery, [id]);
    const totalPaid = parseFloat(paymentsResult.rows[0].total_paid);
    const remainingAmount = invoice.total_amount - totalPaid;

    if (amount > remainingAmount) {
      return res.status(400).json({ 
        error: `Payment amount exceeds remaining balance of ${remainingAmount}` 
      });
    }

    // Add payment
    const insertQuery = `
      INSERT INTO payments (invoice_id, amount, payment_date, payment_method, transaction_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, amount, payment_date, created_at
    `;

    const paymentResult = await db.query(insertQuery, [
      id, amount, payment_date, payment_method, transaction_id, notes
    ]);

    // Update invoice status if fully paid
    const newTotalPaid = totalPaid + amount;
    if (newTotalPaid >= invoice.total_amount) {
      await db.query(
        'UPDATE invoices SET status = $1, paid_date = $2 WHERE id = $3',
        ['paid', payment_date, id]
      );
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'payment_added', 'invoice', id, { 
        amount,
        payment_method,
        transaction_id 
      }]
    );

    res.status(201).json({
      message: 'Payment added successfully',
      payment: paymentResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/invoices/stats/overview
// @desc    Get invoice statistics
// @access  Private
router.get('/stats/overview', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let whereClause = '';
    let queryParams = [];

    if (userRole === 'client') {
      whereClause = `WHERE i.company_id IN (
        SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $1
      )`;
      queryParams = [userId];
    } else if (userRole === 'developer') {
      whereClause = `WHERE i.project_id IN (
        SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $1
      )`;
      queryParams = [userId];
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_invoices,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_invoices,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_invoices,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_invoices,
        SUM(total_amount) as total_amount,
        SUM(total_amount) FILTER (WHERE status = 'paid') as total_paid,
        SUM(total_amount) FILTER (WHERE status = 'pending') as total_pending,
        AVG(total_amount) as average_invoice_amount
      FROM invoices i
      ${whereClause}
    `;

    const result = await db.query(statsQuery, queryParams);

    res.json({ stats: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/invoices/:id/pdf
// @desc    Generate and download invoice PDF
// @access  Private
router.get('/:id/pdf', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get invoice details with role-based access
    let invoiceQuery = `
      SELECT 
        i.*, 
        p.name as project_name,
        c.name as company_name, c.email as company_email,
        c.phone as company_phone, c.address as company_address,
        u.first_name || ' ' || u.last_name as issued_by_name
      FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.issued_by = u.id
      WHERE i.id = $1
    `;
    
    const queryParams = [id];

    // Role-based filtering
    if (req.user.role === 'client') {
      invoiceQuery += ` AND i.company_id IN (
        SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
      )`;
      queryParams.push(req.user.id);
    } else if (req.user.role === 'developer') {
      invoiceQuery += ` AND i.project_id IN (
        SELECT DISTINCT p.id FROM projects p WHERE p.project_manager_id = $2
      )`;
      queryParams.push(req.user.id);
    }

    const invoiceResult = await db.query(invoiceQuery, queryParams);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or access denied' });
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsQuery = `
      SELECT 
        ii.description, ii.quantity, ii.unit_price, ii.total_price,
        te.description as time_entry_description, te.date_worked
      FROM invoice_items ii
      LEFT JOIN time_entries te ON ii.time_entry_id = te.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.created_at
    `;
    const itemsResult = await db.query(itemsQuery, [id]);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.276, 841.890]); // A4 size in points
    
    // Get fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Define colors
    const primaryColor = rgb(0.2, 0.4, 0.6); // Blue
    const textColor = rgb(0.2, 0.2, 0.2);    // Dark gray
    const lightGray = rgb(0.9, 0.9, 0.9);

    let yPosition = 750;

    // Header
    page.drawText('INVOICE', {
      x: 50,
      y: yPosition,
      size: 28,
      font: helveticaBold,
      color: primaryColor,
    });

    page.drawText(`#${invoice.invoice_number}`, {
      x: 400,
      y: yPosition,
      size: 18,
      font: helveticaBold,
      color: textColor,
    });

    yPosition -= 50;

    // Company Info (From)
    page.drawText('From:', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: textColor,
    });

    yPosition -= 20;
    page.drawText('Meta Software', {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: textColor,
    });

    yPosition -= 15;
    page.drawText('Project Management System', {
      x: 50,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: textColor,
    });

    // Client Info (To)
    yPosition = 650;
    page.drawText('To:', {
      x: 300,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: textColor,
    });

    yPosition -= 20;
    page.drawText(invoice.company_name || 'N/A', {
      x: 300,
      y: yPosition,
      size: 11,
      font: helvetica,
      color: textColor,
    });

    if (invoice.company_address) {
      yPosition -= 15;
      page.drawText(invoice.company_address, {
        x: 300,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: textColor,
      });
    }

    if (invoice.company_email) {
      yPosition -= 15;
      page.drawText(invoice.company_email, {
        x: 300,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: textColor,
      });
    }

    // Invoice Details
    yPosition = 580;
    const formatDate = (date) => new Date(date).toLocaleDateString();

    const details = [
      { label: 'Invoice Date:', value: formatDate(invoice.issue_date) },
      { label: 'Due Date:', value: formatDate(invoice.due_date) },
      { label: 'Project:', value: invoice.project_name || 'N/A' },
      { label: 'Status:', value: invoice.status.toUpperCase() },
    ];

    details.forEach(detail => {
      page.drawText(detail.label, {
        x: 50,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: textColor,
      });

      page.drawText(detail.value, {
        x: 150,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: textColor,
      });

      yPosition -= 18;
    });

    // Items table
    yPosition -= 30;
    
    // Table header
    page.drawRectangle({
      x: 50,
      y: yPosition - 5,
      width: 495,
      height: 25,
      color: lightGray,
    });

    const tableHeaders = [
      { text: 'Description', x: 60 },
      { text: 'Qty', x: 350 },
      { text: 'Rate', x: 400 },
      { text: 'Amount', x: 470 }
    ];

    tableHeaders.forEach(header => {
      page.drawText(header.text, {
        x: header.x,
        y: yPosition + 5,
        size: 10,
        font: helveticaBold,
        color: textColor,
      });
    });

    yPosition -= 30;

    // Table rows
    itemsResult.rows.forEach(item => {
      const description = item.description || item.time_entry_description || 'Service';
      const truncatedDesc = description.length > 40 ? description.substring(0, 37) + '...' : description;
      
      page.drawText(truncatedDesc, {
        x: 60,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: textColor,
      });

      page.drawText(item.quantity.toString(), {
        x: 350,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: textColor,
      });

      page.drawText(`$${parseFloat(item.unit_price).toFixed(2)}`, {
        x: 400,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: textColor,
      });

      page.drawText(`$${parseFloat(item.total_price).toFixed(2)}`, {
        x: 470,
        y: yPosition,
        size: 9,
        font: helvetica,
        color: textColor,
      });

      yPosition -= 20;
    });

    // Totals
    yPosition -= 20;
    
    const totals = [
      { label: 'Subtotal:', value: `$${parseFloat(invoice.subtotal).toFixed(2)}` },
      { label: `Tax (${invoice.tax_rate}%):`, value: `$${parseFloat(invoice.tax_amount).toFixed(2)}` },
      { label: 'Total:', value: `$${parseFloat(invoice.total_amount).toFixed(2)}` }
    ];

    totals.forEach((total, index) => {
      const isTotal = index === totals.length - 1;
      const font = isTotal ? helveticaBold : helvetica;
      const size = isTotal ? 12 : 10;

      page.drawText(total.label, {
        x: 400,
        y: yPosition,
        size: size,
        font: font,
        color: textColor,
      });

      page.drawText(total.value, {
        x: 470,
        y: yPosition,
        size: size,
        font: font,
        color: textColor,
      });

      yPosition -= isTotal ? 25 : 18;
    });

    // Footer
    yPosition = 80;
    page.drawText('Thank you for your business!', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBold,
      color: primaryColor,
    });

    yPosition -= 20;
    page.drawText('Generated by Meta Software Project Management System', {
      x: 50,
      y: yPosition,
      size: 8,
      font: helvetica,
      color: textColor,
    });

    // Generate PDF buffer
    const pdfBytes = await pdfDoc.save();

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);

    // Send PDF
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('PDF generation error:', error);
    next(error);
  }
});

module.exports = router;
