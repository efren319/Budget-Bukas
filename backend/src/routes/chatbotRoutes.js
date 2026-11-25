// ============================================
// Chatbot Routes
// ============================================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { handleQuery } = require('../controllers/chatbotController');

router.post('/query', auth, handleQuery);

module.exports = router;
