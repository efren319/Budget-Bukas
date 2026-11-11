// ============================================
// Chatbot Routes
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { handleQuery, handleUsageStatus } = require('../controllers/chatbotController');

router.post('/query', auth, handleQuery);
router.get('/usage', auth, handleUsageStatus);

module.exports = router;
