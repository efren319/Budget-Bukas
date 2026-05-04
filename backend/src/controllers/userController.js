// ============================================
// User Controller (Admin Only)
// Handles CRUD operations for users by admins
// ============================================
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');

// Validation rules
const userValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(['admin', 'viewer']).withMessage('Invalid role'),
  body('position').notEmpty().withMessage('Position is required')
];

// Generate a random password
function generateRandomPassword(length = 10) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let password = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  return password;
}

// Create new user (Admin only)
async function createUser(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, role, position } = req.body;

    // Check if email already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Generate random password
    const rawPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role, position, must_change_password) VALUES (?, ?, ?, ?, ?, TRUE)',
      [name, email, hashedPassword, role, position]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: { id: result.insertId, name, email, role, position },
      generatedPassword: rawPassword // Only returned once upon creation!
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Server error during user creation.' });
  }
}

// Update user details (Admin only)
async function updateUser(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.params.id;
    const { name, email, role, position } = req.body;

    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Update user
    await pool.query(
      'UPDATE users SET name = ?, email = ?, role = ?, position = ? WHERE id = ?',
      [name, email, role, position, userId]
    );

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error during user update.' });
  }
}

// Reset password (Admin only)
async function resetPassword(req, res) {
  try {
    const userId = req.params.id;

    // Check if user exists
    const [existing] = await pool.query('SELECT id, must_change_password FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Generate new random password
    const rawPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    // Update password and force change
    await pool.query(
      'UPDATE users SET password = ?, must_change_password = TRUE WHERE id = ?',
      [hashedPassword, userId]
    );

    res.json({ 
      success: true, 
      message: 'Password reset successfully.',
      generatedPassword: rawPassword 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error during password reset.' });
  }
}

// Toggle user status / Soft Delete (Admin only)
async function toggleUserStatus(req, res) {
  try {
    const userId = req.params.id;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'is_active must be a boolean.' });
    }

    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent deactivating oneself
    if (parseInt(userId) === req.user.id) {
       return res.status(403).json({ success: false, message: 'Cannot deactivate your own account.' });
    }

    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, userId]);

    res.json({ success: true, message: `User ${is_active ? 'activated' : 'deactivated'} successfully.` });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ success: false, message: 'Server error during status toggle.' });
  }
}

// Delete user (Soft delete + Free up email)
async function deleteUser(req, res) {
  try {
    const userId = req.params.id;

    // Check if user exists
    const [existing] = await pool.query('SELECT id, email, role FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent deleting the main admin
    if (existing[0].role === 'admin' && existing[0].id === 1) {
      return res.status(403).json({ success: false, message: 'Cannot delete the primary administrator.' });
    }

    // Soft delete + modify email to free it up for re-registration
    // Using string concatenation to make the email unique
    await pool.query(
      "UPDATE users SET email = email || '_deleted_' || id, is_active = FALSE WHERE id = ?",
      [userId]
    );

    res.json({ success: true, message: 'User permanently removed. Email has been freed.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error during user deletion.' });
  }
}

module.exports = {
  userValidation,
  createUser,
  updateUser,
  resetPassword,
  toggleUserStatus,
  deleteUser
};
