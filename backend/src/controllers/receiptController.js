// ============================================
// Receipt Controller
// Upload and receipt management (no OCR)
// ============================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

// Upload directory — backend/uploads/receipts/
const UPLOAD_DIR = path.join(__dirname, '../../uploads/receipts');

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${uniqueSuffix}${ext}`);
  }
});

// File filter — only images
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WebP images are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// POST /api/receipts/upload — Upload and link receipt to a transaction
async function uploadReceipt(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const transaction_id = req.body.transaction_id;
    if (!transaction_id) {
      return res.status(400).json({ success: false, message: 'transaction_id is required.' });
    }

    // Look up the expense record linked to this transaction
    const [expenseRows] = await pool.query(
      'SELECT id FROM expenses WHERE transaction_id = ?',
      [transaction_id]
    );

    if (expenseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'No expense record found for this transaction.' });
    }

    const expense_id = expenseRows[0].id;

    // Delete any old receipt record for this expense (on edit, we overwrite)
    await pool.query('DELETE FROM receipts WHERE expense_id = ?', [expense_id]);

    // Insert new receipt record
    const [result] = await pool.query(
      'INSERT INTO receipts (expense_id, file_path, original_name) VALUES (?, ?, ?)',
      [expense_id, req.file.filename, req.file.originalname]
    );

    res.status(201).json({
      success: true,
      message: 'Receipt uploaded and saved.',
      data: {
        id: result.insertId,
        filePath: req.file.filename,
        originalName: req.file.originalname
      }
    });
  } catch (error) {
    console.error('Upload receipt error:', error);
    res.status(500).json({ success: false, message: 'Error saving receipt.' });
  }
}

// GET /api/receipts — List all receipts
async function getAll(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, e.category, e.description, t.amount, t.date
      FROM receipts r
      JOIN expenses e ON e.id = r.expense_id
      JOIN transactions t ON t.id = e.transaction_id
      ORDER BY r.uploaded_at DESC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /api/receipts/:id — Get single receipt
async function getOne(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, e.category, e.description, t.amount, t.date
      FROM receipts r
      JOIN expenses e ON e.id = r.expense_id
      JOIN transactions t ON t.id = e.transaction_id
      WHERE r.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /api/receipts/image/:filename — Serve receipt image
function serveImage(req, res) {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Image not found.' });
  }

  res.sendFile(filePath);
}

module.exports = {
  upload,
  uploadReceipt,
  getAll,
  getOne,
  serveImage
};
