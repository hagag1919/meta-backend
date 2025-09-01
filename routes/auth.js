const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { 
  authRateLimit, 
  validateEmail, 
  validatePassword,
  sanitizeInput 
} = require('../middleware/security');

const router = express.Router();

// Email transporter configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '30d'
  });
};

// @route   POST /api/auth/register-request
// @desc    Request registration as client or developer
// @access  Public
router.post('/register-request', 
  authRateLimit,
  validateEmail,
  [
    body('first_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('First name must be 2-50 characters and contain only letters'),
    body('last_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Last name must be 2-50 characters and contain only letters'),
    body('role')
      .isIn(['developer', 'client'])
      .withMessage('Only developer and client roles are allowed for registration requests')
  ],
  async (req, res, next) => {
  try {
    const { email, first_name, last_name, phone, role = 'developer' } = req.body;

    // Block admin registration requests
    if (role === 'administrator') {
      return res.status(403).json({ error: 'Admin registration is not allowed through this endpoint' });
    }

    // Check if user already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    // Generate a random password
    const generatedPassword = crypto.randomBytes(8).toString('hex').slice(0, 12) + 'A1!';
    
    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(generatedPassword, saltRounds);

    // Insert new user with email_verified as false initially
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role, email_verified, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, false, true)
      RETURNING id, email, first_name, last_name, role, created_at
    `;
    
    const values = [email, hashedPassword, first_name, last_name, phone, role];
    const result = await db.query(query, values);
    const user = result.rows[0];

    // Send email with credentials
    try {
      await emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Welcome to Meta Project Management - Account Created',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to Meta Project Management!</h2>
            <p>Hello ${first_name} ${last_name},</p>
            <p>Your account has been created successfully. Here are your login credentials:</p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Password:</strong> ${generatedPassword}</p>
              <p><strong>Role:</strong> ${role}</p>
            </div>
            <p>Please keep these credentials safe and consider changing your password after your first login.</p>
            <p>You can access the system at: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login">Login Here</a></p>
            <p>Best regards,<br>Meta Project Management Team</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the registration if email fails
    }

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Add user to general chat room automatically
    try {
      // Find the general discussion room (where project_id is NULL and name contains 'General')
      const generalRoomQuery = `
        SELECT id FROM chat_rooms 
        WHERE project_id IS NULL 
        AND (LOWER(name) LIKE '%general%' OR LOWER(name) LIKE '%discussion%')
        LIMIT 1
      `;
      const generalRoomResult = await db.query(generalRoomQuery);
      
      if (generalRoomResult.rows.length > 0) {
        const generalRoomId = generalRoomResult.rows[0].id;
        
        // Add user to general chat room
        await db.query(
          'INSERT INTO chat_participants (chat_room_id, user_id) VALUES ($1, $2) ON CONFLICT (chat_room_id, user_id) DO NOTHING',
          [generalRoomId, user.id]
        );
      }
    } catch (chatError) {
      // Log the error but don't fail registration
      console.error('Failed to add user to general chat room:', chatError);
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'user_registration_requested', 'user', { email: user.email, role: user.role }]
    );

    res.status(201).json({
      message: 'Registration request processed successfully. Check your email for login credentials.',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/register-admin
// @desc    Register new admin user (restricted endpoint)
// @access  Private (Admin only)
router.post('/register-admin', 
  authenticateToken,
  authRateLimit,
  validateEmail,
  validatePassword,
  [
    body('first_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('First name must be 2-50 characters and contain only letters'),
    body('last_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Last name must be 2-50 characters and contain only letters')
  ],
  async (req, res, next) => {
  try {
    // Check if current user is admin
    const currentUserQuery = await db.query('SELECT role FROM users WHERE id = $1', [req.user.userId]);
    if (currentUserQuery.rows.length === 0 || currentUserQuery.rows[0].role !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can create admin accounts' });
    }

    const { email, password, first_name, last_name, phone } = req.body;

    // Check if user already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new admin user
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role, email_verified)
      VALUES ($1, $2, $3, $4, $5, 'administrator', true)
      RETURNING id, email, first_name, last_name, role, created_at
    `;
    
    const values = [email, hashedPassword, first_name, last_name, phone];
    const result = await db.query(query, values);
    const user = result.rows[0];

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Add user to general chat room automatically
    try {
      // Find the general discussion room (where project_id is NULL and name contains 'General')
      const generalRoomQuery = `
        SELECT id FROM chat_rooms 
        WHERE project_id IS NULL 
        AND (LOWER(name) LIKE '%general%' OR LOWER(name) LIKE '%discussion%')
        LIMIT 1
      `;
      const generalRoomResult = await db.query(generalRoomQuery);
      
      if (generalRoomResult.rows.length > 0) {
        const generalRoomId = generalRoomResult.rows[0].id;
        
        // Add user to general chat room
        await db.query(
          'INSERT INTO chat_participants (chat_room_id, user_id) VALUES ($1, $2) ON CONFLICT (chat_room_id, user_id) DO NOTHING',
          [generalRoomId, user.id]
        );
      }
    } catch (chatError) {
      // Log the error but don't fail registration
      console.error('Failed to add user to general chat room:', chatError);
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'admin_user_created', 'user', { email: user.email, created_by: req.user.userId }]
    );

    res.status(201).json({
      message: 'Admin user created successfully',
      user,
      token,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user
// @access  Public
router.post('/login',
  authRateLimit,
  validateEmail,
  [
    body('password')
      .isLength({ min: 1 })
      .withMessage('Password is required')
  ],
  async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const query = `
      SELECT id, email, password_hash, first_name, last_name, role, is_active, email_verified
      FROM users 
      WHERE email = $1
    `;
    
    const result = await db.query(query, [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Remove password hash from response
    delete user.password_hash;

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [user.id, 'user_login', 'user', { email: user.email }, req.ip]
    );

    res.json({
      message: 'Login successful',
      user,
      token,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token
// @access  Public
router.post('/refresh-token', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Check if user still exists
    const userQuery = 'SELECT id, email, role, is_active FROM users WHERE id = $1 AND is_active = true';
    const result = await db.query(userQuery, [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Generate new access token
    const newToken = generateToken(decoded.userId);

    res.json({
      token: newToken
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    next(error);
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const userQuery = 'SELECT id, email, first_name FROM users WHERE email = $1 AND is_active = true';
    const result = await db.query(userQuery, [email]);

    if (result.rows.length === 0) {
      // Don't reveal if email exists or not
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    // Save reset token
    await db.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );

    // Send email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Reset - Meta Software',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hi ${user.first_name},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Best regards,<br>Meta Software Team</p>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'password_reset_requested', 'user', { email: user.email }]
    );

    res.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    // Validate password strength
    if (password.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters and contain uppercase, lowercase, and number' 
      });
    }

    // Find user with valid reset token
    const userQuery = `
      SELECT id, email FROM users 
      WHERE password_reset_token = $1 
      AND password_reset_expires > CURRENT_TIMESTAMP 
      AND is_active = true
    `;
    
    const result = await db.query(userQuery, [token]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update password and clear reset token
    await db.query(
      `UPDATE users 
       SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL 
       WHERE id = $2`,
      [hashedPassword, user.id]
    );

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'password_reset_completed', 'user', { email: user.email }]
    );

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/change-password
// @desc    Change password (authenticated user)
// @access  Private
router.post('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    // Validate new password strength
    if (newPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({ 
        error: 'New password must be at least 8 characters and contain uppercase, lowercase, and number' 
      });
    }

    // Get current password hash
    const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
    const result = await db.query(userQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [userId, 'password_changed', 'user', {}]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (for logging purposes)
// @access  Private
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [userId, 'user_logout', 'user', {}]
    );

    res.json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/send-verification
// @desc    Send email verification link
// @access  Private
router.post('/send-verification', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check if user already verified
    const userQuery = 'SELECT email, email_verified, first_name FROM users WHERE id = $1';
    const result = await db.query(userQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Generate verification token (reuse password reset fields temporarily)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 3600000); // 24 hours

    // Save verification token in password reset fields (temporary approach)
    await db.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [verificationToken, verificationExpires, userId]
    );

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Email Verification - Meta Software',
      html: `
        <h2>Email Verification</h2>
        <p>Hi ${user.first_name},</p>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
        <p>Best regards,<br>Meta Software Team</p>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email with token
// @access  Public
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user with valid verification token (using password reset fields)
    const userQuery = `
      SELECT id, email FROM users 
      WHERE password_reset_token = $1 
      AND password_reset_expires > CURRENT_TIMESTAMP 
      AND is_active = true
    `;
    
    const result = await db.query(userQuery, [token]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = result.rows[0];

    // Update email verified status and clear token
    await db.query(
      `UPDATE users 
       SET email_verified = true, password_reset_token = NULL, password_reset_expires = NULL 
       WHERE id = $1`,
      [user.id]
    );

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'email_verified', 'user', { email: user.email }]
    );

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
