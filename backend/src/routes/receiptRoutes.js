// ============================================
// Receipt Routes
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const {
  upload, uploadReceipt, getAll, getOne, serveImage
} = require('../controllers/receiptController');

// Upload receipt and link to transaction (admins only)
router.post('/upload', auth, requireRole('admin'), upload.single('receipt'), uploadReceipt);

// View receipts (any authenticated user)
router.get('/', auth, getAll);
// Image serving is PUBLIC — img tags can't send auth headers; filenames are random/unguessable
router.get('/image/:filename', serveImage);
router.get('/:id', auth, getOne);

module.exports = router;
