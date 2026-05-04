// ============================================
// Receipt Routes
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const {
  upload, uploadReceipt, saveReceipt, getAll, getOne, serveImage
} = require('../controllers/receiptController');

// Upload and scan (admins only)
router.post('/upload', auth, requireRole('admin'), upload.single('receipt'), uploadReceipt);
router.post('/save', auth, requireRole('admin'), saveReceipt);

// View receipts (any authenticated user)
router.get('/', auth, getAll);
router.get('/:id', auth, getOne);
router.get('/image/:filename', auth, serveImage);

module.exports = router;
