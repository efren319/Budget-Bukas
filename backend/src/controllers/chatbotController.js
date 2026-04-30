// ============================================
// Chatbot Controller
// Pattern-matching NL → SQL → Formatted Response
// ============================================
const pool = require('../config/db');

// Pattern definitions: Regex arrays -> SQL query builder
const patterns = [
  {
    regex: [/total balance/i, /remaining/i, /magkano/i, /how much.*left/i, /balance/i, /natira/i, /budget/i, /current money/i, /how much money/i],
    handler: getBalance,
    description: 'Check total balance and remaining funds'
  },
  {
    regex: [/expenses.*month/i, /ginastos.*month/i, /spending.*month/i, /gastos.*buwan/i, /spent.*month/i],
    handler: expensesThisMonth,
    description: 'View expenses for the current month'
  },
  {
    regex: [/income.*month/i, /kita.*month/i, /earnings.*month/i, /earned.*month/i],
    handler: incomeThisMonth,
    description: 'View income for the current month'
  },
  {
    regex: [/category/i, /saan napunta/i, /breakdown/i, /where.*spent/i],
    handler: expensesByCategory,
    description: 'View expense breakdown by category'
  },
  {
    regex: [/top expenses/i, /biggest/i, /largest/i, /pinakamalaki/i, /most expensive/i],
    handler: topExpenses,
    description: 'See the top 5 largest expenses'
  },
  {
    regex: [/latest/i, /recent/i, /pinakabago/i, /last transaction/i, /just spent/i],
    handler: latestTransactions,
    description: 'View the most recent transactions'
  },
  {
    regex: [/who spent/i, /sino gumastos/i, /top spender/i, /most spending/i, /gumastos/i],
    handler: topSpenders,
    description: 'See who spent the most'
  },
  {
    regex: [/monthly report/i, /report/i, /summary for/i],
    handler: monthlyReport,
    description: 'Generate a monthly financial report'
  },
  {
    regex: [/income source/i, /where.*income/i, /saan galing/i, /source/i],
    handler: incomeSources,
    description: 'View all income sources'
  },
  {
    regex: [/total income/i, /kabuuang kita/i, /all income/i, /how much.*earned/i],
    handler: totalIncome,
    description: 'View total income'
  },
  {
    regex: [/total expense/i, /kabuuang gastos/i, /all expense/i, /how much.*spent/i],
    handler: totalExpenses,
    description: 'View total expenses'
  },
  {
    regex: [/help/i, /what can you do/i, /commands/i, /tulong/i, /how.*use/i, /features/i],
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

    // Find matching pattern using Regex
    let matchedPattern = null;

    for (const pattern of patterns) {
      for (const rx of pattern.regex) {
        if (rx.test(lowerMsg)) {
          matchedPattern = pattern;
          break;
        }
      }
      if (matchedPattern) break;
    }

    if (matchedPattern) {
      const result = await matchedPattern.handler(lowerMsg);
      return res.json({ success: true, data: result });
    }

    // ---- Domain Control: check if possibly finance-related ----
    const financeKeywords = ['money', 'pera', 'budget', 'cost', 'price', 'paid',
      'spend', 'spent', 'earn', 'income', 'expense', 'salary', 'fee', 'fund',
      'loss', 'profit', 'dues', 'payment', 'bayad', 'gastos', 'kita', 'utang',
      'how much', 'magkano', 'total', 'remaining', 'report', 'summary'];

    const maybeFinance = financeKeywords.some(kw => lowerMsg.includes(kw));

    if (maybeFinance) {
      // Attempt intent understanding
      return res.json({
        success: true,
        data: {
          response: `I think you're asking about finances, but I couldn't understand the specific request. Could you try rephrasing?\n\nFor example, try asking:`,
          type: 'suggestions',
          suggestions: [
            'How much is our budget right now?',
            'What are the expenses this month?',
            'Show me the category breakdown',
            'Who spent the most money?',
            'What are our latest transactions?'
          ]
        }
      });
    }

    // Off-topic: redirect to finance domain
    return res.json({
      success: true,
      data: {
        response: `I'm an AI assistant focused exclusively on financial tracking for PondoSync. I can help you with budgeting, expenses, income, and financial reports.\n\nTry asking something like:`,
        type: 'suggestions',
        suggestions: [
          'What is the total balance?',
          'Show expenses for this month',
          'Expense category breakdown',
          'What are the top expenses?',
          'Show latest transactions'
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
  const data = rows[0] || { total_income: 0, total_expenses: 0, remaining_balance: 0 };
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
  const data = rows[0] || { total_income: 0 };
  return {
    response: `💰 **Total Income:** ₱${formatNum(data.total_income)}`,
    type: 'text',
    rawData: data
  };
}

  const data = rows[0] || { total_expenses: 0 };
  return {
    response: `📉 **Total Expenses:** ₱${formatNum(data.total_expenses)}`,
    type: 'text',
    rawData: data
  };
}

function showHelp() {
  const response = `🤖 **PondoSync AI Assistant**\n\nHere are things you can ask me:\n\n` +
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
