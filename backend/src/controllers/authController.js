// ============================================
// Auth Controller
// Handles registration, login, and profile
// ============================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Avatar setup
const AVATAR_DIR = path.join(__dirname, '../../uploads/avatars');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
    cb(null, AVATAR_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// Validation rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['officer', 'member']).withMessage('Invalid role')
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

// Register new user
async function register(req, res) {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    // Check if email already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Hash password (12 rounds)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role || 'member']
    );

    // Generate token
    const token = generateToken({ 
      id: result.insertId, 
      name, 
      email, 
      role: role || 'member' 
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: { id: result.insertId, name, email, role: role || 'member' }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration.',
      debug: error.message,
      stack: error.stack
    });
  }
}

// Login user
async function login(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = users[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Generate token
    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        avatar_url: user.avatar_url 
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
}

// Get current user profile
async function getProfile(req, res) {
  try {
    const [users] = await pool.query(
      'SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, user: users[0] });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// Update profile
async function updateProfile(req, res) {
  try {
    const { name, email } = req.body;
    
    await pool.query(
      'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?',
      [name, email, req.user.id]
    );

    res.json({ success: true, message: 'Profile updated.' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// Change password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Valid passwords required (min 6 chars).' });
    }

    // Verify current password
    const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, users[0].password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// Helper: Generate JWT
function generateToken(payload) {
  const secret = process.env.JWT_SECRET || 'budgetbukas_secret_fallback_123';
  return jwt.sign(payload, secret, { expiresIn: '24h' });
}

// Upload Avatar endpoint
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    const avatarUrl = req.file.filename;
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);
    res.json({ success: true, message: 'Avatar updated', data: { avatar_url: avatarUrl } });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Serve Avatar endpoint
function serveAvatar(req, res) {
  const filePath = path.join(AVATAR_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ success: false, message: 'Not found' });
  }
}

// Get all users for Members Panels
async function getAllUsers(req, res) {
  try {
    const [users] = await pool.query(`
      SELECT name, role, avatar_url 
      FROM users 
      ORDER BY 
        CASE WHEN role = 'officer' THEN 0 ELSE 1 END,
        name ASC
    `);
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving members.' });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
  serveAvatar,
  getAllUsers,
  upload,
  registerValidation,
  loginValidation
};
