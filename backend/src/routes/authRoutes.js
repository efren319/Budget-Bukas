// ============================================
// Auth Routes
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  register, login, getProfile, updateProfile, changePassword,
  registerValidation, loginValidation
} = require('../controllers/authController');

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);

// Protected routes
router.get('/me', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.put('/password', auth, changePassword);

module.exports = router;
