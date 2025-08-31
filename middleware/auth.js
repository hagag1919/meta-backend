const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    
    const userQuery = `
      SELECT id, email, role, is_active, first_name, last_name
      FROM users 
      WHERE id = $1 AND is_active = true
    `;
    
    const result = await db.query(userQuery, [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

const requireAdminOrOwner = async (req, res, next) => {
  if (req.user.role === 'administrator') {
    return next();
  }

  // Check if user is owner of the resource
  const resourceId = req.params.id || req.params.userId || req.params.projectId;
  
  if (req.user.id === resourceId) {
    return next();
  }

 
  if (req.params.projectId) {
    try {
      const projectQuery = `
        SELECT 1 FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.id = $1 AND (p.project_manager_id = $2 OR pm.user_id = $2)
      `;
      
      const result = await db.query(projectQuery, [req.params.projectId, req.user.id]);
      
      if (result.rows.length > 0) {
        return next();
      }
    } catch (error) {
      console.error('Error checking project access:', error);
    }
  }

  return res.status(403).json({ error: 'Access denied' });
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdminOrOwner
};
