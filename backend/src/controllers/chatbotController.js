// ============================================
// Chatbot Controller — GEMINI AI + LOCAL NLP FALLBACK
// Tries Gemini AI first. On any failure (quota, model,
// no key) → silently falls back to local NLP engine.
// ============================================
const pool = require('../config/db');

let GoogleGenAI = null;
try { GoogleGenAI = require('@google/genai').GoogleGenAI; } catch (e) {}

// ============================================
// LOCAL NLP PATTERNS — Most specific FIRST
// ============================================
const patterns = [
  {
    // "last item that decrease budget", "what was the last purchase", "latest expense"
    regex: [/last.*(?:expense|spend|spent|decrease|item|payment|purchase|bought)/i,
            /what.*last.*(?:spend|expense|paid|bought)/i,
            /(?:recent|latest).*(?:expense|spend|payment|purchase)/i],
    handler: lastExpense
  },
  {
    // "expenses this month", "spending this month", "how much did we spend this month"
    regex: [/expense.*month/i, /spending.*month/i, /spent.*month/i,
            /how much.*spend.*month/i, /how much.*spent.*month/i, /gastos.*buwan/i],
    handler: expensesThisMonth
  },
  {
    regex: [/income.*month/i, /kita.*month/i, /earnings.*month/i, /earned.*month/i],
    handler: incomeThisMonth
  },
  {
    regex: [/total income/i, /kabuuang kita/i, /how much.*(?:total )?income/i, /how much.*earned/i],
    handler: totalIncome
  },
  {
    regex: [/total expense/i, /kabuuang gastos/i, /all expense/i],
    handler: totalExpenses
  },
  {
    regex: [/category/i, /saan napunta/i, /breakdown/i, /where.*(?:money going|spending|spend)/i],
    handler: expensesByCategory
  },
  {
    regex: [/top expense/i, /biggest.*expense/i, /largest.*expense/i, /pinakamalaki/i, /most expensive/i],
    handler: topExpenses
  },
  {
    regex: [/latest.*transaction/i, /recent.*transaction/i, /show.*transaction/i,
            /last.*transaction/i, /pinakabago/i, /recent.*activity/i],
    handler: latestTransactions
  },
  {
    regex: [/who spent/i, /sino gumastos/i, /top spender/i, /most spending/i, /gumastos/i],
    handler: topSpenders
  },
  {
    regex: [/monthly report/i, /report.*(?:for|month)/i, /month.*summary/i],
    handler: monthlyReport
  },
  {
    regex: [/income source/i, /where.*income.*from/i, /saan galing.*pera/i],
    handler: incomeSources
  },
  {
    regex: [/help/i, /what can you do/i, /commands/i, /tulong/i, /features/i],
    handler: showHelp
  },
  {
    // Generic balance/budget — LAST because "budget" and "balance" are broad words
    regex: [/^(?:how much|magkano|what is|what'?s|anong|ano ang).*(?:balance|budget|remaining|natira|left|money)/i,
            /(?:total )?balance/i, /remaining.*(?:balance|budget|fund)/i,
            /current.*(?:balance|budget|fund)/i, /natira/i, /magkano/i],
    handler: getBalance
  },
];

// ============================================
// MAIN HANDLER
// ============================================
async function handleQuery(req, res) {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.json({ success: true, data: { response: 'Please type a question about your organization\'s finances.', type: 'text' } });
    }

    const lowerMsg = message.toLowerCase().trim();
    let type = 'text';
    if (/balance|magkano|budget/.test(lowerMsg)) type = 'balance';
    else if (/expense|gastos/.test(lowerMsg)) type = 'expense';
    else if (/income|kita/.test(lowerMsg)) type = 'income';

    // ── STAGE 1: Try Gemini ──────────────────────
    if (GoogleGenAI && process.env.GEMINI_API_KEY) {
      try {
        const [balRows] = await pool.query('SELECT * FROM total_balance');
        const bal = balRows[0] || { total_income: 0, total_expenses: 0, remaining_balance: 0 };
        const [txRows] = await pool.query(`
          SELECT t.type, t.amount, t.date, u.name AS user_name,
                 i.source, e.category, e.description
          FROM transactions t
          LEFT JOIN users u ON u.id = t.user_id
          LEFT JOIN income i ON i.transaction_id = t.id
          LEFT JOIN expenses e ON e.transaction_id = t.id
          ORDER BY t.date DESC, t.created_at DESC LIMIT 10`);
        const [catRows] = await pool.query(`
          SELECT e.category, SUM(t.amount) AS total
          FROM transactions t JOIN expenses e ON e.transaction_id = t.id
          WHERE t.type='expense' GROUP BY e.category ORDER BY total DESC LIMIT 5`);

        const systemInstruction = `You are "BudgetBukas AI", a warm and conversational financial assistant for a student organization (JPCS). Speak naturally like a helpful friend — not like a report generator. Use markdown. Answer finance questions ONLY. Understand English and Filipino.

LIVE DATA:
- Total Income: ₱${bal.total_income}
- Total Expenses: ₱${bal.total_expenses}
- Remaining Balance: ₱${bal.remaining_balance}
Top Expense Categories: ${catRows.map(c => `${c.category}: ₱${c.total}`).join(', ') || 'None yet'}
Recent Transactions: ${txRows.map(t => `[${new Date(t.date).toLocaleDateString('en-PH')}] ${t.type?.toUpperCase()}: ₱${t.amount} (${t.source || t.category || 'N/A'}) by ${t.user_name || 'System'}`).join(' | ') || 'None yet'}

Give answers that feel like you are TALKING to the user. Interpret the data — don't just list it. If the database is empty, say so warmly and encourage them to add transactions.`;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const result = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: message,
          config: { systemInstruction, temperature: 0.4 }
        });
        console.log('✅ Gemini responded.');
        return res.json({ success: true, data: { response: result.text, type } });
      } catch (e) {
        console.warn('⚠️ Gemini failed, using local NLP:', e.message?.slice(0, 60));
      }
    }

    // ── STAGE 2: Local NLP ───────────────────────
    for (const p of patterns) {
      for (const rx of p.regex) {
        if (rx.test(lowerMsg)) {
          try {
            const result = await p.handler(lowerMsg);
            return res.json({ success: true, data: result });
          } catch (handlerErr) {
            console.error('Handler error:', handlerErr.message);
            return res.json({ success: true, data: { response: 'I found what you\'re looking for but had trouble fetching the data. Please try again!', type: 'text' } });
          }
        }
      }
    }

    // ── STAGE 3: Finance-related but unclear ─────
    const finKeywords = ['money','pera','budget','cost','price','paid','spend','spent','earn',
      'income','expense','salary','fee','fund','loss','profit','dues','payment','bayad',
      'gastos','kita','utang','how much','magkano','total','remaining','report'];
    if (finKeywords.some(k => lowerMsg.includes(k))) {
      return res.json({ success: true, data: {
        response: `I understand you're asking about finances — I just need a bit more clarity! Here are some things I can help with:`,
        type: 'suggestions',
        suggestions: ['How much budget do we have?', 'Expenses this month', 'Category breakdown', 'Who spent the most?', 'Latest transactions', 'Total income']
      }});
    }

    // ── STAGE 4: Off-topic ───────────────────────
    return res.json({ success: true, data: {
      response: `I'm **BudgetBukas AI** — I'm built specifically for your organization's finances! That topic is outside my scope, but I'd love to help you with budgets, expenses, or income reports. 😊`,
      type: 'suggestions',
      suggestions: ['What is the total balance?', 'Expenses this month', 'Category breakdown', 'Latest transactions', 'Monthly report']
    }});

  } catch (err) {
    console.error('Chatbot fatal error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
}

// ============================================
// HANDLER FUNCTIONS — Conversational Style
// ============================================

async function lastExpense() {
  const [rows] = await pool.query(`
    SELECT t.amount, t.date, e.category, e.description, u.name AS user_name
    FROM transactions t
    JOIN expenses e ON e.transaction_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
    ORDER BY t.date DESC, t.created_at DESC LIMIT 1
  `);
  if (!rows.length) return { response: `It looks like no expenses have been recorded yet! Once someone logs a purchase or payment, I'll be able to tell you all about it. 😊`, type: 'text' };
  const r = rows[0];
  const desc = r.description ? ` for "${r.description}"` : '';
  return {
    response: `The most recent expense was **₱${fmt(r.amount)}** under **${r.category}**${desc}, recorded on **${fmtDate(r.date)}**${r.user_name ? ` by **${r.user_name}**` : ''}.\n\nWant me to show you all recent transactions or the full expense breakdown?`,
    type: 'text', rawData: r
  };
}

async function getBalance() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  const d = rows[0] || { total_income: 0, total_expenses: 0, remaining_balance: 0 };
  const income = parseFloat(d.total_income || 0);
  const expenses = parseFloat(d.total_expenses || 0);
  const balance = parseFloat(d.remaining_balance || 0);

  if (income === 0 && expenses === 0) {
    return { response: `Your organization's ledger is currently empty — no income or expenses have been recorded yet! Once you start adding transactions, I'll be able to give you a full financial picture. 📋`, type: 'balance', rawData: d };
  }

  const healthMsg = balance > 0
    ? `That's a healthy surplus! Your organization is currently **in the green**. 💚`
    : balance === 0
    ? `All income has been fully accounted for — the balance is exactly zero.`
    : `⚠️ Expenses have exceeded income by **₱${fmt(Math.abs(balance))}**. It may be time to review spending!`;

  return {
    response: `Here's the current financial picture for your organization:\n\n💰 **Total Income:** ₱${fmt(income)}\n📉 **Total Expenses:** ₱${fmt(expenses)}\n✨ **Remaining Balance:** ₱${fmt(balance)}\n\n${healthMsg}`,
    type: 'balance', rawData: d
  };
}

async function expensesThisMonth() {
  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const [rows] = await pool.query(`
    SELECT e.category, t.amount, t.date, e.description
    FROM transactions t JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type='expense' AND EXTRACT(MONTH FROM t.date)=$1 AND EXTRACT(YEAR FROM t.date)=$2
    ORDER BY t.amount DESC
  `, [now.getMonth() + 1, now.getFullYear()]);
  if (!rows.length) return { response: `Good news — no expenses have been recorded yet for **${monthName}**! The budget is still intact. 😄`, type: 'text' };

  const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  const top = rows[0];
  let response = `For **${monthName}**, the organization has spent a total of **₱${fmt(total)}** across **${rows.length}** transaction${rows.length > 1 ? 's' : ''}.\n\nThe biggest expense is **${top.category}** at **₱${fmt(top.amount)}**${top.description ? ` (${top.description})` : ''}.\n\n**Full Breakdown:**\n\n`;
  rows.forEach((r, i) => { response += `${i + 1}. **${r.category}** — ₱${fmt(r.amount)}${r.description ? ` *(${r.description})*` : ''}\n`; });
  return { response, type: 'table', rawData: rows };
}

async function incomeThisMonth() {
  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const [rows] = await pool.query(`
    SELECT i.source, t.amount, t.date
    FROM transactions t JOIN income i ON i.transaction_id = t.id
    WHERE t.type='income' AND EXTRACT(MONTH FROM t.date)=$1 AND EXTRACT(YEAR FROM t.date)=$2
    ORDER BY t.amount DESC
  `, [now.getMonth() + 1, now.getFullYear()]);
  if (!rows.length) return { response: `No income has been logged for **${monthName}** yet. Once dues or contributions are recorded, I'll show you! 💰`, type: 'text' };

  const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  let response = `The organization brought in **₱${fmt(total)}** in income this **${monthName}** from ${rows.length} source${rows.length > 1 ? 's' : ''}:\n\n`;
  rows.forEach((r, i) => { response += `${i + 1}. **${r.source}** — ₱${fmt(r.amount)}\n`; });
  return { response, type: 'table', rawData: rows };
}

async function expensesByCategory() {
  const [rows] = await pool.query(`
    SELECT e.category, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN expenses e ON e.transaction_id = t.id
    WHERE t.type='expense' GROUP BY e.category ORDER BY total DESC
  `);
  if (!rows.length) return { response: `No expenses have been categorized yet! Start adding expense transactions and I'll break them down for you. 📊`, type: 'text' };

  const grandTotal = rows.reduce((s, r) => s + parseFloat(r.total), 0);
  const top = rows[0];
  let response = `The biggest spending category is **${top.category}**, making up **${((parseFloat(top.total) / grandTotal) * 100).toFixed(1)}%** of all expenses.\n\n**Full Category Breakdown:**\n\n`;
  rows.forEach((r, i) => {
    const pct = ((parseFloat(r.total) / grandTotal) * 100).toFixed(1);
    response += `${i + 1}. **${r.category}** — ₱${fmt(r.total)} (${pct}%, ${r.count} transaction${r.count > 1 ? 's' : ''})\n`;
  });
  response += `\n**Total Spent:** ₱${fmt(grandTotal)}`;
  return { response, type: 'table', rawData: rows };
}

async function topExpenses() {
  const [rows] = await pool.query(`
    SELECT t.amount, t.date, e.category, e.description, u.name AS user_name
    FROM transactions t JOIN expenses e ON e.transaction_id = t.id JOIN users u ON u.id = t.user_id
    WHERE t.type='expense' ORDER BY t.amount DESC LIMIT 5
  `);
  if (!rows.length) return { response: `No expenses on record yet! Once your organization starts logging purchases, I'll show you the biggest ones here. 🔍`, type: 'text' };

  const top = rows[0];
  let response = `The largest expense on record is **₱${fmt(top.amount)}** for **${top.category}**${top.description ? ` (${top.description})` : ''} — logged on ${fmtDate(top.date)}.\n\n**Top ${rows.length} Largest Expenses:**\n\n`;
  rows.forEach((r, i) => {
    response += `${i + 1}. **₱${fmt(r.amount)}** — ${r.category}${r.description ? ` *(${r.description})*` : ''}\n   📅 ${fmtDate(r.date)} · 👤 ${r.user_name}\n`;
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
  if (!rows.length) return { response: `No transactions have been recorded yet! Once income or expenses are added, you'll see them here. 📝`, type: 'text' };

  let response = `Here are the **${rows.length} most recent transactions:**\n\n`;
  rows.forEach((r, i) => {
    const icon = r.type === 'income' ? '💰' : '📉';
    const detail = r.type === 'income' ? r.source : r.category;
    const action = r.type === 'income' ? 'received from' : 'spent on';
    response += `${i + 1}. ${icon} **₱${fmt(r.amount)}** ${action} **${detail || 'N/A'}**${r.description ? ` *(${r.description})*` : ''}\n   📅 ${fmtDate(r.date)} · 👤 ${r.user_name || 'System'}\n`;
  });
  return { response, type: 'table', rawData: rows };
}

async function topSpenders() {
  const [rows] = await pool.query(`
    SELECT u.name, SUM(t.amount) AS total_spent, COUNT(*) AS transaction_count
    FROM transactions t JOIN users u ON u.id = t.user_id
    WHERE t.type='expense' GROUP BY u.id, u.name ORDER BY total_spent DESC LIMIT 5
  `);
  if (!rows.length) return { response: `No one has logged any expenses yet! Once transactions are recorded, I'll rank everyone here. 👀`, type: 'text' };

  const top = rows[0];
  let response = `The top spender is **${top.name}**, who has spent **₱${fmt(top.total_spent)}** across ${top.transaction_count} transaction${top.transaction_count > 1 ? 's' : ''}!\n\n**Spending Leaderboard:**\n\n`;
  rows.forEach((r, i) => {
    const medal = ['🥇','🥈','🥉'][i] || `${i + 1}.`;
    response += `${medal} **${r.name}** — ₱${fmt(r.total_spent)} (${r.transaction_count} transaction${r.transaction_count > 1 ? 's' : ''})\n`;
  });
  return { response, type: 'table', rawData: rows };
}

async function monthlyReport(message) {
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  let month = new Date().getMonth() + 1, year = new Date().getFullYear();
  for (let i = 0; i < months.length; i++) { if (message.includes(months[i])) { month = i + 1; break; } }
  const ym = message.match(/20\d{2}/); if (ym) year = parseInt(ym[0]);

  const [rows] = await pool.query(`
    SELECT t.type, SUM(t.amount) AS total_amount, COUNT(*) AS transaction_count,
           AVG(t.amount) AS average_amount, MAX(t.amount) AS largest_transaction
    FROM transactions t
    WHERE EXTRACT(MONTH FROM t.date)=$1 AND EXTRACT(YEAR FROM t.date)=$2 GROUP BY t.type
  `, [month, year]);

  const mn = months[month-1].charAt(0).toUpperCase() + months[month-1].slice(1);
  if (!rows.length) return { response: `Nothing recorded for **${mn} ${year}** yet. Try a different month or add some transactions first! 📅`, type: 'text' };

  const incR = rows.find(r => r.type === 'income');
  const expR = rows.find(r => r.type === 'expense');
  const net = parseFloat(incR?.total_amount || 0) - parseFloat(expR?.total_amount || 0);
  let response = `Here's the financial summary for **${mn} ${year}**:\n\n`;
  if (incR) response += `💰 **Income:** ₱${fmt(incR.total_amount)} across ${incR.transaction_count} transaction${incR.transaction_count > 1 ? 's' : ''} (avg ₱${fmt(incR.average_amount)})\n`;
  if (expR) response += `📉 **Expenses:** ₱${fmt(expR.total_amount)} across ${expR.transaction_count} transaction${expR.transaction_count > 1 ? 's' : ''} (largest: ₱${fmt(expR.largest_transaction)})\n`;
  response += `\n**Net for ${mn}:** ₱${fmt(net)} ${net >= 0 ? '✅ (surplus)' : '⚠️ (deficit)'}`;
  return { response, type: 'report', rawData: rows };
}

async function incomeSources() {
  const [rows] = await pool.query(`
    SELECT i.source, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN income i ON i.transaction_id = t.id
    WHERE t.type='income' GROUP BY i.source ORDER BY total DESC
  `);
  if (!rows.length) return { response: `No income sources have been recorded yet. Once membership dues or contributions are logged, I'll list them here! 💸`, type: 'text' };

  const grandTotal = rows.reduce((s, r) => s + parseFloat(r.total), 0);
  const top = rows[0];
  let response = `Your primary income source is **${top.source}**, contributing **₱${fmt(top.total)}** to the total funds.\n\n**All Income Sources:**\n\n`;
  rows.forEach((r, i) => {
    const pct = ((parseFloat(r.total) / grandTotal) * 100).toFixed(1);
    response += `${i + 1}. **${r.source}** — ₱${fmt(r.total)} (${pct}%)\n`;
  });
  response += `\n**Total Income:** ₱${fmt(grandTotal)}`;
  return { response, type: 'table', rawData: rows };
}

async function totalIncome() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  const d = rows[0] || { total_income: 0 };
  const income = parseFloat(d.total_income || 0);
  if (income === 0) return { response: `No income has been recorded yet. Once contributions are added, I'll have real numbers for you! 💰`, type: 'text' };
  return { response: `The organization has a total recorded income of **₱${fmt(income)}**. Want me to break that down by source or month?`, type: 'text', rawData: d };
}

async function totalExpenses() {
  const [rows] = await pool.query('SELECT * FROM total_balance');
  const d = rows[0] || { total_expenses: 0 };
  const expenses = parseFloat(d.total_expenses || 0);
  if (expenses === 0) return { response: `No expenses have been logged yet — the budget is completely untouched! 😄`, type: 'text' };
  return { response: `The organization has spent a total of **₱${fmt(expenses)}** so far. Want me to break it down by category or show who's been spending?`, type: 'text', rawData: d };
}

function showHelp() {
  const response = `Hey there! 👋 I'm **BudgetBukas AI**, your organization's financial assistant. Here's what you can ask me:\n\n` +
    `💰 *"How much budget do we have?"* — Check the current balance\n` +
    `📊 *"What did we spend this month?"* — Monthly expense breakdown\n` +
    `📋 *"Where is the money going?"* — Spending by category\n` +
    `🔝 *"What are the biggest expenses?"* — Top 5 largest costs\n` +
    `📝 *"What was the last thing we bought?"* — Most recent expense\n` +
    `👥 *"Who spent the most?"* — Top spenders leaderboard\n` +
    `📄 *"Give me the report for April"* — Monthly summary\n` +
    `💵 *"Where does our income come from?"* — Income sources\n\n` +
    `I also understand Filipino! Try *"Magkano natira?"* or *"Saan napunta pera natin?"* 🇵🇭`;
  return Promise.resolve({ response, type: 'help' });
}

function fmt(n) { return parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }); }

module.exports = { handleQuery };
