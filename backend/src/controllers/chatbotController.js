// ============================================
// Chatbot Controller
// Pattern-matching NL → SQL → Formatted Response
// ============================================
const pool = require('../config/db');

// Pattern definitions: keyword arrays → SQL query builder
const patterns = [
  {
    keywords: ['total balance', 'remaining funds', 'magkano natira', 'how much left', 'total remaining', 'balance', 'natira'],
    handler: getBalance,
    description: 'Check total balance and remaining funds'
  },
  {
    keywords: ['expenses this month', 'ginastos this month', 'spending this month', 'gastos ngayong buwan'],
    handler: expensesThisMonth,
    description: 'View expenses for the current month'
  },
  {
    keywords: ['income this month', 'kita this month', 'earnings this month'],
    handler: incomeThisMonth,
    description: 'View income for the current month'
  },
  {
    keywords: ['expenses by category', 'saan napunta pera', 'category breakdown', 'breakdown', 'saan napunta', 'by category'],
    handler: expensesByCategory,
    description: 'View expense breakdown by category'
  },
  {
    keywords: ['top expenses', 'biggest expenses', 'largest expenses', 'pinakamalaking gastos'],
    handler: topExpenses,
    description: 'See the top 5 largest expenses'
  },
  {
    keywords: ['latest transactions', 'recent transactions', 'latest', 'recent activity', 'pinakabago'],
    handler: latestTransactions,
    description: 'View the most recent transactions'
  },
  {
    keywords: ['who spent the most', 'sino gumastos', 'top spender', 'most spending'],
    handler: topSpenders,
    description: 'See who spent the most'
  },
  {
    keywords: ['monthly report', 'report for', 'buwan report'],
    handler: monthlyReport,
    description: 'Generate a monthly financial report'
  },
  {
    keywords: ['income sources', 'where income', 'saan galing pera', 'sources of income'],
    handler: incomeSources,
    description: 'View all income sources'
  },
  {
    keywords: ['total income', 'kabuuang kita', 'all income'],
    handler: totalIncome,
    description: 'View total income'
  },
  {
    keywords: ['total expenses', 'kabuuang gastos', 'all expenses'],
    handler: totalExpenses,
    description: 'View total expenses'
  },
  {
    keywords: ['help', 'what can you do', 'commands', 'tulong'],
    handler: showHelp,
    description: 'Show available commands'
  }
];

// Main query handler
async function handleQuery(req, res) {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.json({
        success: true,
        data: {
          response: 'Please type a question about the organization\'s finances.',
          type: 'text'
        }
      });
    }

    const lowerMsg = message.toLowerCase().trim();

    // Find matching pattern
    let matchedPattern = null;
    let bestScore = 0;

    for (const pattern of patterns) {
      for (const keyword of pattern.keywords) {
        if (lowerMsg.includes(keyword)) {
          const score = keyword.length; // Longer matches are more specific
          if (score > bestScore) {
            bestScore = score;
            matchedPattern = pattern;
          }
        }
      }
    }

    if (matchedPattern) {
      const result = await matchedPattern.handler(lowerMsg);
      return res.json({ success: true, data: result });
    }

    // No match — suggest available commands
    return res.json({
      success: true,
      data: {
        response: `I'm not sure I understand "${message}". Here are some things you can ask me:`,
        type: 'suggestions',
        suggestions: [
          'Total balance',
          'Expenses this month',
          'Expenses by category',
          'Top expenses',
          'Latest transactions',
          'Income sources',
          'Monthly report'
        ]
      }
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ success: false, message: 'Error processing your question.' });
  }
}

// ============================================
// Query Handler Functions
// ============================================

async function getBalance() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  const data = rows[0];
  return {
    response: `Here's the current financial summary:\n\n💰 **Total Income:** ₱${formatNum(data.total_income)}\n📉 **Total Expenses:** ₱${formatNum(data.total_expenses)}\n✨ **Remaining Balance:** ₱${formatNum(data.remaining_balance)}`,
    type: 'balance',
    rawData: data
  };
}

async function expensesThisMonth() {
  const now = new Date();
  const [rows] = await pool.query(`
    SELECT e.category, t.amount, t.date, e.description
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type = 'expense' AND MONTH(t.date) = ? AND YEAR(t.date) = ?
    ORDER BY t.amount DESC
  `, [now.getMonth() + 1, now.getFullYear()]);

  if (rows.length === 0) {
    return { response: 'No expenses recorded this month yet.', type: 'text' };
  }

  const total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  let response = `📊 **Expenses this month:** ₱${formatNum(total)} (${rows.length} transactions)\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **${r.category}** — ₱${formatNum(r.amount)}${r.description ? ` (${r.description})` : ''}\n`;
  });

  return { response, type: 'table', rawData: rows };
}

async function incomeThisMonth() {
  const now = new Date();
  const [rows] = await pool.query(`
    SELECT i.source, t.amount, t.date
    FROM transactions t
    JOIN income i ON i.transaction_id = t.id
    WHERE t.type = 'income' AND MONTH(t.date) = ? AND YEAR(t.date) = ?
    ORDER BY t.amount DESC
  `, [now.getMonth() + 1, now.getFullYear()]);

  if (rows.length === 0) {
    return { response: 'No income recorded this month yet.', type: 'text' };
  }

  const total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  let response = `💰 **Income this month:** ₱${formatNum(total)} (${rows.length} entries)\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **${r.source}** — ₱${formatNum(r.amount)}\n`;
  });

  return { response, type: 'table', rawData: rows };
}

async function expensesByCategory() {
  const [rows] = await pool.query(`
    SELECT e.category, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type = 'expense'
    GROUP BY e.category
    ORDER BY total DESC
  `);

  if (rows.length === 0) {
    return { response: 'No expenses recorded yet.', type: 'text' };
  }

  const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  let response = `📋 **Expense Breakdown by Category:**\n\n`;
  rows.forEach((r, i) => {
    const pct = ((parseFloat(r.total) / grandTotal) * 100).toFixed(1);
    response += `${i + 1}. **${r.category}** — ₱${formatNum(r.total)} (${pct}%, ${r.count} transactions)\n`;
  });
  response += `\n**Grand Total:** ₱${formatNum(grandTotal)}`;

  return { response, type: 'table', rawData: rows };
}

async function topExpenses() {
  const [rows] = await pool.query(`
    SELECT t.amount, t.date, e.category, e.description, u.name AS user_name
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
    ORDER BY t.amount DESC
    LIMIT 5
  `);

  if (rows.length === 0) {
    return { response: 'No expenses recorded yet.', type: 'text' };
  }

  let response = `🔝 **Top 5 Largest Expenses:**\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **₱${formatNum(r.amount)}** — ${r.category}${r.description ? ` (${r.description})` : ''}\n   📅 ${formatDate(r.date)} | 👤 ${r.user_name}\n`;
  });

  return { response, type: 'table', rawData: rows };
}

async function latestTransactions() {
  const [rows] = await pool.query(`
    SELECT t.id, t.type, t.amount, t.date, u.name AS user_name,
           i.source, e.category, e.description
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN income i ON i.transaction_id = t.id
    LEFT JOIN expenses e ON e.transaction_id = t.id
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT 5
  `);

  if (rows.length === 0) {
    return { response: 'No transactions recorded yet.', type: 'text' };
  }

  let response = `📝 **Latest 5 Transactions:**\n\n`;
  rows.forEach((r, i) => {
    const icon = r.type === 'income' ? '💰' : '📉';
    const detail = r.type === 'income' ? r.source : r.category;
    response += `${i + 1}. ${icon} **${r.type.toUpperCase()}** — ₱${formatNum(r.amount)}\n   ${detail} | 📅 ${formatDate(r.date)} | 👤 ${r.user_name}\n`;
  });

  return { response, type: 'table', rawData: rows };
}

async function topSpenders() {
  const [rows] = await pool.query(`
    SELECT u.name, SUM(t.amount) AS total_spent, COUNT(*) AS transaction_count
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
    GROUP BY u.id, u.name
    ORDER BY total_spent DESC
    LIMIT 5
  `);

  if (rows.length === 0) {
    return { response: 'No expenses recorded yet.', type: 'text' };
  }

  let response = `👥 **Top Spenders:**\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **${r.name}** — ₱${formatNum(r.total_spent)} (${r.transaction_count} transactions)\n`;
  });

  return { response, type: 'table', rawData: rows };
}

async function monthlyReport(message) {
  // Try to extract month from message
  const months = ['january','february','march','april','may','june',
                   'july','august','september','october','november','december'];
  
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();

  for (let i = 0; i < months.length; i++) {
    if (message.includes(months[i])) {
      month = i + 1;
      break;
    }
  }

  // Try to extract year
  const yearMatch = message.match(/20\d{2}/);
  if (yearMatch) {
    year = parseInt(yearMatch[0]);
  }

  const [rows] = await pool.query('CALL monthly_report(?, ?)', [month, year]);
  const data = rows[0]; // First result set from stored procedure

  if (!data || data.length === 0) {
    return { response: `No transactions found for ${months[month-1]} ${year}.`, type: 'text' };
  }

  let response = `📊 **Monthly Report: ${months[month-1].charAt(0).toUpperCase() + months[month-1].slice(1)} ${year}**\n\n`;
  data.forEach(r => {
    const icon = r.type === 'income' ? '💰' : '📉';
    response += `${icon} **${r.type.toUpperCase()}**\n`;
    response += `   Total: ₱${formatNum(r.total_amount)}\n`;
    response += `   Transactions: ${r.transaction_count}\n`;
    response += `   Average: ₱${formatNum(r.average_amount)}\n`;
    response += `   Largest: ₱${formatNum(r.largest_transaction)}\n\n`;
  });

  return { response, type: 'report', rawData: data };
}

async function incomeSources() {
  const [rows] = await pool.query(`
    SELECT i.source, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t
    JOIN income i ON i.transaction_id = t.id
    WHERE t.type = 'income'
    GROUP BY i.source
    ORDER BY total DESC
  `);

  if (rows.length === 0) {
    return { response: 'No income sources recorded yet.', type: 'text' };
  }

  let response = `💰 **Income Sources:**\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **${r.source}** — ₱${formatNum(r.total)} (${r.count} entries)\n`;
  });

  return { response, type: 'table', rawData: rows };
}

async function totalIncome() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  return {
    response: `💰 **Total Income:** ₱${formatNum(rows[0].total_income)}`,
    type: 'text',
    rawData: rows[0]
  };
}

async function totalExpenses() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  return {
    response: `📉 **Total Expenses:** ₱${formatNum(rows[0].total_expenses)}`,
    type: 'text',
    rawData: rows[0]
  };
}

function showHelp() {
  const response = `🤖 **BudgetBukas AI Assistant**\n\nHere are things you can ask me:\n\n` +
    `💰 **"Total balance"** — Check remaining funds\n` +
    `📊 **"Expenses this month"** — Current month spending\n` +
    `📋 **"Expenses by category"** — Category breakdown\n` +
    `🔝 **"Top expenses"** — 5 largest expenses\n` +
    `📝 **"Latest transactions"** — Recent activity\n` +
    `👥 **"Who spent the most"** — Top spenders\n` +
    `📄 **"Monthly report"** — Monthly summary\n` +
    `💵 **"Income sources"** — Where money comes from\n\n` +
    `You can also ask in Filipino! Try: "Saan napunta pera?" or "Magkano natira?"`;

  return Promise.resolve({ response, type: 'help' });
}

// Utility helpers
function formatNum(num) {
  return parseFloat(num).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

module.exports = { handleQuery };
