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
        r.id AS receipt_id
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
    const allowedSortCols = {
      date: 't.date',
      amount: 't.amount',
      type: 't.type',
      created_at: 't.created_at',
      user_name: 'u.name'
    };
    const sortSQL = allowedSortCols[sort] || 't.date';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortSQL} ${sortOrder}`;

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const offset = (pageNum - 1) * limitNum;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const [rows] = await pool.query(sql, params);

    // Get total count for pagination (matching all filters)
    let countSql = `
      SELECT COUNT(*) AS total 
      FROM transactions t
      LEFT JOIN income i ON i.transaction_id = t.id
      LEFT JOIN expenses e ON e.transaction_id = t.id
      WHERE 1=1
    `;
    const countParams = [];

    if (type) {
      countSql += ' AND t.type = ?';
      countParams.push(type);
    }
    if (category) {
      countSql += ' AND e.category = ?';
      countParams.push(category);
    }
    if (startDate) {
      countSql += ' AND t.date >= ?';
      countParams.push(startDate);
    }
    if (endDate) {
      countSql += ' AND t.date <= ?';
      countParams.push(endDate);
    }
    if (search) {
      countSql += ' AND (i.source LIKE ? OR e.description LIKE ? OR e.category LIKE ?)';
      const searchVal = `%${search}%`;
      countParams.push(searchVal, searchVal, searchVal);
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
        r.id AS receipt_id
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

    // Update parent transaction
    await connection.query(
      'UPDATE transactions SET type = ?, amount = ?, date = ? WHERE id = ?',
      [type, amount, date, id]
    );

    if (type === 'income') {
      // Update income child row, or insert if missing
      const [incomeRows] = await connection.query('SELECT id FROM income WHERE transaction_id = ?', [id]);
      if (incomeRows.length > 0) {
        await connection.query('UPDATE income SET source = ? WHERE transaction_id = ?', [source, id]);
      } else {
        await connection.query('INSERT INTO income (transaction_id, source) VALUES (?, ?)', [id, source]);
      }
      // Remove any leftover expense row (type switched)
      await connection.query('DELETE FROM expenses WHERE transaction_id = ?', [id]);
    } else {
      // Update expense child row, or insert if missing — PRESERVE existing row to keep receipt FK intact
      const [expenseRows] = await connection.query('SELECT id FROM expenses WHERE transaction_id = ?', [id]);
      if (expenseRows.length > 0) {
        await connection.query(
          'UPDATE expenses SET category = ?, description = ? WHERE transaction_id = ?',
          [category, description || null, id]
        );
      } else {
        await connection.query(
          'INSERT INTO expenses (transaction_id, category, description) VALUES (?, ?, ?)',
          [id, category, description || null]
        );
      }
      // Remove any leftover income row (type switched)
      await connection.query('DELETE FROM income WHERE transaction_id = ?', [id]);
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
      WHERE EXTRACT(MONTH FROM date) = ? AND EXTRACT(YEAR FROM date) = ?
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
        SELECT date::date AS label,
               SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
        FROM transactions
        WHERE date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY date::date
        ORDER BY label
      `;
    } else if (period === 'year') {
      sql = `
        SELECT TO_CHAR(date, 'YYYY-MM') AS label,
               SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
        FROM transactions
        WHERE date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY label
      `;
    } else {
      // Default: month (last 30 days)
      sql = `
        SELECT date::date AS label,
               SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
               SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
        FROM transactions
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY date::date
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

// GET /api/transactions/dashboard/analytics — Financial Analytics endpoint
async function getAnalyticsData(req, res) {
  try {
    let { startDate, endDate, groupBy, tab } = req.query;

    // Defaults
    const now = new Date();
    if (!startDate) {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (!endDate) {
      endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    if (!groupBy || !['day', 'week', 'month', 'year'].includes(groupBy)) {
      groupBy = 'day';
    }
    if (!tab || !['cashflow', 'expenses', 'income', 'reports'].includes(tab)) {
      tab = 'cashflow';
    }

    // Calculate previous period (same duration, immediately before startDate)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 86400000); // day before startDate
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const prevStartDate = prevStart.toISOString().slice(0, 10);
    const prevEndDate = prevEnd.toISOString().slice(0, 10);

    // ── 1. Summary ──
    const [summaryRows] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "totalIncome",
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "totalExpenses"
      FROM transactions
      WHERE date >= ? AND date <= ?
    `, [startDate, endDate]);

    const totalIncome = parseFloat(summaryRows[0].totalIncome);
    const totalExpenses = parseFloat(summaryRows[0].totalExpenses);
    const netBalance = totalIncome - totalExpenses;

    // Remaining balance: cumulative all-time balance up to endDate
    const [remainingRows] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "remainingBalance"
      FROM transactions
      WHERE date <= ?
    `, [endDate]);
    const remainingBalance = parseFloat(remainingRows[0].remainingBalance);

    // ── 2. Comparison (previous period) ──
    const [prevRows] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "prevTotalIncome",
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "prevTotalExpenses"
      FROM transactions
      WHERE date >= ? AND date <= ?
    `, [prevStartDate, prevEndDate]);

    const prevTotalIncome = parseFloat(prevRows[0].prevTotalIncome);
    const prevTotalExpenses = parseFloat(prevRows[0].prevTotalExpenses);
    const prevNetBalance = prevTotalIncome - prevTotalExpenses;

    function safePercentChange(current, previous) {
      if (previous === 0 && current === 0) return 0;
      if (previous === 0) return null;
      return parseFloat((((current - previous) / previous) * 100).toFixed(2));
    }

    const comparison = {
      prevTotalIncome,
      prevTotalExpenses,
      prevNetBalance,
      incomeChange: safePercentChange(totalIncome, prevTotalIncome),
      expensesChange: safePercentChange(totalExpenses, prevTotalExpenses),
      netBalanceChange: safePercentChange(netBalance, prevNetBalance)
    };

    // ── 3. Chart ──
    let chartLabelExpr;
    let chartGroupExpr;
    if (groupBy === 'day') {
      chartLabelExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
      chartGroupExpr = `TO_CHAR(date, 'YYYY-MM-DD')`;
    } else if (groupBy === 'week') {
      chartLabelExpr = `TO_CHAR(DATE_TRUNC('week', date), 'YYYY-MM-DD')`;
      chartGroupExpr = `DATE_TRUNC('week', date)`;
    } else if (groupBy === 'month') {
      chartLabelExpr = `TO_CHAR(date, 'YYYY-MM')`;
      chartGroupExpr = `TO_CHAR(date, 'YYYY-MM')`;
    } else {
      chartLabelExpr = `TO_CHAR(date, 'YYYY')`;
      chartGroupExpr = `TO_CHAR(date, 'YYYY')`;
    }

    const [chartRows] = await pool.query(`
      SELECT
        ${chartLabelExpr} AS label,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
      FROM transactions
      WHERE date >= ? AND date <= ?
      GROUP BY ${chartGroupExpr}
      ORDER BY ${chartGroupExpr}
    `, [startDate, endDate]);

    const chart = chartRows.map(r => ({
      label: r.label,
      income: parseFloat(r.income),
      expenses: parseFloat(r.expenses)
    }));

    // ── 4. Breakdown (expenses or income tab only) ──
    let breakdown = undefined;
    if (tab === 'expenses') {
      const [catRows] = await pool.query(`
        SELECT e.category AS name,
               COALESCE(SUM(t.amount), 0) AS total,
               COUNT(*) AS count
        FROM transactions t
        JOIN expenses e ON e.transaction_id = t.id
        WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
        GROUP BY e.category
        ORDER BY total DESC
      `, [startDate, endDate]);
      breakdown = {
        categories: catRows.map(r => ({ name: r.name, total: parseFloat(r.total), count: parseInt(r.count) }))
      };
    } else if (tab === 'income') {
      const [srcRows] = await pool.query(`
        SELECT i.source AS name,
               COALESCE(SUM(t.amount), 0) AS total,
               COUNT(*) AS count
        FROM transactions t
        JOIN income i ON i.transaction_id = t.id
        WHERE t.type = 'income' AND t.date >= ? AND t.date <= ?
        GROUP BY i.source
        ORDER BY total DESC
      `, [startDate, endDate]);
      breakdown = {
        sources: srcRows.map(r => ({ name: r.name, total: parseFloat(r.total), count: parseInt(r.count) }))
      };
    }

    // ── 5. Top Record (expenses or income tab only) ──
    let topRecord = undefined;
    if (tab === 'expenses') {
      const [topRows] = await pool.query(`
        SELECT t.amount, e.category AS label, t.date
        FROM transactions t
        JOIN expenses e ON e.transaction_id = t.id
        WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
        ORDER BY t.amount DESC
        LIMIT 1
      `, [startDate, endDate]);
      if (topRows.length > 0) {
        topRecord = { amount: parseFloat(topRows[0].amount), label: topRows[0].label, date: topRows[0].date };
      }
    } else if (tab === 'income') {
      const [topRows] = await pool.query(`
        SELECT t.amount, i.source AS label, t.date
        FROM transactions t
        JOIN income i ON i.transaction_id = t.id
        WHERE t.type = 'income' AND t.date >= ? AND t.date <= ?
        ORDER BY t.amount DESC
        LIMIT 1
      `, [startDate, endDate]);
      if (topRows.length > 0) {
        topRecord = { amount: parseFloat(topRows[0].amount), label: topRows[0].label, date: topRows[0].date };
      }
    }

    // ── 6. Insight ──
    let insight = 'No transactions recorded in this period.';
    if (totalIncome > 0 || totalExpenses > 0) {
      if (tab === 'expenses' && breakdown && breakdown.categories && breakdown.categories.length > 0) {
        const topCat = breakdown.categories[0];
        if (comparison.expensesChange !== null && comparison.expensesChange !== 0) {
          const direction = comparison.expensesChange > 0 ? 'increased' : 'decreased';
          insight = `Expenses ${direction} by ${Math.abs(comparison.expensesChange)}% compared to the previous period.`;
        } else {
          insight = `${topCat.name} is the largest expense category at ₱${topCat.total.toLocaleString()}.`;
        }
      } else if (tab === 'income' && breakdown && breakdown.sources && breakdown.sources.length > 0) {
        if (comparison.incomeChange !== null && comparison.incomeChange !== 0) {
          const direction = comparison.incomeChange > 0 ? 'grew' : 'declined';
          insight = `Income ${direction} by ${Math.abs(comparison.incomeChange)}% this period.`;
        } else {
          const topSrc = breakdown.sources[0];
          insight = `${topSrc.name} is the top income source at ₱${topSrc.total.toLocaleString()}.`;
        }
      } else {
        // cashflow / reports tabs
        if (comparison.netBalanceChange !== null && comparison.netBalanceChange !== 0) {
          const direction = comparison.netBalanceChange > 0 ? 'improved' : 'declined';
          insight = `Net balance ${direction} by ${Math.abs(comparison.netBalanceChange)}% compared to the previous period.`;
        } else if (netBalance >= 0) {
          insight = `You earned ₱${totalIncome.toLocaleString()} and spent ₱${totalExpenses.toLocaleString()} this period.`;
        } else {
          insight = `Spending exceeded income by ₱${Math.abs(netBalance).toLocaleString()} this period.`;
        }
      }
    }

    // ── Build response ──
    const data = {
      summary: { totalIncome, totalExpenses, netBalance, remainingBalance },
      comparison,
      chart,
      insight
    };
    if (breakdown !== undefined) data.breakdown = breakdown;
    if (topRecord !== undefined) data.topRecord = topRecord;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics data error:', error);
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
  getAnalyticsData,
  transactionValidation
};
