const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { validateComment, validateUUID, validatePagination } = require('../middleware/validation');


router.get('/', validatePagination, async (req, res, next) => {
  try {
    const { project_id, task_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!project_id && !task_id) {
      return res.status(400).json({ error: 'project_id or task_id is required' });
    }

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

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    if (project_id) {
      paramCount++;
      whereConditions.push(`project_id = $${paramCount}`);
      queryParams.push(project_id);
    }

    if (task_id) {
      paramCount++;
      whereConditions.push(`task_id = $${paramCount}`);
      queryParams.push(task_id);
    }

    if (req.user.role === 'client') {
      whereConditions.push('is_internal = false');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get comments
    const commentsQuery = `
      SELECT 
        c.id, c.content, c.is_internal, c.created_at, c.updated_at,
        c.parent_comment_id,
        u.id as author_id, u.first_name || ' ' || u.last_name as author_name,
        u.profile_image_url as author_image
      FROM comments c
      JOIN users u ON c.author_id = u.id
      ${whereClause}
      ORDER BY c.created_at ASC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    const result = await db.query(commentsQuery, queryParams);

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM comments ${whereClause}`;
    const countParams = queryParams.slice(0, paramCount);
    const countResult = await db.query(countQuery, countParams);
    const totalComments = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalComments / limit);

    res.json({
      comments: result.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_comments: totalComments,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/comments
// @desc    Create new comment
// @access  Private
router.post('/', validateComment, async (req, res, next) => {
  try {
    const { content, project_id, task_id, parent_comment_id, is_internal = false } = req.body;

    if (!project_id && !task_id) {
      return res.status(400).json({ error: 'project_id or task_id is required' });
    }

    // Clients cannot create internal comments
    if (req.user.role === 'client' && is_internal) {
      return res.status(403).json({ error: 'Clients cannot create internal comments' });
    }

    // Check access permissions
    let accessQuery;
    let accessParams;
    let entityId;

    if (project_id) {
      entityId = project_id;
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
      entityId = task_id;
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

    // Verify parent comment exists (if provided)
    if (parent_comment_id) {
      const parentQuery = `
        SELECT 1 FROM comments 
        WHERE id = $1 AND (
          (project_id = $2 AND $2 IS NOT NULL) OR 
          (task_id = $3 AND $3 IS NOT NULL)
        )
      `;
      const parentResult = await db.query(parentQuery, [parent_comment_id, project_id, task_id]);
      if (parentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Parent comment not found' });
      }
    }

    // Create comment
    const insertQuery = `
      INSERT INTO comments (content, author_id, project_id, task_id, parent_comment_id, is_internal)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, content, is_internal, created_at
    `;

    const values = [content, req.user.id, project_id, task_id, parent_comment_id, is_internal];
    const result = await db.query(insertQuery, values);
    const comment = result.rows[0];

    // Log activity
    const entityType = project_id ? 'project' : 'task';
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'comment_created', entityType, entityId, { 
        comment_id: comment.id,
        is_internal 
      }]
    );

    // Emit socket event
    const io = req.app.get('socketio');
    if (project_id) {
      io.to(`project_${project_id}`).emit('comment_added', { 
        comment: {
          ...comment,
          author_name: `${req.user.first_name} ${req.user.last_name}`,
          author_id: req.user.id
        },
        project_id 
      });
    }

    res.status(201).json({
      message: 'Comment created successfully',
      comment: {
        ...comment,
        author_name: `${req.user.first_name} ${req.user.last_name}`,
        author_id: req.user.id
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/comments/:id
// @desc    Update comment
// @access  Private (Author only)
router.put('/:id', validateUUID, [
  validateComment[0] // content validation
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    // Check if comment exists and user is the author
    const commentQuery = `
      SELECT c.*, p.id as project_id FROM comments c
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN tasks t ON c.task_id = t.id
      LEFT JOIN projects tp ON t.project_id = tp.id
      WHERE c.id = $1 AND c.author_id = $2
    `;

    const commentResult = await db.query(commentQuery, [id, req.user.id]);
    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found or not authorized to edit' });
    }

    const comment = commentResult.rows[0];

    // Update comment
    const updateQuery = `
      UPDATE comments 
      SET content = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, content, updated_at
    `;

    const result = await db.query(updateQuery, [content, id]);

    // Log activity
    const entityType = comment.project_id ? 'project' : 'task';
    const entityId = comment.project_id || comment.task_id;
    
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'comment_updated', entityType, entityId, { comment_id: id }]
    );

    res.json({
      message: 'Comment updated successfully',
      comment: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/comments/:id
// @desc    Delete comment
// @access  Private (Author, Admin, or Project Manager)
router.delete('/:id', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check comment access
    let accessQuery;
    if (req.user.role === 'administrator') {
      accessQuery = 'SELECT * FROM comments WHERE id = $1';
    } else {
      accessQuery = `
        SELECT c.*, 
               p.project_manager_id as project_manager_id,
               tp.project_manager_id as task_project_manager_id
        FROM comments c
        LEFT JOIN projects p ON c.project_id = p.id
        LEFT JOIN tasks t ON c.task_id = t.id
        LEFT JOIN projects tp ON t.project_id = tp.id
        WHERE c.id = $1 AND (
          c.author_id = $2 OR 
          p.project_manager_id = $2 OR 
          tp.project_manager_id = $2
        )
      `;
    }

    const queryParams = req.user.role === 'administrator' ? [id] : [id, req.user.id];
    const commentResult = await db.query(accessQuery, queryParams);

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found or not authorized to delete' });
    }

    const comment = commentResult.rows[0];

    // Delete comment
    await db.query('DELETE FROM comments WHERE id = $1', [id]);

    // Log activity
    const entityType = comment.project_id ? 'project' : 'task';
    const entityId = comment.project_id || comment.task_id;
    
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'comment_deleted', entityType, entityId, { comment_id: id }]
    );

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
