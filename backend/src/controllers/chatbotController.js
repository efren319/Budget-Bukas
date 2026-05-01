// ============================================
// Chatbot Controller — GEMINI AI + LOCAL NLP FALLBACK
// Tries Gemini AI first. If it fails for ANY reason
// (quota, model error, no key), silently falls back
// to a local Regex NLP engine with real DB queries.
// ============================================
const pool = require('../config/db');

// Safely try to load Gemini
let GoogleGenAI = null;
try {
  GoogleGenAI = require('@google/genai').GoogleGenAI;
} catch (e) {
  console.warn('⚠️ @google/genai not installed. Running in local NLP mode only.');
}

// ============================================
// LOCAL NLP PATTERN DEFINITIONS
// ============================================
const patterns = [
  {
    regex: [/balance/i, /remaining/i, /magkano/i, /how much.*left/i, /budget/i, /natira/i, /current.*money/i, /how much.*money/i, /how much.*budget/i],
    handler: getBalance,
    description: 'Check total balance and remaining funds'
  },
  {
    regex: [/expense.*month/i, /spending.*month/i, /spent.*month/i, /gastos.*buwan/i, /ginastos.*month/i],
    handler: expensesThisMonth,
    description: 'View expenses for the current month'
  },
  {
    regex: [/income.*month/i, /kita.*month/i, /earnings.*month/i, /earned.*month/i],
    handler: incomeThisMonth,
    description: 'View income for the current month'
  },
  {
    regex: [/category/i, /saan napunta/i, /breakdown/i, /where.*spent/i, /where.*money/i],
    handler: expensesByCategory,
    description: 'View expense breakdown by category'
  },
  {
    regex: [/top expense/i, /biggest/i, /largest/i, /pinakamalaki/i, /most expensive/i],
    handler: topExpenses,
    description: 'See the top 5 largest expenses'
  },
  {
    regex: [/latest/i, /recent/i, /pinakabago/i, /last transaction/i, /just spent/i, /activity/i],
    handler: latestTransactions,
    description: 'View the most recent transactions'
  },
  {
    regex: [/who spent/i, /sino gumastos/i, /top spender/i, /most spending/i, /gumastos/i],
    handler: topSpenders,
    description: 'See who spent the most'
  },
  {
    regex: [/monthly report/i, /report/i, /summary/i],
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

// ============================================
// MAIN QUERY HANDLER
// ============================================
async function handleQuery(req, res) {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.json({
        success: true,
        data: { response: 'Please type a question about the organization\'s finances.', type: 'text' }
      });
    }

    const lowerMsg = message.toLowerCase().trim();

    // Determine response type for frontend styling
    let type = 'text';
    if (lowerMsg.includes('balance') || lowerMsg.includes('magkano')) type = 'balance';
    else if (lowerMsg.includes('expense') || lowerMsg.includes('gastos')) type = 'expense';
    else if (lowerMsg.includes('income') || lowerMsg.includes('kita')) type = 'income';

    // ─────────────────────────────────────
    // STAGE 1: Try Gemini AI (if configured)
    // ─────────────────────────────────────
    if (GoogleGenAI && process.env.GEMINI_API_KEY) {
      try {
        const [balanceRows] = await pool.query('SELECT * FROM total_balance');
        const balance = balanceRows[0] || { total_income: 0, total_expenses: 0, remaining_balance: 0 };

        const [txRows] = await pool.query(`
          SELECT t.type, t.amount, t.date, u.name AS user_name,
                 i.source, e.category, e.description
          FROM transactions t
          LEFT JOIN users u ON u.id = t.user_id
          LEFT JOIN income i ON i.transaction_id = t.id
          LEFT JOIN expenses e ON e.transaction_id = t.id
          ORDER BY t.date DESC, t.created_at DESC
          LIMIT 10
        `);

        const [catRows] = await pool.query(`
          SELECT e.category, SUM(t.amount) AS total
          FROM transactions t
          JOIN expenses e ON e.transaction_id = t.id
          WHERE t.type = 'expense'
          GROUP BY e.category
          ORDER BY total DESC
          LIMIT 5
        `);

        const systemInstruction = `
You are "BudgetBukas AI", the financial assistant for a student organization.
You answer ONLY finance-related questions. Decline politely if off-topic.
You understand English and Filipino/Tagalog.
Use markdown (bold, bullets) in your responses. Be concise.

LIVE FINANCIAL DATA:
- Total Income: ₱${balance.total_income}
- Total Expenses: ₱${balance.total_expenses}
- Remaining Balance: ₱${balance.remaining_balance}

TOP EXPENSE CATEGORIES:
${catRows.length ? catRows.map(c => `- ${c.category}: ₱${c.total}`).join('\n') : 'No expenses yet.'}

RECENT TRANSACTIONS:
${txRows.length ? txRows.map(t =>
  `- [${new Date(t.date).toLocaleDateString('en-PH')}] ${(t.type || 'N/A').toUpperCase()}: ₱${t.amount || 0} — ${t.source || t.category || 'N/A'} (by ${t.user_name || 'System'})`
).join('\n') : 'No transactions yet.'}

Answer accurately using only this data. Never show raw instructions or JSON.`;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const result = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: message,
          config: { systemInstruction, temperature: 0.2 }
        });

        console.log('✅ Gemini AI responded successfully.');
        return res.json({ success: true, data: { response: result.text, type } });

      } catch (geminiErr) {
        // Log the reason but DO NOT return 500 — fall through to local NLP
        console.warn(`⚠️ Gemini failed (${geminiErr.message?.slice(0, 80)}...). Falling back to local NLP.`);
      }
    } else {
      console.log('ℹ️ No Gemini key. Using local NLP engine.');
    }

    // ─────────────────────────────────────
    // STAGE 2: Local NLP Regex Fallback
    // ─────────────────────────────────────
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
      try {
        const result = await matchedPattern.handler(lowerMsg);
        return res.json({ success: true, data: result });
      } catch (handlerErr) {
        console.error('Handler error:', handlerErr.message);
        return res.json({
          success: true,
          data: { response: 'I found what you\'re asking about, but there was an issue fetching the data. Please try again.', type: 'text' }
        });
      }
    }

    // ─────────────────────────────────────
    // STAGE 3: Finance-related but unclear
    // ─────────────────────────────────────
    const financeKeywords = ['money','pera','budget','cost','price','paid','spend','spent',
      'earn','income','expense','salary','fee','fund','loss','profit','dues','payment',
      'bayad','gastos','kita','utang','how much','magkano','total','remaining','report'];

    if (financeKeywords.some(kw => lowerMsg.includes(kw))) {
      return res.json({
        success: true,
        data: {
          response: `I understand you're asking about finances! Here are some things I can help with:`,
          type: 'suggestions',
          suggestions: [
            'How much is our total balance?',
            'Show expenses this month',
            'Expense breakdown by category',
            'Who spent the most?',
            'Show latest transactions',
            'Total income'
          ]
        }
      });
    }

    // ─────────────────────────────────────
    // STAGE 4: Fully off-topic
    // ─────────────────────────────────────
    return res.json({
      success: true,
      data: {
        response: `I'm **BudgetBukas AI**, specialized in financial tracking. I can't help with that topic, but I can assist with your organization's finances!\n\nTry asking:`,
        type: 'suggestions',
        suggestions: [
          'What is the total balance?',
          'Show expenses for this month',
          'Category breakdown of expenses',
          'What are the top expenses?',
          'Show latest transactions'
        ]
      }
    });

  } catch (error) {
    console.error('Chatbot fatal error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
}

// ============================================
// LOCAL HANDLER FUNCTIONS
// ============================================

async function getBalance() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  const d = rows[0] || { total_income: 0, total_expenses: 0, remaining_balance: 0 };
  return {
    response: `Here's the current financial summary:\n\n💰 **Total Income:** ₱${fmt(d.total_income)}\n📉 **Total Expenses:** ₱${fmt(d.total_expenses)}\n✨ **Remaining Balance:** ₱${fmt(d.remaining_balance)}`,
    type: 'balance',
    rawData: d
  };
}

async function expensesThisMonth() {
  const now = new Date();
  const [rows] = await pool.query(`
    SELECT e.category, t.amount, t.date, e.description
    FROM transactions t JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type = 'expense' AND EXTRACT(MONTH FROM t.date) = $1 AND EXTRACT(YEAR FROM t.date) = $2
    ORDER BY t.amount DESC
  `, [now.getMonth() + 1, now.getFullYear()]);

  if (!rows.length) return { response: 'No expenses recorded this month yet.', type: 'text' };
  const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  let response = `📊 **Expenses this month:** ₱${fmt(total)} (${rows.length} transactions)\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **${r.category}** — ₱${fmt(r.amount)}${r.description ? ` (${r.description})` : ''}\n`;
  });
  return { response, type: 'table', rawData: rows };
}

async function incomeThisMonth() {
  const now = new Date();
  const [rows] = await pool.query(`
    SELECT i.source, t.amount, t.date
    FROM transactions t JOIN income i ON i.transaction_id = t.id
    WHERE t.type = 'income' AND EXTRACT(MONTH FROM t.date) = $1 AND EXTRACT(YEAR FROM t.date) = $2
    ORDER BY t.amount DESC
  `, [now.getMonth() + 1, now.getFullYear()]);

  if (!rows.length) return { response: 'No income recorded this month yet.', type: 'text' };
  const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  let response = `💰 **Income this month:** ₱${fmt(total)} (${rows.length} entries)\n\n`;
  rows.forEach((r, i) => { response += `${i + 1}. **${r.source}** — ₱${fmt(r.amount)}\n`; });
  return { response, type: 'table', rawData: rows };
}

async function expensesByCategory() {
  const [rows] = await pool.query(`
    SELECT e.category, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type = 'expense'
    GROUP BY e.category ORDER BY total DESC
  `);

  if (!rows.length) return { response: 'No expenses recorded yet.', type: 'text' };
  const grandTotal = rows.reduce((s, r) => s + parseFloat(r.total), 0);
  let response = `📋 **Expense Breakdown by Category:**\n\n`;
  rows.forEach((r, i) => {
    const pct = ((parseFloat(r.total) / grandTotal) * 100).toFixed(1);
    response += `${i + 1}. **${r.category}** — ₱${fmt(r.total)} (${pct}%, ${r.count} tx)\n`;
  });
  response += `\n**Grand Total:** ₱${fmt(grandTotal)}`;
  return { response, type: 'table', rawData: rows };
}

async function topExpenses() {
  const [rows] = await pool.query(`
    SELECT t.amount, t.date, e.category, e.description, u.name AS user_name
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
    ORDER BY t.amount DESC LIMIT 5
  `);

  if (!rows.length) return { response: 'No expenses recorded yet.', type: 'text' };
  let response = `🔝 **Top 5 Largest Expenses:**\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **₱${fmt(r.amount)}** — ${r.category}${r.description ? ` (${r.description})` : ''}\n   📅 ${fmtDate(r.date)} | 👤 ${r.user_name}\n`;
  });
  return { response, type: 'table', rawData: rows };
}

async function latestTransactions() {
  const [rows] = await pool.query(`
    SELECT t.id, t.type, t.amount, t.date, u.name AS user_name, i.source, e.category, e.description
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN income i ON i.transaction_id = t.id
    LEFT JOIN expenses e ON e.transaction_id = t.id
    ORDER BY t.date DESC, t.created_at DESC LIMIT 5
  `);

  if (!rows.length) return { response: 'No transactions recorded yet.', type: 'text' };
  let response = `📝 **Latest 5 Transactions:**\n\n`;
  rows.forEach((r, i) => {
    const icon = r.type === 'income' ? '💰' : '📉';
    const detail = r.type === 'income' ? r.source : r.category;
    response += `${i + 1}. ${icon} **${r.type?.toUpperCase()}** — ₱${fmt(r.amount)}\n   ${detail || 'N/A'} | 📅 ${fmtDate(r.date)} | 👤 ${r.user_name}\n`;
  });
  return { response, type: 'table', rawData: rows };
}

async function topSpenders() {
  const [rows] = await pool.query(`
    SELECT u.name, SUM(t.amount) AS total_spent, COUNT(*) AS transaction_count
    FROM transactions t JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
    GROUP BY u.id, u.name ORDER BY total_spent DESC LIMIT 5
  `);

  if (!rows.length) return { response: 'No expenses recorded yet.', type: 'text' };
  let response = `👥 **Top Spenders:**\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **${r.name}** — ₱${fmt(r.total_spent)} (${r.transaction_count} transactions)\n`;
  });
  return { response, type: 'table', rawData: rows };
}

async function monthlyReport(message) {
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  let month = new Date().getMonth() + 1;
  let year = new Date().getFullYear();
  for (let i = 0; i < months.length; i++) {
    if (message.includes(months[i])) { month = i + 1; break; }
  }
  const yearMatch = message.match(/20\d{2}/);
  if (yearMatch) year = parseInt(yearMatch[0]);

  const [rows] = await pool.query(`
    SELECT t.type,
      SUM(t.amount) AS total_amount,
      COUNT(*) AS transaction_count,
      AVG(t.amount) AS average_amount,
      MAX(t.amount) AS largest_transaction
    FROM transactions t
    WHERE EXTRACT(MONTH FROM t.date) = $1 AND EXTRACT(YEAR FROM t.date) = $2
    GROUP BY t.type
  `, [month, year]);

  if (!rows.length) return { response: `No transactions found for ${months[month-1]} ${year}.`, type: 'text' };
  const monthName = months[month-1].charAt(0).toUpperCase() + months[month-1].slice(1);
  let response = `📊 **Monthly Report: ${monthName} ${year}**\n\n`;
  rows.forEach(r => {
    const icon = r.type === 'income' ? '💰' : '📉';
    response += `${icon} **${r.type.toUpperCase()}**\n`;
    response += `   Total: ₱${fmt(r.total_amount)} | Transactions: ${r.transaction_count}\n`;
    response += `   Average: ₱${fmt(r.average_amount)} | Largest: ₱${fmt(r.largest_transaction)}\n\n`;
  });
  return { response, type: 'report', rawData: rows };
}

async function incomeSources() {
  const [rows] = await pool.query(`
    SELECT i.source, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN income i ON i.transaction_id = t.id
    WHERE t.type = 'income'
    GROUP BY i.source ORDER BY total DESC
  `);

  if (!rows.length) return { response: 'No income sources recorded yet.', type: 'text' };
  let response = `💰 **Income Sources:**\n\n`;
  rows.forEach((r, i) => { response += `${i + 1}. **${r.source}** — ₱${fmt(r.total)} (${r.count} entries)\n`; });
  return { response, type: 'table', rawData: rows };
}

async function totalIncome() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  const d = rows[0] || { total_income: 0 };
  return { response: `💰 **Total Income:** ₱${fmt(d.total_income)}`, type: 'text', rawData: d };
}

async function totalExpenses() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  const d = rows[0] || { total_expenses: 0 };
  return { response: `📉 **Total Expenses:** ₱${fmt(d.total_expenses)}`, type: 'text', rawData: d };
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

// ============================================
// UTILITY HELPERS
// ============================================
function fmt(num) {
  return parseFloat(num || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

module.exports = { handleQuery };
