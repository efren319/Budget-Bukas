// ============================================
// Receipt Controller
// Stores images as base64 in DB — no filesystem dependency
// ============================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

// Multer uses memory storage so we never need to write to disk
const storage = multer.memoryStorage();

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

    // Convert uploaded buffer to a base64 data URI — stored directly in DB
    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

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

    // Insert new receipt with base64 data URI stored as file_path
    const [result] = await pool.query(
      'INSERT INTO receipts (expense_id, file_path, original_name) VALUES (?, ?, ?)',
      [expense_id, dataUri, req.file.originalname]
    );

    res.status(201).json({
      success: true,
      message: 'Receipt uploaded and saved.',
      data: { id: result.insertId }
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
      SELECT r.id, r.expense_id, r.file_path, r.original_name, r.uploaded_at,
             e.category, e.description, t.amount, t.date
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
      SELECT r.id, r.expense_id, r.file_path, r.original_name, r.uploaded_at,
             e.category, e.description, t.amount, t.date
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

module.exports = {
  upload,
  uploadReceipt,
  getAll,
  getOne
};
