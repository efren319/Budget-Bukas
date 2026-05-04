// ============================================
// User Management Routes (Admin Only)
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const {
  userValidation,
  createUser,
  updateUser,
  resetPassword,
  toggleUserStatus,
  deleteUser
} = require('../controllers/userController');

// All routes require auth and admin privileges
router.use(auth);
router.use(adminOnly);

// Create new user
router.post('/', userValidation, createUser);

// Update user details
router.put('/:id', userValidation, updateUser);

// Reset user password
router.patch('/:id/password', resetPassword);

// Toggle user active status (soft delete)
router.patch('/:id/status', toggleUserStatus);

// Delete user (free email)
router.delete('/:id', deleteUser);

module.exports = router;
