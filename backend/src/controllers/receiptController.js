// ============================================
// Receipt Controller
// Upload, OCR processing, and receipt management
// ============================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { parseReceipt } = require('../utils/ocrParser');

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

// POST /api/receipts/upload — Upload and scan receipt
async function uploadReceipt(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    // Run OCR on uploaded image
    const ocrResult = await parseReceipt(req.file.path);

    res.json({
      success: true,
      message: 'Receipt scanned successfully.',
      data: {
        filePath: req.file.filename,
        originalName: req.file.originalname,
        ocr: ocrResult
      }
    });
  } catch (error) {
    console.error('Upload receipt error:', error);
    res.status(500).json({ success: false, message: 'Error processing receipt.' });
  }
}

// POST /api/receipts/save — Save receipt record (after user confirms data)
async function saveReceipt(req, res) {
  try {
    const { expense_id, file_path, extracted_text, original_name } = req.body;

    if (!expense_id || !file_path) {
      return res.status(400).json({ success: false, message: 'expense_id and file_path required.' });
    }

    const [result] = await pool.query(
      'INSERT INTO receipts (expense_id, file_path, original_name, extracted_text) VALUES (?, ?, ?, ?)',
      [expense_id, file_path, original_name || null, extracted_text || null]
    );

    res.status(201).json({
      success: true,
      message: 'Receipt saved.',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Save receipt error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
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
  saveReceipt,
  getAll,
  getOne,
  serveImage
};
