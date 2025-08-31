const { body, param, query, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUserRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('first_name').trim().isLength({ min: 2, max: 100 }),
  body('last_name').trim().isLength({ min: 2, max: 100 }),
  body('role').optional().isIn(['administrator', 'developer', 'client']),
  handleValidationErrors
];

const validateUserLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  handleValidationErrors
];

// Project validation rules
const validateProject = [
  body('name').trim().isLength({ min: 3, max: 255 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('company_id').isUUID(),
  body('status').optional().isIn(['planning', 'ongoing', 'completed', 'stopped']),
  body('budget').optional().isFloat({ min: 0 }),
  body('start_date').optional().isISO8601().toDate(),
  body('end_date').optional().isISO8601().toDate(),
  body('estimated_hours').optional().isInt({ min: 0 }),
  handleValidationErrors
];

// Task validation rules
const validateTask = [
  body('title').trim().isLength({ min: 3, max: 255 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('project_id').isUUID(),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('status').optional().isIn(['new', 'in_progress', 'completed', 'canceled']),
  body('estimated_hours').optional().isInt({ min: 0 }),
  body('due_date').optional().isISO8601().toDate(),
  handleValidationErrors
];

// Company validation rules
const validateCompany = [
  body('name').trim().isLength({ min: 2, max: 255 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('website').optional().isURL(),
  handleValidationErrors
];

// Time entry validation rules
const validateTimeEntry = [
  body('project_id').isUUID(),
  body('task_id').optional().isUUID(),
  body('hours_worked').isFloat({ min: 0.1, max: 24 }),
  body('date_worked').isISO8601().toDate(),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('is_billable').optional().isBoolean(),
  handleValidationErrors
];

// Comment validation rules
const validateComment = [
  body('content').trim().isLength({ min: 1, max: 5000 }),
  body('project_id').optional().isUUID(),
  body('task_id').optional().isUUID(),
  body('is_internal').optional().isBoolean(),
  handleValidationErrors
];

// ID parameter validation
const validateUUID = [
  param('id').isUUID(),
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sort').optional().isIn(['created_at', 'updated_at', 'name', 'due_date', 'priority']),
  query('order').optional().isIn(['ASC', 'DESC']),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateProject,
  validateTask,
  validateCompany,
  validateTimeEntry,
  validateComment,
  validateUUID,
  validatePagination,
  handleValidationErrors
};
