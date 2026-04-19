// ============================================
// Express App Configuration
// ============================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS — allow env-based frontend origin in production
const corsOptions = {
  origin: function (origin, callback) {
    const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', process.env.FRONTEND_URL];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (public/ for HTML + assets, src/ for CSS + JS)
app.use(express.static(path.join(__dirname, '../../frontend/public')));
app.use(express.static(path.join(__dirname, '../../frontend/src')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/transactions', require('./routes/transactionRoutes'));
app.use('/api/receipts', require('./routes/receiptRoutes'));
app.use('/api/chatbot', require('./routes/chatbotRoutes'));

// Serve dashboard for SPA routes
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/dashboard.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON.' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Max 5MB.' });
  }

  res.status(500).json({ success: false, message: 'Internal server error.' });
});

module.exports = app;
