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

// Avatar setup — store in DB (memory storage, no disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// Auto-migrate: add avatar_data and avatar_mime columns if missing
async function migrateAvatarColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(100)`);
    console.log('✅ Avatar DB columns ready (avatar_data, avatar_mime)');
  } catch (e) {
    console.warn('Avatar migration note:', e.message);
  }
}
migrateAvatarColumns();



const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

// Login user
async function login(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    // Hardcoded bypass for Demo Login (Local/Testing)
    if (email === 'demo@test.com' && password === 'demo123') {
      console.log('✨ Demo login detected. Bypassing database check.');
      return res.json({
        success: true,
        message: 'Login successful (Demo Mode).',
        token: generateToken({ id: 0, name: 'Demo Admin', email: 'demo@test.com', role: 'admin' }),
        user: { 
          id: 0, 
          name: 'Demo Admin', 
          email: 'demo@test.com', 
          role: 'admin', 
          position: 'System Administrator',
          must_change_password: false,
          avatar_url: null 
        }
      });
    }

    console.time('login-query');
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    console.timeEnd('login-query');

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = users[0];

    // Check if active
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact administrator.' });
    }

    // Verify password
    console.time('login-bcrypt');
    const isMatch = await bcrypt.compare(password, user.password);
    console.timeEnd('login-bcrypt');
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
        position: user.position,
        must_change_password: user.must_change_password,
        avatar_url: user.avatar_url 
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login.',
      debug: error.message,
      stack: error.stack
    });
  }
}

// Force change password (for first login)
async function forceChangePassword(req, res) {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password and must_change_password flag
    await pool.query(
      'UPDATE users SET password = ?, must_change_password = FALSE WHERE id = ?', 
      [hashedPassword, req.user.id]
    );

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Force change password error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// Get current user profile
async function getProfile(req, res) {
  try {
    const [users] = await pool.query(
      'SELECT id, name, email, role, position, avatar_url, must_change_password, created_at FROM users WHERE id = ?',
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

// Force change password (for first login)
async function forceChangePassword(req, res) {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password and must_change_password flag
    await pool.query(
      'UPDATE users SET password = ?, must_change_password = FALSE WHERE id = ?', 
      [hashedPassword, req.user.id]
    );

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Force change password error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// Helper: Generate JWT
function generateToken(payload) {
  const secret = process.env.JWT_SECRET || 'pondosync_secret_fallback_123';
  return jwt.sign(payload, secret, { expiresIn: '24h' });
}

// Upload Avatar endpoint — saves image as base64 in the database
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const base64Data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Store image data in DB and set avatar_url to the user's own ID
    await pool.query(
      'UPDATE users SET avatar_data = ?, avatar_mime = ?, avatar_url = ? WHERE id = ?',
      [base64Data, mimeType, req.user.id.toString(), req.user.id]
    );

    res.json({
      success: true,
      message: 'Avatar updated',
      data: { avatar_url: req.user.id.toString() }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Generate a simplified default initials SVG avatar (black & gold theme)
function generateInitialsSvg(name) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#1a1408"/>
      <stop offset="100%" stop-color="#0d0a04"/>
    </radialGradient>
    <linearGradient id="letterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#f2dab2"/>
      <stop offset="100%"  stop-color="#d3ac77"/>
    </linearGradient>
  </defs>
  <!-- Base circle -->
  <circle cx="60" cy="60" r="60" fill="url(#bgGrad)"/>
  <!-- Letter -->
  <text
    x="60" y="80"
    font-family="Georgia, 'Palatino Linotype', 'Times New Roman', serif"
    font-size="64"
    font-weight="bold"
    fill="url(#letterGrad)"
    text-anchor="middle"
  >${initial}</text>
</svg>`;
}

// Delete Avatar endpoint — removes custom photo and reverts to initials
async function deleteAvatar(req, res) {
  try {
    await pool.query(
      'UPDATE users SET avatar_data = NULL, avatar_mime = NULL, avatar_url = NULL WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, message: 'Avatar removed' });
  } catch (error) {
    console.error('Avatar delete error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Serve Avatar endpoint — reads from DB, or returns initials SVG
async function serveAvatar(req, res) {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(generateInitialsSvg('?'));
    }

    const [rows] = await pool.query(
      'SELECT name, avatar_data, avatar_mime FROM users WHERE id = ?',
      [userId]
    );

    if (!rows || rows.length === 0) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(generateInitialsSvg('?'));
    }

    const user = rows[0];

    if (user.avatar_data) {
      const imgBuffer = Buffer.from(user.avatar_data, 'base64');
      res.setHeader('Content-Type', user.avatar_mime || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imgBuffer);
    }

    // No photo — serve initials SVG
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(generateInitialsSvg(user.name));
  } catch (error) {
    console.error('Serve avatar error:', error);
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.send(generateInitialsSvg('?'));
  }
}

// Get all users for Members Panels
async function getAllUsers(req, res) {
  try {
    // Prevent any caching so deployed site always gets fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    let query = `
      SELECT id, name, email, role, position, avatar_url, is_active, must_change_password, created_at 
      FROM users 
      WHERE email NOT LIKE '%_deleted_%'
    `;
    
    if (req.user.role !== 'admin') {
      query += ` AND is_active = TRUE `;
    }
    
    query += `
      ORDER BY 
        CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
        name ASC
    `;

    const [users] = await pool.query(query);
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving members.' });
  }
}

module.exports = {
  login,
  getProfile,
  updateProfile,
  changePassword,
  forceChangePassword,
  uploadAvatar,
  deleteAvatar,
  serveAvatar,
  getAllUsers,
  upload,
  loginValidation
};
