// ============================================
// Financial Analysis Service — PondoSync
// Safe, Parameterized Financial Retrieval & Calculations
// ============================================
const pool = require('../config/db');

/**
 * Format currency to PHP
 */
function fmtPHP(val) {
  const num = parseFloat(val || 0);
  return '₱' + num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Bulletproof date formatter that extracts YYYY-MM-DD in the local date without timezone rollback
 */
function formatDateOnly(d) {
  if (!d) return 'N/A';
  if (typeof d === 'string') {
    const match = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return 'N/A';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse month name or number to 1-12
 */
const MONTH_NAMES = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};

const MONTH_DISPLAY = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * 1. Generate Monthly Financial Report
 * Reuses database stored functions: monthly_report(month, year) and category_breakdown(month, year)
 * with robust fallback queries.
 */
async function getMonthlyReport(month, year) {
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  if (!monthNum || monthNum < 1 || monthNum > 12 || !yearNum) {
    throw new Error('Invalid month or year for monthly report.');
  }

  const periodLabel = `${MONTH_DISPLAY[monthNum]} ${yearNum}`;

  // 1. Get totals from stored function monthly_report
  let reportRows = [];
  try {
    const [rows] = await pool.query('SELECT * FROM monthly_report(?, ?)', [monthNum, yearNum]);
    reportRows = rows || [];
  } catch (err) {
    console.warn('monthly_report stored function query fallback:', err.message);
    const [fallbackRows] = await pool.query(`
      SELECT 
        t.type::VARCHAR AS record_type,
        COALESCE(SUM(t.amount), 0) AS total_amount,
        COUNT(*) AS transaction_count,
        COALESCE(AVG(t.amount), 0) AS average_amount,
        COALESCE(MAX(t.amount), 0) AS largest_transaction
      FROM transactions t
      WHERE EXTRACT(MONTH FROM t.date) = ? AND EXTRACT(YEAR FROM t.date) = ?
      GROUP BY t.type
    `, [monthNum, yearNum]);
    reportRows = fallbackRows || [];
  }

  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let avgIncome = 0;
  let avgExpense = 0;

  for (const r of reportRows) {
    const type = (r.record_type || '').toLowerCase();
    const amt = parseFloat(r.total_amount || 0);
    const count = parseInt(r.transaction_count || 0, 10);
    const avg = parseFloat(r.average_amount || 0);

    if (type === 'income') {
      totalIncome = amt;
      incomeCount = count;
      avgIncome = avg;
    } else if (type === 'expense') {
      totalExpenses = amt;
      expenseCount = count;
      avgExpense = avg;
    }
  }

  const netBalance = totalIncome - totalExpenses;
  const totalCount = incomeCount + expenseCount;

  // 2. Category breakdown from category_breakdown stored function
  let categoryRows = [];
  try {
    const [cats] = await pool.query('SELECT * FROM category_breakdown(?, ?)', [monthNum, yearNum]);
    categoryRows = cats || [];
  } catch (err) {
    console.warn('category_breakdown stored function query fallback:', err.message);
    const [fallbackCats] = await pool.query(`
      SELECT 
        e.category::VARCHAR AS category_name,
        COALESCE(SUM(t.amount), 0) AS total_amount,
        COUNT(*) AS transaction_count
      FROM transactions t
      JOIN expenses e ON e.transaction_id = t.id
      WHERE t.type = 'expense'
        AND EXTRACT(MONTH FROM t.date) = ? AND EXTRACT(YEAR FROM t.date) = ?
      GROUP BY e.category
      ORDER BY total_amount DESC
    `, [monthNum, yearNum]);
    categoryRows = fallbackCats || [];
  }

  const categories = categoryRows.map(c => ({
    category: c.category_name,
    total: parseFloat(c.total_amount || 0),
    totalFormatted: fmtPHP(c.total_amount),
    count: parseInt(c.transaction_count || 0, 10),
    percentage: totalExpenses > 0 
      ? ((parseFloat(c.total_amount || 0) / totalExpenses) * 100).toFixed(1) + '%'
      : '0.0%'
  }));

  // 3. Find the single largest expense with full context
  const [largestRows] = await pool.query(`
    SELECT t.amount, t.date, e.category, e.description, u.name AS user_name
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
      AND EXTRACT(MONTH FROM t.date) = ? AND EXTRACT(YEAR FROM t.date) = ?
    ORDER BY t.amount DESC LIMIT 1
  `, [monthNum, yearNum]);

  const largestExpense = largestRows && largestRows[0] ? {
    amount: parseFloat(largestRows[0].amount),
    amountFormatted: fmtPHP(largestRows[0].amount),
    date: formatDateOnly(largestRows[0].date),
    category: largestRows[0].category,
    description: largestRows[0].description || 'N/A',
    recordedBy: largestRows[0].user_name || 'Officer',
    logger: largestRows[0].user_name || 'Officer'
  } : null;

  // 4. Detailed transactions for this month (with officer names and verified categories)
  const [sampleTx] = await pool.query(`
    SELECT 
      t.id, t.type::VARCHAR AS type, t.amount, t.date, 
      i.source, 
      e.category::VARCHAR AS category, e.description, 
      u.name AS user_name
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN income i ON i.transaction_id = t.id
    LEFT JOIN expenses e ON e.transaction_id = t.id
    WHERE EXTRACT(MONTH FROM t.date) = ? AND EXTRACT(YEAR FROM t.date) = ?
    ORDER BY t.date DESC, t.amount DESC
    LIMIT 150
  `, [monthNum, yearNum]);

  const monthTxList = (sampleTx || []).map(t => {
    let cat = t.category;
    let desc = t.description;
    if (t.type === 'income') {
      const parsed = parseIncomeCategory(t.source);
      cat = parsed.category;
      desc = parsed.description;
    }
    return {
      id: t.id,
      date: formatDateOnly(t.date),
      type: (t.type || '').toUpperCase(),
      amount: parseFloat(t.amount || 0),
      amountFormatted: fmtPHP(t.amount),
      category: cat || (t.type === 'income' ? 'Income' : 'General'),
      description: desc || (t.type === 'income' ? (t.source || 'General Income') : 'General Expense'),
      recordedBy: t.user_name || 'Officer',
      logger: t.user_name || 'Officer',
      detail: t.type === 'income' ? (t.source || 'Income') : `${cat || 'General'}: ${desc || 'Expense'}`
    };
  });

  return {
    reportType: 'monthly',
    period: periodLabel,
    month: monthNum,
    year: yearNum,
    hasData: totalCount > 0,
    totalIncome,
    totalIncomeFormatted: fmtPHP(totalIncome),
    totalExpenses,
    totalExpensesFormatted: fmtPHP(totalExpenses),
    netBalance,
    netBalanceFormatted: fmtPHP(netBalance),
    netStatus: netBalance >= 0 ? 'Surplus' : 'Deficit',
    transactionCount: totalCount,
    incomeCount,
    expenseCount,
    averageIncome: avgIncome,
    averageExpense: avgExpense,
    categories,
    largestExpense,
    sampleTransactions: monthTxList,
    transactions: monthTxList,
    expensesList: monthTxList.filter(t => t.type === 'EXPENSE'),
    incomeList: monthTxList.filter(t => t.type === 'INCOME')
  };
}

/**
 * 2. Generate Date Range Financial Summary
 */
async function getDateRangeSummary(startDate, endDate, label = null) {
  // Validate dates (YYYY-MM-DD)
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date range format. Use YYYY-MM-DD.');
  }

  const startStr = formatDateOnly(start);
  const endStr = formatDateOnly(end);
  const periodLabel = label || `${startStr} to ${endStr}`;

  // 1. Total income, expenses, and counts
  const [totals] = await pool.query(`
    SELECT 
      t.type,
      COALESCE(SUM(t.amount), 0) AS total_amount,
      COUNT(*) AS transaction_count,
      COALESCE(AVG(t.amount), 0) AS average_amount
    FROM transactions t
    WHERE t.date >= ? AND t.date <= ?
    GROUP BY t.type
  `, [startStr, endStr]);

  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const r of totals || []) {
    if (r.type === 'income') {
      totalIncome = parseFloat(r.total_amount || 0);
      incomeCount = parseInt(r.transaction_count || 0, 10);
    } else if (r.type === 'expense') {
      totalExpenses = parseFloat(r.total_amount || 0);
      expenseCount = parseInt(r.transaction_count || 0, 10);
    }
  }

  const netBalance = totalIncome - totalExpenses;
  const totalCount = incomeCount + expenseCount;

  // 2. Category breakdown
  const [categories] = await pool.query(`
    SELECT 
      e.category,
      COALESCE(SUM(t.amount), 0) AS total_amount,
      COUNT(*) AS transaction_count
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
    GROUP BY e.category
    ORDER BY total_amount DESC
  `, [startStr, endStr]);

  const catList = (categories || []).map(c => ({
    category: c.category,
    total: parseFloat(c.total_amount || 0),
    totalFormatted: fmtPHP(c.total_amount),
    count: parseInt(c.transaction_count || 0, 10),
    percentage: totalExpenses > 0 
      ? ((parseFloat(c.total_amount || 0) / totalExpenses) * 100).toFixed(1) + '%'
      : '0.0%'
  }));

  // 3. Largest expense
  const [largest] = await pool.query(`
    SELECT t.amount, t.date, e.category, e.description, u.name AS user_name
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
    ORDER BY t.amount DESC LIMIT 1
  `, [startStr, endStr]);

  const largestExpense = largest && largest[0] ? {
    amount: parseFloat(largest[0].amount),
    amountFormatted: fmtPHP(largest[0].amount),
    date: formatDateOnly(largest[0].date),
    category: largest[0].category,
    description: largest[0].description || 'N/A',
    recordedBy: largest[0].user_name || 'Officer',
    logger: largest[0].user_name || 'Officer'
  } : null;

  return {
    reportType: 'date_range',
    period: periodLabel,
    startDate: startStr,
    endDate: endStr,
    hasData: totalCount > 0,
    totalIncome,
    totalIncomeFormatted: fmtPHP(totalIncome),
    totalExpenses,
    totalExpensesFormatted: fmtPHP(totalExpenses),
    netBalance,
    netBalanceFormatted: fmtPHP(netBalance),
    netStatus: netBalance >= 0 ? 'Surplus' : 'Deficit',
    transactionCount: totalCount,
    incomeCount,
    expenseCount,
    categories: catList,
    largestExpense
  };
}

/**
 * 3. Period Comparison
 * Accurately compares two periods (months or custom date ranges)
 */
async function comparePeriods(periodA, periodB) {
  let dataA, dataB;

  if (periodA.month && periodA.year) {
    dataA = await getMonthlyReport(periodA.month, periodA.year);
  } else {
    dataA = await getDateRangeSummary(periodA.startDate, periodA.endDate, periodA.label);
  }

  if (periodB.month && periodB.year) {
    dataB = await getMonthlyReport(periodB.month, periodB.year);
  } else {
    dataB = await getDateRangeSummary(periodB.startDate, periodB.endDate, periodB.label);
  }

  // Determine chronological start and end dates
  let startA, endA, startB, endB;
  if (periodA.month && periodA.year) {
    const lastDayA = new Date(Date.UTC(periodA.year, periodA.month, 0)).getUTCDate();
    startA = `${periodA.year}-${String(periodA.month).padStart(2, '0')}-01`;
    endA = `${periodA.year}-${String(periodA.month).padStart(2, '0')}-${String(lastDayA).padStart(2, '0')}`;
  } else {
    startA = periodA.startDate;
    endA = periodA.endDate;
  }

  if (periodB.month && periodB.year) {
    const lastDayB = new Date(Date.UTC(periodB.year, periodB.month, 0)).getUTCDate();
    startB = `${periodB.year}-${String(periodB.month).padStart(2, '0')}-01`;
    endB = `${periodB.year}-${String(periodB.month).padStart(2, '0')}-${String(lastDayB).padStart(2, '0')}`;
  } else {
    startB = periodB.startDate;
    endB = periodB.endDate;
  }

  // Opening & Closing Balances for Period A
  const [openARows] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS balance FROM transactions WHERE date < ?`,
    [startA]
  );
  const openingBalanceA = parseFloat(openARows[0]?.balance || 0);

  const [closeARows] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS balance FROM transactions WHERE date <= ?`,
    [endA]
  );
  const closingBalanceA = parseFloat(closeARows[0]?.balance || 0);

  // Opening & Closing Balances for Period B
  const [openBRows] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS balance FROM transactions WHERE date < ?`,
    [startB]
  );
  const openingBalanceB = parseFloat(openBRows[0]?.balance || 0);

  const [closeBRows] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS balance FROM transactions WHERE date <= ?`,
    [endB]
  );
  const closingBalanceB = parseFloat(closeBRows[0]?.balance || 0);

  // Top income sources for each period
  const [topIncA] = await pool.query(`
    SELECT i.source, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN income i ON i.transaction_id = t.id
    WHERE t.type = 'income' AND t.date >= ? AND t.date <= ?
    GROUP BY i.source ORDER BY total DESC LIMIT 3
  `, [startA, endA]);

  const [topIncB] = await pool.query(`
    SELECT i.source, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN income i ON i.transaction_id = t.id
    WHERE t.type = 'income' AND t.date >= ? AND t.date <= ?
    GROUP BY i.source ORDER BY total DESC LIMIT 3
  `, [startB, endB]);

  // Exact calculations performed in backend:
  const incomeDiff = dataB.totalIncome - dataA.totalIncome;
  const incomePctChange = dataA.totalIncome > 0 
    ? ((incomeDiff / dataA.totalIncome) * 100).toFixed(1)
    : (dataB.totalIncome > 0 ? '+100.0' : '0.0');

  const expenseDiff = dataB.totalExpenses - dataA.totalExpenses;
  const expensePctChange = dataA.totalExpenses > 0 
    ? ((expenseDiff / dataA.totalExpenses) * 100).toFixed(1)
    : (dataB.totalExpenses > 0 ? '+100.0' : '0.0');

  const netDiff = dataB.netBalance - dataA.netBalance;
  let netPctChange;
  if (dataA.netBalance !== 0) {
    const pct = ((netDiff / Math.abs(dataA.netBalance)) * 100).toFixed(1);
    netPctChange = (parseFloat(pct) >= 0 ? '+' : '') + pct + '%';
  } else {
    netPctChange = dataB.netBalance > 0 ? '+100.0%' : (dataB.netBalance < 0 ? '-100.0%' : '0.0%');
  }

  // Expense-to-Income Ratio
  const ratioA = dataA.totalIncome > 0 ? (dataA.totalExpenses / dataA.totalIncome) * 100 : 0;
  const ratioB = dataB.totalIncome > 0 ? (dataB.totalExpenses / dataB.totalIncome) * 100 : 0;
  const ratioFormattedA = dataA.totalIncome > 0 ? ratioA.toFixed(1) + '%' : (dataA.totalExpenses > 0 ? 'N/A (>100%)' : '0.0%');
  const ratioFormattedB = dataB.totalIncome > 0 ? ratioB.toFixed(1) + '%' : (dataB.totalExpenses > 0 ? 'N/A (>100%)' : '0.0%');

  // Difference in percentage points (pp)
  const ratioDiff = ratioB - ratioA;
  const ratioDiffFormatted = (ratioDiff >= 0 ? '+' : '') + ratioDiff.toFixed(1) + ' pp';
  const ratioPctChange = ratioA > 0 ? (((ratioDiff / ratioA) * 100).toFixed(1) + '%') : '0.0%';

  // Summary Overview (Combined for the compared timeframes)
  const combinedIncome = dataA.totalIncome + dataB.totalIncome;
  const combinedExpenses = dataA.totalExpenses + dataB.totalExpenses;
  const combinedNet = combinedIncome - combinedExpenses;

  const overview = {
    totalIncome: combinedIncome,
    totalIncomeFormatted: fmtPHP(combinedIncome),
    totalExpenses: combinedExpenses,
    totalExpensesFormatted: fmtPHP(combinedExpenses),
    netCashFlow: combinedNet,
    netCashFlowFormatted: (combinedNet >= 0 ? '+' : '-') + fmtPHP(Math.abs(combinedNet)),
    netStatus: combinedNet >= 0 ? 'Surplus' : 'Deficit',
    openingBalance: openingBalanceA,
    openingBalanceFormatted: fmtPHP(openingBalanceA),
    closingBalance: closingBalanceB,
    closingBalanceFormatted: fmtPHP(closingBalanceB)
  };

  // Better period analysis
  let betterPeriod;
  if (dataA.netBalance > dataB.netBalance && ratioA <= ratioB) {
    betterPeriod = `${dataA.period} performed better overall, delivering higher net cash flow (${dataA.netBalanceFormatted} vs ${dataB.netBalanceFormatted}) with a lower expense-to-income ratio (${ratioFormattedA} vs ${ratioFormattedB}).`;
  } else if (dataB.netBalance > dataA.netBalance && ratioB <= ratioA) {
    betterPeriod = `${dataB.period} performed better overall, achieving higher net cash flow (${dataB.netBalanceFormatted} vs ${dataA.netBalanceFormatted}) with improved spending efficiency (${ratioFormattedB} vs ${ratioFormattedA}).`;
  } else if (dataB.netBalance > dataA.netBalance) {
    betterPeriod = `${dataB.period} achieved higher net cash flow (${dataB.netBalanceFormatted} vs ${dataA.netBalanceFormatted}).`;
  } else {
    betterPeriod = `${dataA.period} recorded higher net cash flow (${dataA.netBalanceFormatted} vs ${dataB.netBalanceFormatted}).`;
  }

  return {
    reportType: 'comparison',
    overview,
    periodA: {
      label: dataA.period,
      startDate: startA,
      endDate: endA,
      income: dataA.totalIncome,
      incomeFormatted: dataA.totalIncomeFormatted,
      expenses: dataA.totalExpenses,
      expensesFormatted: dataA.totalExpensesFormatted,
      net: dataA.netBalance,
      netFormatted: (dataA.netBalance >= 0 ? '+' : '-') + fmtPHP(Math.abs(dataA.netBalance)),
      netStatus: dataA.netStatus,
      openingBalance: openingBalanceA,
      openingBalanceFormatted: fmtPHP(openingBalanceA),
      closingBalance: closingBalanceA,
      closingBalanceFormatted: fmtPHP(closingBalanceA),
      ratio: ratioA,
      ratioFormatted: ratioFormattedA,
      count: dataA.transactionCount,
      incomeCount: dataA.incomeCount || 0,
      expenseCount: dataA.expenseCount || 0,
      hasData: dataA.hasData,
      topCategories: (dataA.categories || []).slice(0, 3),
      largestExpense: dataA.largestExpense,
      topIncomeSources: (topIncA || []).map(r => ({ source: r.source, total: parseFloat(r.total || 0), totalFormatted: fmtPHP(r.total) }))
    },
    periodB: {
      label: dataB.period,
      startDate: startB,
      endDate: endB,
      income: dataB.totalIncome,
      incomeFormatted: dataB.totalIncomeFormatted,
      expenses: dataB.totalExpenses,
      expensesFormatted: dataB.totalExpensesFormatted,
      net: dataB.netBalance,
      netFormatted: (dataB.netBalance >= 0 ? '+' : '-') + fmtPHP(Math.abs(dataB.netBalance)),
      netStatus: dataB.netStatus,
      openingBalance: openingBalanceB,
      openingBalanceFormatted: fmtPHP(openingBalanceB),
      closingBalance: closingBalanceB,
      closingBalanceFormatted: fmtPHP(closingBalanceB),
      ratio: ratioB,
      ratioFormatted: ratioFormattedB,
      count: dataB.transactionCount,
      incomeCount: dataB.incomeCount || 0,
      expenseCount: dataB.expenseCount || 0,
      hasData: dataB.hasData,
      topCategories: (dataB.categories || []).slice(0, 3),
      largestExpense: dataB.largestExpense,
      topIncomeSources: (topIncB || []).map(r => ({ source: r.source, total: parseFloat(r.total || 0), totalFormatted: fmtPHP(r.total) }))
    },
    diff: {
      incomeDiff,
      incomeDiffFormatted: (incomeDiff >= 0 ? '+' : '-') + fmtPHP(Math.abs(incomeDiff)),
      incomePctChange: (parseFloat(incomePctChange) >= 0 ? '+' : '') + incomePctChange + '%',
      expenseDiff,
      expenseDiffFormatted: (expenseDiff >= 0 ? '+' : '-') + fmtPHP(Math.abs(expenseDiff)),
      expensePctChange: (parseFloat(expensePctChange) >= 0 ? '+' : '') + expensePctChange + '%',
      netDiff,
      netDiffFormatted: (netDiff >= 0 ? '+' : '-') + fmtPHP(Math.abs(netDiff)),
      netPctChange,
      ratioDiff,
      ratioDiffFormatted,
      ratioPctChange,
      betterPeriod
    }
  };
}

/**
 * 4. Event Financial Analysis
 * Searches transaction descriptions, income sources, and 'Events' categories using ILIKE
 */
async function searchEventFinances(eventKeyword) {
  if (!eventKeyword || !eventKeyword.trim()) {
    throw new Error('Event search term cannot be empty.');
  }

  const cleanTerm = eventKeyword.trim();
  const searchPattern = `%${cleanTerm}%`;

  // Search transactions matching keyword
  const [rows] = await pool.query(`
    SELECT 
      t.id, t.type, t.amount, t.date,
      i.source,
      e.category, e.description,
      u.name AS user_name
    FROM transactions t
    LEFT JOIN income i ON i.transaction_id = t.id
    LEFT JOIN expenses e ON e.transaction_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE (
      e.description ILIKE ? OR 
      i.source ILIKE ? OR 
      (e.category = 'Events' AND (e.description ILIKE ? OR ? ILIKE '%event%'))
    )
    ORDER BY t.date ASC, t.amount DESC
  `, [searchPattern, searchPattern, searchPattern, cleanTerm]);

  const matchedRecords = rows || [];
  let totalIncome = 0;
  let totalExpenses = 0;
  const incomeItems = [];
  const expenseItems = [];

  for (const r of matchedRecords) {
    const amt = parseFloat(r.amount || 0);
    const item = {
      id: r.id,
      date: formatDateOnly(r.date),
      amount: amt,
      amountFormatted: fmtPHP(amt),
      recordedBy: r.user_name || 'Officer',
      loggedBy: r.user_name || 'Officer'
    };

    if (r.type === 'income') {
      totalIncome += amt;
      item.source = r.source || 'N/A';
      incomeItems.push(item);
    } else {
      totalExpenses += amt;
      item.category = r.category || 'N/A';
      item.description = r.description || 'N/A';
      expenseItems.push(item);
    }
  }

  const netEventBalance = totalIncome - totalExpenses;

  // Breakdown of event expenses by category
  const categoryMap = {};
  for (const exp of expenseItems) {
    const cat = exp.category;
    categoryMap[cat] = (categoryMap[cat] || 0) + exp.amount;
  }
  const categoryBreakdown = Object.entries(categoryMap).map(([cat, total]) => ({
    category: cat,
    total,
    totalFormatted: fmtPHP(total)
  })).sort((a, b) => b.total - a.total);

  return {
    reportType: 'event',
    eventName: cleanTerm,
    hasData: matchedRecords.length > 0,
    matchCount: matchedRecords.length,
    totalIncome,
    totalIncomeFormatted: fmtPHP(totalIncome),
    totalExpenses,
    totalExpensesFormatted: fmtPHP(totalExpenses),
    netBalance: netEventBalance,
    netBalanceFormatted: fmtPHP(netEventBalance),
    netStatus: netEventBalance >= 0 ? 'Surplus / Self-funded' : 'Net Cost to Org',
    categoryBreakdown,
    incomeItems,
    expenseItems,
    note: 'Note: Results are retrieved by searching transaction descriptions and income sources matching this keyword. Records entered without the event name in the description may not be captured.'
  };
}

/**
 * 5. Category Expense Breakdown
 * Analyzes expenses for a specific category or all categories
 */
async function getCategoryAnalysis(categoryName = null, startDate = null, endDate = null) {
  let sql = `
    SELECT 
      e.category,
      COALESCE(SUM(t.amount), 0) AS total_amount,
      COUNT(t.id) AS transaction_count,
      COALESCE(AVG(t.amount), 0) AS average_amount,
      COALESCE(MAX(t.amount), 0) AS max_amount
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type = 'expense'
  `;
  const params = [];

  if (categoryName) {
    sql += ' AND e.category ILIKE ?';
    params.push(`%${categoryName.trim()}%`);
  }

  if (startDate) {
    sql += ' AND t.date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND t.date <= ?';
    params.push(endDate);
  }

  sql += ' GROUP BY e.category ORDER BY total_amount DESC';

  const [rows] = await pool.query(sql, params);

  // If specific category was requested, also fetch its top transactions
  let sampleTransactions = [];
  if (categoryName && rows && rows.length > 0) {
    const matchedCategory = rows[0].category;
    const [txRows] = await pool.query(`
      SELECT t.id, t.amount, t.date, e.category, e.description, u.name AS user_name
      FROM transactions t
      JOIN expenses e ON e.transaction_id = t.id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.type = 'expense' AND e.category = ?
      ORDER BY t.amount DESC LIMIT 15
    `, [matchedCategory]);
    sampleTransactions = txRows || [];
  }

  const totalAllCategories = (rows || []).reduce((acc, r) => acc + parseFloat(r.total_amount || 0), 0);

  return {
    reportType: 'category',
    categoryName: categoryName || 'All Categories',
    hasData: (rows || []).length > 0,
    totalExpenses: totalAllCategories,
    totalExpensesFormatted: fmtPHP(totalAllCategories),
    categories: (rows || []).map(r => ({
      category: r.category,
      total: parseFloat(r.total_amount || 0),
      totalFormatted: fmtPHP(r.total_amount),
      count: parseInt(r.transaction_count || 0, 10),
      averageFormatted: fmtPHP(r.average_amount),
      percentage: totalAllCategories > 0 
        ? ((parseFloat(r.total_amount || 0) / totalAllCategories) * 100).toFixed(1) + '%'
        : '0.0%'
    })),
    topTransactions: sampleTransactions.map(t => ({
      id: t.id,
      amount: parseFloat(t.amount || 0),
      amountFormatted: fmtPHP(t.amount),
      date: formatDateOnly(t.date),
      category: t.category,
      description: t.description || 'N/A',
      recordedBy: t.user_name || 'Officer',
      loggedBy: t.user_name || 'Officer'
    }))
  };
}

/**
 * 6. Get Top / Highest Expenses
 */
async function getHighestExpenses(limit = 10, month = null, year = null) {
  let sql = `
    SELECT t.id, t.amount, t.date, e.category, e.description, u.name AS user_name
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
  `;
  const params = [];

  if (month && year) {
    sql += ' AND EXTRACT(MONTH FROM t.date) = ? AND EXTRACT(YEAR FROM t.date) = ?';
    params.push(month, year);
  } else if (year) {
    sql += ' AND EXTRACT(YEAR FROM t.date) = ?';
    params.push(year);
  }

  sql += ' ORDER BY t.amount DESC LIMIT ?';
  params.push(parseInt(limit, 10) || 10);

  const [rows] = await pool.query(sql, params);

  return {
    reportType: 'highest_expenses',
    hasData: (rows || []).length > 0,
    filter: month && year ? `${MONTH_DISPLAY[month]} ${year}` : (year ? `Year ${year}` : 'All Time'),
    expenses: (rows || []).map((r, i) => ({
      rank: i + 1,
      id: r.id,
      amount: parseFloat(r.amount),
      amountFormatted: fmtPHP(r.amount),
      date: formatDateOnly(r.date),
      category: r.category,
      description: r.description || 'N/A',
      recordedBy: r.user_name || 'Officer',
      logger: r.user_name || 'Officer'
    }))
  };
}

/**
 * 6b. Get Top / Highest Income
 */
async function getHighestIncome(limit = 10, month = null, year = null) {
  let sql = `
    SELECT t.id, t.amount, t.date, i.source, u.name AS user_name
    FROM transactions t
    JOIN income i ON i.transaction_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.type = 'income'
  `;
  const params = [];

  if (month && year) {
    sql += ' AND EXTRACT(MONTH FROM t.date) = ? AND EXTRACT(YEAR FROM t.date) = ?';
    params.push(month, year);
  } else if (year) {
    sql += ' AND EXTRACT(YEAR FROM t.date) = ?';
    params.push(year);
  }

  sql += ' ORDER BY t.amount DESC LIMIT ?';
  params.push(parseInt(limit, 10) || 10);

  const [rows] = await pool.query(sql, params);

  return {
    reportType: 'highest_income',
    dataContext: 'These are ALL INCOME records. Every record below is INCOME — use + prefix for ALL amounts. Do NOT use - prefix.',
    hasData: (rows || []).length > 0,
    filter: month && year ? `${MONTH_DISPLAY[month]} ${year}` : (year ? `Year ${year}` : 'All Time'),
    incomeRecords: (rows || []).map((r, i) => {
      const parsed = parseIncomeCategory(r.source);
      return {
        rank: i + 1,
        id: r.id,
        type: 'income',
        amount: parseFloat(r.amount),
        amountFormatted: fmtPHP(r.amount),
        date: formatDateOnly(r.date),
        category: parsed.category,
        description: parsed.description,
        source: r.source || 'N/A',
        recordedBy: r.user_name || 'Officer',
        logger: r.user_name || 'Officer'
      };
    })
  };
}

/**
 * 7. General Overall Ledger Summary (All-Time)
 */
async function getOverallSummary() {
  const [balRows] = await pool.query('SELECT * FROM total_balance');
  const bal = balRows[0] || { total_income: 0, total_expenses: 0, remaining_balance: 0 };

  const [catRows] = await pool.query(`
    SELECT e.category, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type='expense' GROUP BY e.category ORDER BY total DESC
  `);

  const [txRows] = await pool.query(`
    SELECT t.type, t.amount, t.date, u.name AS user_name,
           i.source, e.category, e.description
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN income i ON i.transaction_id = t.id
    LEFT JOIN expenses e ON e.transaction_id = t.id
    ORDER BY t.date DESC, t.created_at DESC LIMIT 15
  `);

  return {
    reportType: 'overall',
    totalIncome: parseFloat(bal.total_income || 0),
    totalIncomeFormatted: fmtPHP(bal.total_income),
    totalExpenses: parseFloat(bal.total_expenses || 0),
    totalExpensesFormatted: fmtPHP(bal.total_expenses),
    remainingBalance: parseFloat(bal.remaining_balance || 0),
    remainingBalanceFormatted: fmtPHP(bal.remaining_balance),
    categories: (catRows || []).map(c => ({
      category: c.category,
      totalFormatted: fmtPHP(c.total),
      count: c.count
    })),
    recentTransactions: (txRows || []).map(t => ({
      date: formatDateOnly(t.date),
      type: t.type.toUpperCase(),
      amountFormatted: fmtPHP(t.amount),
      detail: t.type === 'income' ? (t.source || 'N/A') : `${t.category}: ${t.description || 'N/A'}`,
      logger: t.user_name || 'Officer',
      recordedBy: t.user_name || 'Officer'
    }))
  };
}

/**
 * 8. Get Complete List of Transactions (Filtered by Category, Month, Year, and/or Type)
 */
/**
 * Helper to extract accurate category and description from income source
 */
function parseIncomeCategory(source) {
  if (!source) return { category: 'Other Income', description: 'General Income' };
  const str = source.trim();

  // If formatted like "Booth Income — Waves of Wonder: Sailing Through Safe Water"
  const sepMatch = str.match(/^(.*?)\s+[—–-]\s+(.*)$/);
  if (sepMatch) {
    const cat = sepMatch[1].trim();
    const desc = sepMatch[2].trim();
    return {
      category: cat || 'Income',
      description: desc || str
    };
  }

  // Keywords detection
  const lower = str.toLowerCase();
  if (lower.includes('booth')) return { category: 'Booth Income', description: str };
  if (lower.includes('membership')) return { category: 'Membership Fees', description: str };
  if (lower.includes('registration') || lower.includes('reg fee')) return { category: 'Registration Fees', description: str };
  if (lower.includes('donation')) return { category: 'Donations', description: str };
  if (lower.includes('sponsor')) return { category: 'Sponsorship', description: str };
  if (lower.includes('merch') || lower.includes('shirt') || lower.includes('sales')) return { category: 'Merchandise Sales', description: str };
  if (lower.includes('ticket')) return { category: 'Ticket Sales', description: str };
  if (lower.includes('solicitation')) return { category: 'Solicitation', description: str };
  if (lower.includes('fundrais')) return { category: 'Fundraising', description: str };

  return { category: str, description: str };
}

async function getTransactionList({ category = null, month = null, year = null, type = null, limit = 100 } = {}) {
  let sql = `
    SELECT 
      t.id, t.type::VARCHAR AS type, t.amount, t.date,
      i.source,
      e.category::VARCHAR AS category, e.description,
      u.name AS user_name
    FROM transactions t
    LEFT JOIN income i ON i.transaction_id = t.id
    LEFT JOIN expenses e ON e.transaction_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE 1=1
  `;
  const params = [];

  if (type) {
    sql += ' AND t.type::VARCHAR = ?';
    params.push(type.toLowerCase());
  }

  if (category) {
    sql += ' AND e.category::VARCHAR ILIKE ?';
    params.push(`%${category.trim()}%`);
  }

  if (month && year) {
    sql += ' AND EXTRACT(MONTH FROM t.date) = ? AND EXTRACT(YEAR FROM t.date) = ?';
    params.push(parseInt(month, 10), parseInt(year, 10));
  } else if (year) {
    sql += ' AND EXTRACT(YEAR FROM t.date) = ?';
    params.push(parseInt(year, 10));
  }

  sql += ` ORDER BY t.date ASC, t.id ASC LIMIT ${parseInt(limit, 10) || 100}`;

  const [rows] = await pool.query(sql, params);
  const records = rows || [];
  const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

  let categoryLabel = category ? (category.charAt(0).toUpperCase() + category.slice(1)) : 'All Categories';
  if (records.length > 0 && records[0].category) {
    categoryLabel = records[0].category;
  }

  return {
    reportType: 'transaction_list',
    category: categoryLabel,
    month,
    year,
    monthName: month ? MONTH_DISPLAY[month] : null,
    hasData: records.length > 0,
    count: records.length,
    totalAmount,
    totalAmountFormatted: fmtPHP(totalAmount),
    transactions: records.map(r => {
      let txCategory = r.category;
      let txDescription = r.description;

      if (r.type === 'income') {
        const parsed = parseIncomeCategory(r.source);
        txCategory = parsed.category;
        txDescription = parsed.description;
      }

      return {
        id: r.id,
        date: formatDateOnly(r.date),
        type: r.type,
        amount: parseFloat(r.amount || 0),
        amountFormatted: fmtPHP(r.amount),
        category: txCategory || (r.type === 'income' ? 'Income' : 'General'),
        description: txDescription || 'N/A',
        recordedBy: r.user_name || 'Officer'
      };
    })
  };
}

module.exports = {
  MONTH_NAMES,
  MONTH_DISPLAY,
  fmtPHP,
  formatDateOnly,
  getMonthlyReport,
  getDateRangeSummary,
  comparePeriods,
  searchEventFinances,
  getCategoryAnalysis,
  getHighestExpenses,
  getHighestIncome,
  getOverallSummary,
  getTransactionList
};
