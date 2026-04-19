// ============================================
// Transaction Routes
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const {
  getAll, getOne, create, update, remove,
  getStats, getChartData, getCategories,
  transactionValidation
} = require('../controllers/transactionController');

// Dashboard endpoints (any authenticated user)
router.get('/dashboard/stats', auth, getStats);
router.get('/dashboard/chart', auth, getChartData);

// Categories list
router.get('/categories', auth, getCategories);

// Transaction CRUD
router.get('/', auth, getAll);
router.get('/:id', auth, getOne);
router.post('/', auth, requireRole('officer'), transactionValidation, create);
router.put('/:id', auth, requireRole('officer'), transactionValidation, update);
router.delete('/:id', auth, requireRole('officer'), remove);

module.exports = router;
