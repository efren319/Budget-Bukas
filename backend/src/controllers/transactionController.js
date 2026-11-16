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

// Dynamic grouping for income sources sharing common prefixes or delimiters
function groupIncomeSources(rows) {
  const groups = new Map();

  for (const row of rows) {
    const rawName = (row.name || 'Other').trim();
    const amount = parseFloat(row.total) || 0;
    const count = parseInt(row.count) || 1;

    // Detect common delimiter prefixes dynamically:
    // e.g. "Membership Fee — BSIT-1101", "Membership Fee - BSIT-1102", "Sponsorship: Tech Corp", "Merchandise / Shirts"
    // Delimiters: em-dash (—), en-dash (–), hyphen (-), colon (:), pipe (|), bullet (•), slash (/)
    const delimiterMatch = rawName.match(/^([^—–:\-|•/]{3,})\s*[—–:\-|•/]/);
    let groupKey;

    if (delimiterMatch) {
      groupKey = delimiterMatch[1].trim();
    } else {
      // Check for parenthetical prefix e.g. "Donations (Batch 2024)"
      const parenMatch = rawName.match(/^([^(]{3,})\s*\(/);
      if (parenMatch) {
        groupKey = parenMatch[1].trim();
      } else {
        groupKey = rawName;
      }
    }

    const cleanKey = groupKey;
    const lookupKey = cleanKey.toLowerCase();

    // Check if we already have a group with this lookup key
    let existingKey = null;
    for (const k of groups.keys()) {
      if (k.toLowerCase() === lookupKey) {
        existingKey = k;
        break;
      }
    }

    const targetKey = existingKey || cleanKey;
    if (!groups.has(targetKey)) {
      groups.set(targetKey, {
        name: targetKey,
        total: 0,
        count: 0
      });
    }

    const g = groups.get(targetKey);
    g.total += amount;
    g.count += count;
  }

  return Array.from(groups.values()).map(g => ({
    name: g.name,
    total: Math.round(g.total * 100) / 100,
    count: g.count
  })).sort((a, b) => b.total - a.total);
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

    // ── 1. Chart Expressions ──
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

    // ── 2. Run Database Queries in One Consolidated Parallel Batch ──
    const [
      [summaryRows],
      [remainingRows],
      [prevRows],
      [chartRows],
      [txRows]
    ] = await Promise.all([
      // A. Summary for selected period
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "totalIncome",
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "totalExpenses"
        FROM transactions
        WHERE date >= ? AND date <= ?
      `, [startDate, endDate]),
      // B. Cumulative remaining balance up to endDate
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "remainingBalance"
        FROM transactions
        WHERE date <= ?
      `, [endDate]),
      // C. Previous period summary for comparisons
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "prevTotalIncome",
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "prevTotalExpenses"
        FROM transactions
        WHERE date >= ? AND date <= ?
      `, [prevStartDate, prevEndDate]),
      // D. Chart aggregated series
      pool.query(`
        SELECT
          ${chartLabelExpr} AS label,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
        FROM transactions
        WHERE date >= ? AND date <= ?
        GROUP BY ${chartGroupExpr}
        ORDER BY ${chartGroupExpr}
      `, [startDate, endDate]),
      // E. All transaction records within selected period with details
      pool.query(`
        SELECT t.id, t.type, t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') AS date,
               i.source, e.category, e.description
        FROM transactions t
        LEFT JOIN income i ON i.transaction_id = t.id
        LEFT JOIN expenses e ON e.transaction_id = t.id
        WHERE t.date >= ? AND t.date <= ?
        ORDER BY t.date ASC, t.id ASC
      `, [startDate, endDate])
    ]);

    const totalIncome = parseFloat(summaryRows[0].totalIncome);
    const totalExpenses = parseFloat(summaryRows[0].totalExpenses);
    const netBalance = totalIncome - totalExpenses;
    const remainingBalance = parseFloat(remainingRows[0].remainingBalance);

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

    const chart = chartRows.map(r => ({
      label: r.label,
      income: parseFloat(r.income),
      expenses: parseFloat(r.expenses)
    }));

    // ── 3. High-Performance In-Memory Derivations (0ms) ──
    const calendarActivity = txRows.map(r => ({
      id: r.id,
      type: r.type,
      amount: parseFloat(r.amount),
      date: r.date,
      source: r.source,
      category: r.category,
      description: r.description
    }));

    // Build breakdown aggregates & top records in a single pass
    const catMap = new Map();
    const srcMap = new Map();
    let topExpense = null;
    let topIncome = null;

    for (const tx of calendarActivity) {
      if (tx.type === 'expense') {
        const cat = tx.category || 'Uncategorized';
        if (!catMap.has(cat)) catMap.set(cat, { name: cat, total: 0, count: 0 });
        const c = catMap.get(cat);
        c.total += tx.amount;
        c.count += 1;

        if (!topExpense || tx.amount > topExpense.amount) {
          topExpense = { id: tx.id, amount: tx.amount, label: cat, description: tx.description, date: tx.date };
        }
      } else if (tx.type === 'income') {
        const src = tx.source || 'Other';
        if (!srcMap.has(src)) srcMap.set(src, { name: src, total: 0, count: 0 });
        const s = srcMap.get(src);
        s.total += tx.amount;
        s.count += 1;

        if (!topIncome || tx.amount > topIncome.amount) {
          topIncome = { id: tx.id, amount: tx.amount, label: src, date: tx.date };
        }
      }
    }

    const categoriesBreakdown = Array.from(catMap.values())
      .map(c => ({ name: c.name, total: Math.round(c.total * 100) / 100, count: c.count }))
      .sort((a, b) => b.total - a.total);

    const rawSources = Array.from(srcMap.values())
      .map(s => ({ name: s.name, total: Math.round(s.total * 100) / 100, count: s.count }));
    const sourcesBreakdown = groupIncomeSources(rawSources);

    const breakdown = {
      categories: categoriesBreakdown,
      sources: sourcesBreakdown
    };

    const topRecords = {
      expense: topExpense,
      income: topIncome
    };

    // Recent transactions: sorted newest first
    const descTx = [...calendarActivity].sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });

    const recentTransactions = {
      income: descTx
        .filter(t => t.type === 'income')
        .slice(0, 4)
        .map(t => ({ id: t.id, amount: t.amount, date: t.date, label: t.source })),
      expenses: descTx
        .filter(t => t.type === 'expense')
        .slice(0, 4)
        .map(t => ({ id: t.id, amount: t.amount, date: t.date, label: t.category, description: t.description }))
    };

    // ── 4. Dynamic Insights per Tab ──
    const insights = {
      cashflow: 'No transactions recorded in this period.',
      expenses: 'No expenses recorded in this period.',
      income: 'No income recorded in this period.',
      reports: 'No transactions recorded in this period.'
    };

    if (totalIncome > 0 || totalExpenses > 0) {
      if (comparison.netBalanceChange !== null && comparison.netBalanceChange !== 0) {
        const direction = comparison.netBalanceChange > 0 ? 'improved' : 'declined';
        insights.cashflow = `Net balance ${direction} by ${Math.abs(comparison.netBalanceChange)}% compared to the previous period.`;
      } else if (netBalance >= 0) {
        insights.cashflow = `You earned ₱${totalIncome.toLocaleString()} and spent ₱${totalExpenses.toLocaleString()} this period.`;
      } else {
        insights.cashflow = `Spending exceeded income by ₱${Math.abs(netBalance).toLocaleString()} this period.`;
      }
      insights.reports = insights.cashflow;

      if (categoriesBreakdown.length > 0) {
        const topCat = categoriesBreakdown[0];
        if (comparison.expensesChange !== null && comparison.expensesChange !== 0) {
          const direction = comparison.expensesChange > 0 ? 'increased' : 'decreased';
          insights.expenses = `Expenses ${direction} by ${Math.abs(comparison.expensesChange)}% compared to the previous period.`;
        } else {
          insights.expenses = `${topCat.name} is the largest expense category at ₱${topCat.total.toLocaleString()}.`;
        }
      }

      if (sourcesBreakdown.length > 0) {
        if (comparison.incomeChange !== null && comparison.incomeChange !== 0) {
          const direction = comparison.incomeChange > 0 ? 'grew' : 'declined';
          insights.income = `Income ${direction} by ${Math.abs(comparison.incomeChange)}% this period.`;
        } else {
          const topSrc = sourcesBreakdown[0];
          insights.income = `${topSrc.name} is the top income source at ₱${topSrc.total.toLocaleString()}.`;
        }
      }
    }

    // ── 5. Build Unified Response ──
    const data = {
      summary: { totalIncome, totalExpenses, netBalance, remainingBalance },
      comparison,
      chart,
      breakdown,
      topRecords,
      topRecord: tab === 'expenses' ? topExpense : (tab === 'income' ? topIncome : (topExpense || topIncome)),
      recentTransactions,
      calendarActivity,
      insights,
      insight: insights[tab] || insights.cashflow
    };

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
