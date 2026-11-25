// ============================================
// User Controller (Admin Only)
// Handles CRUD operations for users by admins
// ============================================
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { hashPassword } = require('../utils/password');

// Ensure transactions.user_id allows NULL and uses ON DELETE SET NULL so users can be hard-deleted safely
async function ensureHardUserDeleteSchema() {
  try {
    const [colRows] = await pool.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'user_id'
    `);
    const [fkRows] = await pool.query(`
      SELECT confdeltype
      FROM pg_constraint
      WHERE conrelid = 'transactions'::regclass AND conname = 'transactions_user_id_fkey'
    `);

    if (colRows[0] && colRows[0].is_nullable === 'NO') {
      await pool.query('ALTER TABLE transactions ALTER COLUMN user_id DROP NOT NULL');
    }
    if (fkRows[0] && fkRows[0].confdeltype !== 'n') {
      await pool.query('ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey');
      await pool.query(`
        ALTER TABLE transactions
        ADD CONSTRAINT transactions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      `);
    }
    await pool.query("DELETE FROM users WHERE email LIKE '%_deleted_%'");
  } catch (e) {
    console.warn('User deletion FK migration note:', e.message);
  }
}
const userDeleteSchemaReady = ensureHardUserDeleteSchema();

// Validation rules
const userValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(['admin', 'viewer', 'user']).withMessage('Invalid role'),
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

    let { name, email, role, position } = req.body;
    email = email.trim().toLowerCase();
    role = role === 'user' ? 'viewer' : role;

    // Check if email already exists (case-insensitive)
    const [existing] = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Generate random password
    const rawPassword = generateRandomPassword(12);
    const hashedPassword = await hashPassword(rawPassword);

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
    let { name, email, role, position } = req.body;
    email = email.trim().toLowerCase();
    role = role === 'user' ? 'viewer' : role;

    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent colliding with another user's email
    const [emailConflict] = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?', [email, userId]);
    if (emailConflict.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
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
    const hashedPassword = await hashPassword(rawPassword);

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

// Delete user (Permanently delete row from database)
async function deleteUser(req, res) {
  try {
    await userDeleteSchemaReady;
    const userId = req.params.id;

    // Check if user exists
    const [existing] = await pool.query('SELECT id, email, role FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent deleting oneself
    if (parseInt(userId, 10) === req.user.id) {
      return res.status(403).json({ success: false, message: 'Cannot delete your own account.' });
    }

    // Prevent deleting the main admin
    if (existing[0].role === 'admin' && existing[0].id === 1) {
      return res.status(403).json({ success: false, message: 'Cannot delete the primary administrator.' });
    }

    // Permanently delete user from the database (transactions.user_id becomes NULL via ON DELETE SET NULL)
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: 'User permanently deleted from the database.' });
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
