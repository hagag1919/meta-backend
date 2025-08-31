const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../config/database');
const { validateUUID, validatePagination } = require('../middleware/validation');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use a temporary directory first, we'll organize later
    let uploadPath = uploadsDir;
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    const filename = `${uniqueId}${extension}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed',
    'video/mp4', 'video/mpeg', 'video/quicktime'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 5 // Maximum 5 files per request
  }
});

// @route   GET /api/files
// @desc    Get files for project or task
// @access  Private
router.get('/', validatePagination, async (req, res, next) => {
  try {
    const { project_id, task_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!project_id && !task_id) {
      return res.status(400).json({ error: 'project_id or task_id is required' });
    }

    // Check access permissions
    let accessQuery;
    let accessParams;

    if (project_id) {
      if (req.user.role === 'client') {
        accessQuery = `
          SELECT 1 FROM projects p
          WHERE p.id = $1 AND p.company_id IN (
            SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
          )
        `;
        accessParams = [project_id, req.user.id];
      } else if (req.user.role === 'developer') {
        accessQuery = `
          SELECT 1 FROM projects p
          WHERE p.id = $1 AND (
            p.project_manager_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
            )
          )
        `;
        accessParams = [project_id, req.user.id];
      } else {
        accessQuery = 'SELECT 1 FROM projects WHERE id = $1';
        accessParams = [project_id];
      }
    } else {
      if (req.user.role === 'client') {
        accessQuery = `
          SELECT 1 FROM tasks t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = $1 AND p.company_id IN (
            SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
          )
        `;
        accessParams = [task_id, req.user.id];
      } else if (req.user.role === 'developer') {
        accessQuery = `
          SELECT 1 FROM tasks t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = $1 AND (
            t.assigned_to = $2 OR
            p.project_manager_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
            )
          )
        `;
        accessParams = [task_id, req.user.id];
      } else {
        accessQuery = 'SELECT 1 FROM tasks WHERE id = $1';
        accessParams = [task_id];
      }
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found or access denied' });
    }

    // Build WHERE clause for files
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    if (project_id) {
      paramCount++;
      whereConditions.push(`f.project_id = $${paramCount}`);
      queryParams.push(project_id);
    }

    if (task_id) {
      paramCount++;
      whereConditions.push(`f.task_id = $${paramCount}`);
      queryParams.push(task_id);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get files
    const filesQuery = `
      SELECT 
        f.id, f.filename, f.original_filename, f.file_size, f.mime_type,
        f.is_public, f.created_at,
        u.id as uploaded_by_id, u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(filesQuery, queryParams);

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM files f ${whereClause}`;
    const countParams = queryParams.slice(0, paramCount);
    const countResult = await db.query(countQuery, countParams);
    const totalFiles = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalFiles / limit);

    res.json({
      files: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_files: totalFiles,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/files/upload
// @desc    Upload files
// @access  Private
router.post('/upload', (req, res, next) => {
  const uploadHandler = upload.array('files', 5);
  
  uploadHandler(req, res, (err) => {
    if (err) {
      console.log('❌ Multer error:', err.message);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files. Maximum is 5 files.' });
      }
      if (err.message === 'File type not allowed') {
        return res.status(400).json({ error: 'File type not supported.' });
      }
      
      return res.status(400).json({ error: err.message });
    }
    
    next();
  });
}, async (req, res, next) => {
  try {
    console.log('📁 File upload request received');
    console.log('📋 Request body:', req.body);
    console.log('📎 Files:', req.files ? req.files.length : 0);
    
    const { project_id, task_id, is_public = false } = req.body;

    if (!project_id && !task_id) {
      console.log('❌ Missing project_id or task_id');
      return res.status(400).json({ error: 'project_id or task_id is required' });
    }

    if (!req.files || req.files.length === 0) {
      console.log('❌ No files in request');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log('✅ Basic validation passed, checking permissions...');

    // Check access permissions
    let accessQuery;
    let accessParams;

    if (project_id) {
      if (req.user.role === 'client') {
        accessQuery = `
          SELECT 1 FROM projects p
          WHERE p.id = $1 AND p.company_id IN (
            SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
          )
        `;
        accessParams = [project_id, req.user.id];
      } else if (req.user.role === 'developer') {
        accessQuery = `
          SELECT 1 FROM projects p
          WHERE p.id = $1 AND (
            p.project_manager_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
            )
          )
        `;
        accessParams = [project_id, req.user.id];
      } else {
        accessQuery = 'SELECT 1 FROM projects WHERE id = $1';
        accessParams = [project_id];
      }
    } else {
      if (req.user.role === 'client') {
        accessQuery = `
          SELECT 1 FROM tasks t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = $1 AND p.company_id IN (
            SELECT cu.company_id FROM client_users cu WHERE cu.user_id = $2
          )
        `;
        accessParams = [task_id, req.user.id];
      } else if (req.user.role === 'developer') {
        accessQuery = `
          SELECT 1 FROM tasks t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = $1 AND (
            t.assigned_to = $2 OR
            p.project_manager_id = $2 OR EXISTS (
              SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
            )
          )
        `;
        accessParams = [task_id, req.user.id];
      } else {
        accessQuery = 'SELECT 1 FROM tasks WHERE id = $1';
        accessParams = [task_id];
      }
    }

    const accessResult = await db.query(accessQuery, accessParams);
    if (accessResult.rows.length === 0) {
      // Clean up uploaded files
      req.files.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      });
      return res.status(404).json({ error: 'Resource not found or access denied' });
    }

    // Save file information to database
    const uploadedFiles = [];
    
    for (const file of req.files) {
      const insertQuery = `
        INSERT INTO files (
          filename, original_filename, file_path, file_size, mime_type,
          uploaded_by, project_id, task_id, is_public
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, filename, original_filename, file_size, mime_type, created_at
      `;

      const values = [
        file.filename,
        file.originalname,
        file.path,
        file.size,
        file.mimetype,
        req.user.id,
        project_id || null,
        task_id || null,
        is_public
      ];

      const result = await db.query(insertQuery, values);
      uploadedFiles.push(result.rows[0]);
    }

    // Log activity
    const entityType = project_id ? 'project' : 'task';
    const entityId = project_id || task_id;
    
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'files_uploaded', entityType, entityId, { 
        file_count: uploadedFiles.length,
        files: uploadedFiles.map(f => f.original_filename)
      }]
    );

    res.status(201).json({
      message: 'Files uploaded successfully',
      files: uploadedFiles
    });
  } catch (error) {
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }
    next(error);
  }
});

// @route   GET /api/files/:id/download
// @desc    Download file
// @access  Private
router.get('/:id/download', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get file information
    const fileQuery = `
      SELECT f.*, p.company_id, t.project_id as task_project_id
      FROM files f
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN tasks t ON f.task_id = t.id
      WHERE f.id = $1
    `;

    const fileResult = await db.query(fileQuery, [id]);
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = fileResult.rows[0];

    // Check access permissions (unless file is public)
    if (!file.is_public) {
      let hasAccess = false;

      if (req.user.role === 'administrator') {
        hasAccess = true;
      } else if (req.user.role === 'client') {
        const companyId = file.company_id || (file.task_project_id ? 
          (await db.query('SELECT company_id FROM projects WHERE id = $1', [file.task_project_id])).rows[0]?.company_id 
          : null);
        
        if (companyId) {
          const clientAccess = await db.query(
            'SELECT 1 FROM client_users WHERE company_id = $1 AND user_id = $2',
            [companyId, req.user.id]
          );
          hasAccess = clientAccess.rows.length > 0;
        }
      } else if (req.user.role === 'developer') {
        let accessQuery;
        let accessParams;

        if (file.project_id) {
          accessQuery = `
            SELECT 1 FROM projects p
            WHERE p.id = $1 AND (
              p.project_manager_id = $2 OR EXISTS (
                SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
              )
            )
          `;
          accessParams = [file.project_id, req.user.id];
        } else if (file.task_id) {
          accessQuery = `
            SELECT 1 FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE t.id = $1 AND (
              t.assigned_to = $2 OR
              p.project_manager_id = $2 OR EXISTS (
                SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
              )
            )
          `;
          accessParams = [file.task_id, req.user.id];
        }

        if (accessQuery) {
          const accessResult = await db.query(accessQuery, accessParams);
          hasAccess = accessResult.rows.length > 0;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    res.setHeader('Content-Type', file.mime_type);

    // Stream the file
    const fileStream = fs.createReadStream(file.file_path);
    fileStream.pipe(res);

    // Log download activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'file_downloaded', 'file', id, { filename: file.original_filename }]
    );

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/files/:id
// @desc    Delete file
// @access  Private (Uploader, Admin, or Project Manager)
router.delete('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check file access
    let accessQuery;
    if (req.user.role === 'administrator') {
      accessQuery = 'SELECT * FROM files WHERE id = $1';
    } else {
      accessQuery = `
        SELECT f.*, p.project_manager_id, tp.project_manager_id as task_project_manager_id
        FROM files f
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN tasks t ON f.task_id = t.id
        LEFT JOIN projects tp ON t.project_id = tp.id
        WHERE f.id = $1 AND (
          f.uploaded_by = $2 OR 
          p.project_manager_id = $2 OR 
          tp.project_manager_id = $2
        )
      `;
    }

    const queryParams = req.user.role === 'administrator' ? [id] : [id, req.user.id];
    const fileResult = await db.query(accessQuery, queryParams);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found or not authorized to delete' });
    }

    const file = fileResult.rows[0];

    // Delete file from database
    await db.query('DELETE FROM files WHERE id = $1', [id]);

    // Delete file from disk
    if (fs.existsSync(file.file_path)) {
      fs.unlink(file.file_path, (err) => {
        if (err) console.error('Error deleting file from disk:', err);
      });
    }

    // Log activity
    const entityType = file.project_id ? 'project' : 'task';
    const entityId = file.project_id || file.task_id;
    
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'file_deleted', entityType, entityId, { 
        filename: file.original_filename 
      }]
    );

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/files/:id
// @desc    Update file metadata
// @access  Private (Uploader, Admin, or Project Manager)
router.put('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_public } = req.body;

    if (typeof is_public !== 'boolean') {
      return res.status(400).json({ error: 'is_public must be a boolean value' });
    }

    // Check file access
    let accessQuery;
    if (req.user.role === 'administrator') {
      accessQuery = 'SELECT * FROM files WHERE id = $1';
    } else {
      accessQuery = `
        SELECT f.*, p.project_manager_id, tp.project_manager_id as task_project_manager_id
        FROM files f
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN tasks t ON f.task_id = t.id
        LEFT JOIN projects tp ON t.project_id = tp.id
        WHERE f.id = $1 AND (
          f.uploaded_by = $2 OR 
          p.project_manager_id = $2 OR 
          tp.project_manager_id = $2
        )
      `;
    }

    const queryParams = req.user.role === 'administrator' ? [id] : [id, req.user.id];
    const fileResult = await db.query(accessQuery, queryParams);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found or not authorized to update' });
    }

    // Update file
    const updateQuery = `
      UPDATE files 
      SET is_public = $1
      WHERE id = $2
      RETURNING id, original_filename, is_public
    `;

    const result = await db.query(updateQuery, [is_public, id]);

    res.json({
      message: 'File updated successfully',
      file: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
