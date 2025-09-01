const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const db = require('../config/database');

/**
 * GET /api/exports
 * Get user's export history
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT 
        id,
        filename,
        file_path,
        export_type,
        entity_type,
        record_count,
        file_size,
        is_public,
        download_count,
        expires_at,
        created_at,
        updated_at
      FROM exports 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50`,
      [userId]
    );
    
    res.json({
      success: true,
      exports: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching exports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch export history'
    });
  }
});

/**
 * POST /api/exports
 * Record a new export in the database
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      filename,
      file_path,
      export_type,
      entity_type,
      record_count,
      file_size,
      is_public,
      expires_at,
      metadata
    } = req.body;
    
    // Validate required fields
    if (!filename || !file_path || !export_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: filename, file_path, export_type'
      });
    }
    
    const result = await db.query(
      `INSERT INTO exports (
        user_id, 
        filename, 
        file_path, 
        export_type, 
        entity_type,
        record_count,
        file_size,
        is_public,
        expires_at,
        metadata,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [
        userId,
        filename,
        file_path,
        export_type,
        entity_type || 'data',
        record_count || 0,
        file_size || 0,
        is_public || false,
        expires_at || null,
        JSON.stringify(metadata || {})
      ]
    );
    
    res.status(201).json({
      success: true,
      export: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error recording export:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record export'
    });
  }
});

/**
 * PUT /api/exports/:id/download
 * Increment download count for an export
 */
router.put('/:id/download', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Verify export belongs to user or is public
    const exportCheck = await db.query(
      'SELECT user_id, is_public FROM exports WHERE id = $1',
      [id]
    );
    
    if (exportCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Export not found'
      });
    }
    
    const exportData = exportCheck.rows[0];
    
    // Check access permissions
    if (exportData.user_id !== userId && !exportData.is_public) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Increment download count
    await db.query(
      'UPDATE exports SET download_count = download_count + 1, updated_at = NOW() WHERE id = $1',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Download count updated'
    });
    
  } catch (error) {
    console.error('Error updating download count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update download count'
    });
  }
});

/**
 * DELETE /api/exports/:id
 * Delete an export record and optionally the file
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { deleteFile = false } = req.query;
    
    // Verify export belongs to user
    const exportCheck = await db.query(
      'SELECT user_id, file_path FROM exports WHERE id = $1',
      [id]
    );
    
    if (exportCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Export not found'
      });
    }
    
    const exportData = exportCheck.rows[0];
    
    if (exportData.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Delete from database
    await db.query('DELETE FROM exports WHERE id = $1', [id]);
    
    // TODO: If deleteFile is true, delete from Supabase Storage
    // This would require Supabase admin credentials on backend
    
    res.json({
      success: true,
      message: 'Export deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting export:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete export'
    });
  }
});

/**
 * GET /api/exports/stats
 * Get export statistics for the user
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      `SELECT 
        COUNT(*) as total_exports,
        SUM(record_count) as total_records_exported,
        SUM(file_size) as total_file_size,
        SUM(download_count) as total_downloads,
        COUNT(CASE WHEN export_type = 'excel' THEN 1 END) as excel_exports,
        COUNT(CASE WHEN export_type = 'pdf' THEN 1 END) as pdf_exports,
        COUNT(CASE WHEN export_type = 'csv' THEN 1 END) as csv_exports,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_exports,
        MAX(created_at) as last_export_date
      FROM exports 
      WHERE user_id = $1`,
      [userId]
    );
    
    res.json({
      success: true,
      stats: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error fetching export stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch export statistics'
    });
  }
});

/**
 * GET /api/exports/public/:id
 * Access a public export (no auth required)
 */
router.get('/public/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT 
        filename,
        file_path,
        export_type,
        entity_type,
        record_count,
        file_size,
        created_at
      FROM exports 
      WHERE id = $1 AND is_public = true`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Public export not found'
      });
    }
    
    // Increment download count
    await db.query(
      'UPDATE exports SET download_count = download_count + 1 WHERE id = $1',
      [id]
    );
    
    res.json({
      success: true,
      export: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error accessing public export:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to access public export'
    });
  }
});

/**
 * POST /api/exports/cleanup
 * Clean up expired exports (admin only)
 */
router.post('/cleanup', requireRole(['administrator']), async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM exports WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING *'
    );
    
    res.json({
      success: true,
      message: `Cleaned up ${result.rows.length} expired exports`,
      deleted_exports: result.rows
    });
    
  } catch (error) {
    console.error('Error cleaning up exports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup expired exports'
    });
  }
});

module.exports = router;
