const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500
  };

  // Database errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        error = {
          message: 'Resource already exists',
          status: 409
        };
        break;
      case '23503': // Foreign key violation
        error = {
          message: 'Referenced resource not found',
          status: 400
        };
        break;
      case '23502': // Not null violation
        error = {
          message: 'Required field missing',
          status: 400
        };
        break;
      case '42P01': // Undefined table
        error = {
          message: 'Database configuration error',
          status: 500
        };
        break;
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error = {
      message: 'Validation failed',
      status: 400,
      details: err.details
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Invalid token',
      status: 401
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expired',
      status: 401
    };
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = {
      message: 'File too large',
      status: 400
    };
  }

  // Send error response
  res.status(error.status).json({
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    ...(error.details && { details: error.details })
  });
};

module.exports = errorHandler;
