const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// Create DOMPurify instance for HTML sanitization
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// SQL Injection protection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
  /(--;|\/\*|\*\/;|;\s*--)/g,  // More specific comment patterns
  /(\bOR\b.*=.*|1=1|1\s*=\s*1)/gi,
  /(\bUNION\b.*\bSELECT\b)/gi,
  /(\bINTO\b.*\bOUTFILE\b)/gi,
  /(\bLOAD_FILE\b|\bINTO\b.*\bDUMPFILE\b)/gi,
  /('\s*OR\s*'|"\s*OR\s*")/gi,  // Specific quote-based injection patterns
  /('\s*;\s*|\s*;\s*--)/gi  // Semicolon with quotes for SQL termination
];

// XSS protection patterns
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi
];

// Command Injection patterns
const COMMAND_INJECTION_PATTERNS = [
  // /[;&|`$(){}[\]\\]/g, // This pattern is too broad and blocks common password characters.
  /\b(rm|del|format|fdisk|mkfs|shutdown|reboot)\b/gi,
  /\b(wget|curl|nc|netcat|telnet|ssh|bash|sh|zsh)\b/gi
];

// Path Traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c/gi,
  /%2e%2e%2f|%2e%2e%5c/gi,
  /\/(etc|proc|sys|boot|var|tmp)\/|\\(windows|system32|boot)\\/gi
];

/**
 * Validate and sanitize input to prevent SQL injection
 */
const sanitizeInput = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  // Check for SQL injection patterns
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error('Potential SQL injection detected');
    }
  }

  // Check for XSS patterns
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error('Potential XSS attack detected');
    }
  }

  // Check for command injection
  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error('Potential command injection detected');
    }
  }

  // Check for path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error('Potential path traversal attack detected');
    }
  }

  // Sanitize HTML content
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
};

/**
 * Recursively sanitize object properties
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeInput(key)] = sanitizeObject(value);
    }
    return sanitized;
  }

  return sanitizeInput(obj);
};

/**
 * Middleware to sanitize all request inputs
 */
const sanitizeInputs = (req, res, next) => {
  try {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    // Sanitize headers (selective)
    const headersToSanitize = ['user-agent', 'referer', 'origin'];
    headersToSanitize.forEach(header => {
      if (req.headers[header]) {
        req.headers[header] = sanitizeInput(req.headers[header]);
      }
    });

    next();
  } catch (error) {
    console.error('Security validation failed:', error.message);
    return res.status(400).json({ 
      error: 'Invalid input detected',
      details: 'Request contains potentially malicious content'
    });
  }
};

/**
 * Enhanced UUID validation
 */
const validateUUID = [
  param('id').isUUID().withMessage('Invalid UUID format'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

/**
 * Enhanced pagination validation
 */
const validatePagination = [
  query('page').optional().isInt({ min: 1, max: 10000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
  query('sort').optional().isLength({ max: 50 }).matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  query('order').optional().isIn(['ASC', 'DESC', 'asc', 'desc']),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

/**
 * Enhanced email validation
 */
const validateEmail = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Invalid email format'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

/**
 * Password strength validation
 */
const validatePassword = [
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase, uppercase, digit, and special character'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

/**
 * File upload validation
 */
const validateFileUpload = (allowedTypes = [], maxSize = 10 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: 'Invalid file type',
        allowed: allowedTypes
      });
    }

    // Check file size
    if (req.file.size > maxSize) {
      return res.status(400).json({ 
        error: 'File too large',
        maxSize: `${maxSize / (1024 * 1024)}MB`
      });
    }

    // Sanitize filename
    req.file.originalname = sanitizeInput(req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));

    next();
  };
};

/**
 * Advanced rate limiting configurations
 */
const createRateLimit = (windowMs, max, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
      res.status(429).json({ 
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Different rate limits for different endpoints
const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // limit each IP to 50 requests per windowMs (increased from 5 for development)
  'Too many authentication attempts'
);

const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests'
);

const uploadRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  20, // limit each IP to 20 uploads per hour
  'Too many file uploads'
);

/**
 * SQL Query security wrapper
 */
const secureQuery = async (db, query, params = []) => {
  try {
    // Validate that params are not strings that could contain SQL
    const validatedParams = params.map(param => {
      if (typeof param === 'string') {
        // Check for SQL injection patterns in parameters
        for (const pattern of SQL_INJECTION_PATTERNS) {
          if (pattern.test(param)) {
            throw new Error('Potential SQL injection in parameter');
          }
        }
      }
      return param;
    });

    // Log query for monitoring (in development only)
    if (process.env.NODE_ENV === 'development') {
      console.log('Executing query:', query.replace(/\s+/g, ' ').trim());
      console.log('Parameters:', validatedParams);
    }

    return await db.query(query, validatedParams);
  } catch (error) {
    console.error('Database query error:', error.message);
    throw new Error('Database operation failed');
  }
};

/**
 * Content Security Policy headers
 */
const setSecurityHeaders = (req, res, next) => {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
};

/**
 * Request logging for security monitoring
 */
const securityLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || 'anonymous'
    };

    // Log suspicious activities
    if (res.statusCode >= 400 || duration > 5000) {
      console.warn('Security Alert:', logData);
    }
  });

  next();
};

module.exports = {
  sanitizeInput,
  sanitizeObject,
  sanitizeInputs,
  validateUUID,
  validatePagination,
  validateEmail,
  validatePassword,
  validateFileUpload,
  authRateLimit,
  generalRateLimit,
  uploadRateLimit,
  secureQuery,
  setSecurityHeaders,
  securityLogger
};
