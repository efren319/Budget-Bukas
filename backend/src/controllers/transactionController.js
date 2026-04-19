// ============================================
// Transaction Controller
// Full CRUD for income and expenses
// ============================================
const { body, query, validationResult } = require('express-validator');
const pool = require('../config/db');

// Validation rules for creating/updating transactions
const transactionValidation = [
  body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('date').isISO8601().withMessage('Valid date required (YYYY-MM-DD)'),
  body('source').if(body('type').equals('income')).notEmpty().withMessage('Source required for income'),
  body('category').if(body('type').equals('expense')).notEmpty().withMessage('Category required for expense')
];

// GET /api/transactions — List all (with filters)
async function getAll(req, res) {
  try {
    const { type, category, startDate, endDate, search, sort, order, page, limit } = req.query;

    let sql = `
      SELECT 
        t.id, t.type, t.amount, t.date, t.created_at, t.user_id,
        u.name AS user_name,
        i.source,
        e.category, e.description,
        r.id AS receipt_id, r.file_path AS receipt_path
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN income i ON i.transaction_id = t.id
      LEFT JOIN expenses e ON e.transaction_id = t.id
      LEFT JOIN receipts r ON r.expense_id = e.id
      WHERE 1=1
    `;
    const params = [];

    // Apply filters
    if (type) {
      sql += ' AND t.type = ?';
      params.push(type);
    }
    if (category) {
      sql += ' AND e.category = ?';
      params.push(category);
    }
    if (startDate) {
      sql += ' AND t.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND t.date <= ?';
      params.push(endDate);
    }
    if (search) {
      sql += ' AND (i.source LIKE ? OR e.description LIKE ? OR e.category LIKE ?)';
      const searchVal = `%${search}%`;
      params.push(searchVal, searchVal, searchVal);
    }

    // Sorting
    const sortCol = ['date', 'amount', 'type', 'created_at'].includes(sort) ? sort : 'date';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY t.${sortCol} ${sortOrder}`;

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const offset = (pageNum - 1) * limitNum;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const [rows] = await pool.query(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) AS total FROM transactions t';
    const countParams = [];
    if (type) {
      countSql += ' WHERE t.type = ?';
      countParams.push(type);
    }
    const [countResult] = await pool.query(countSql, countParams);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult[0].total
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /api/transactions/:id — Get single transaction
async function getOne(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT 
        t.*, u.name AS user_name,
        i.source,
        e.category, e.description,
        r.id AS receipt_id, r.file_path AS receipt_path, r.extracted_text
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN income i ON i.transaction_id = t.id
      LEFT JOIN expenses e ON e.transaction_id = t.id
      LEFT JOIN receipts r ON r.expense_id = e.id
      WHERE t.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// POST /api/transactions — Create new transaction
async function create(req, res) {
  const connection = await pool.getConnection();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { type, amount, date, source, category, description } = req.body;

    await connection.beginTransaction();

    // Insert parent transaction
    const [txResult] = await connection.query(
      'INSERT INTO transactions (type, amount, date, user_id) VALUES (?, ?, ?, ?)',
      [type, amount, date, req.user.id]
    );
    const transactionId = txResult.insertId;

    // Insert child record
    if (type === 'income') {
      await connection.query(
        'INSERT INTO income (transaction_id, source) VALUES (?, ?)',
        [transactionId, source]
      );
    } else {
      await connection.query(
        'INSERT INTO expenses (transaction_id, category, description) VALUES (?, ?, ?)',
        [transactionId, category, description || null]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Transaction created.',
      data: { id: transactionId, type, amount, date }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create transaction error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    connection.release();
  }
}

// PUT /api/transactions/:id — Update transaction
async function update(req, res) {
  const connection = await pool.getConnection();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { type, amount, date, source, category, description } = req.body;
    const { id } = req.params;

    // Check if transaction exists
    const [existing] = await connection.query('SELECT * FROM transactions WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    await connection.beginTransaction();

    // Update parent
    await connection.query(
      'UPDATE transactions SET type = ?, amount = ?, date = ? WHERE id = ?',
      [type, amount, date, id]
    );

    // Update or recreate child records
    // Delete old child records
    await connection.query('DELETE FROM income WHERE transaction_id = ?', [id]);
    await connection.query('DELETE FROM expenses WHERE transaction_id = ?', [id]);

    // Insert new child
    if (type === 'income') {
      await connection.query(
        'INSERT INTO income (transaction_id, source) VALUES (?, ?)',
        [id, source]
      );
    } else {
      await connection.query(
        'INSERT INTO expenses (transaction_id, category, description) VALUES (?, ?, ?)',
        [id, category, description || null]
      );
    }

    await connection.commit();

    res.json({ success: true, message: 'Transaction updated.' });
  } catch (error) {
    await connection.rollback();
    console.error('Update transaction error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    connection.release();
  }
}

// DELETE /api/transactions/:id
async function remove(req, res) {
  try {
    const [result] = await pool.query('DELETE FROM transactions WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    res.json({ success: true, message: 'Transaction deleted.' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /api/dashboard/stats — Summary statistics
async function getStats(req, res) {
  try {
    // Get total balance
    const [balance] = await pool.query('SELECT * FROM total_balance');

    // Get this month's data
    const now = new Date();
    const [monthly] = await pool.query(`
      SELECT 
        type,
        SUM(amount) AS total,
        COUNT(*) AS count
      FROM transactions
      WHERE MONTH(date) = ? AND YEAR(date) = ?
      GROUP BY type
    `, [now.getMonth() + 1, now.getFullYear()]);

    // Get recent transactions
    const [recent] = await pool.query(`
      SELECT t.id, t.type, t.amount, t.date, u.name AS user_name,
             i.source, e.category, e.description
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN income i ON i.transaction_id = t.id
      LEFT JOIN expenses e ON e.transaction_id = t.id
      ORDER BY t.created_at DESC
      LIMIT 5
    `);

    // Get category breakdown
    const [categories] = await pool.query(`
      SELECT e.category, SUM(t.amount) AS total, COUNT(*) AS count
      FROM transactions t
      JOIN expenses e ON e.transaction_id = t.id
      WHERE t.type = 'expense'
      GROUP BY e.category
      ORDER BY total DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        balance: balance[0],
        monthly,
        recent,
        categories
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /api/dashboard/chart — Chart data (monthly breakdown)
async function getChartData(req, res) {
  try {
    const { period } = req.query; // 'week', 'month', 'year'
    
    let sql;
    if (period === 'week') {
      sql = `
        SELECT DATE(date) AS label,
               SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
        FROM transactions
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(date)
        ORDER BY label
      `;
    } else if (period === 'year') {
      sql = `
        SELECT DATE_FORMAT(date, '%Y-%m') AS label,
               SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
        FROM transactions
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(date, '%Y-%m')
        ORDER BY label
      `;
    } else {
      // Default: month (last 30 days)
      sql = `
        SELECT DATE(date) AS label,
               SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
        FROM transactions
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(date)
        ORDER BY label
      `;
    }

    const [rows] = await pool.query(sql);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Chart data error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /api/transactions/categories — Get unique categories
async function getCategories(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT category FROM expenses ORDER BY category'
    );
    res.json({ success: true, data: rows.map(r => r.category) });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  getStats,
  getChartData,
  getCategories,
  transactionValidation
};
