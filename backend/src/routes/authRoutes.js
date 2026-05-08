const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  login, getProfile, updateProfile, changePassword,
  uploadAvatar, deleteAvatar, serveAvatar, getAllUsers, upload,
  loginValidation, forceChangePassword
} = require('../controllers/authController');

// Public routes
router.post('/login', loginValidation, login);

// Protected routes
router.get('/me', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.put('/password', auth, changePassword);
router.put('/force-change-password', auth, forceChangePassword);
router.post('/avatar', auth, upload.single('avatar'), uploadAvatar);
router.delete('/avatar', auth, deleteAvatar);
router.get('/avatar/:userId', serveAvatar);
router.get('/users', auth, getAllUsers);

module.exports = router;
