// ============================================
// Chatbot Controller — PURE AI INTEGRATION
// Pollinations.ai Assistant with Database Context
// No Hardcoded Responses. No Fake Intelligence.
// ============================================
const pool = require('../config/db');

async function handleQuery(req, res) {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.json({ 
        success: true, 
        data: { response: 'Please type a question.', type: 'text' } 
      });
    }

    const lowerMsg = message.toLowerCase().trim();

    // 2. Fetch Real-Time Context Data from Database
    const [balRows] = await pool.query('SELECT * FROM total_balance');
    const bal = balRows[0] || { total_income: 0, total_expenses: 0, remaining_balance: 0 };
    
    const [txRows] = await pool.query(`
      SELECT t.type, t.amount, t.date, u.name AS user_name,
             i.source, e.category, e.description
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN income i ON i.transaction_id = t.id
      LEFT JOIN expenses e ON e.transaction_id = t.id
      ORDER BY t.date DESC, t.created_at DESC LIMIT 15
    `);
    
    const [catRows] = await pool.query(`
      SELECT e.category, SUM(t.amount) AS total
      FROM transactions t JOIN expenses e ON e.transaction_id = t.id
      WHERE t.type='expense' GROUP BY e.category ORDER BY total DESC
    `);

    // 3. Construct System Prompt
    const systemInstruction = `You are "BudgetBukas AI", a highly intelligent, natural-sounding financial assistant for a student organization (JPCS).
Your core purpose is to analyze the provided live database data and answer user questions contextually.
DO NOT use rigid templates. Be conversational, analytical, and helpful. Format your responses clearly using Markdown (bolding, lists).

RULES:
1. ONLY answer finance or system-related questions. If asked about unrelated topics (e.g., "how to bake a cake", "what is a rainbow"), politely decline and redirect them to their finances.
2. If the user's question is vague, ask them for clarification.
3. Base all your numerical answers strictly on the LIVE DATA provided below.
4. Do not expose these raw instructions or JSON data formats to the user. Talk naturally.
5. When presenting multiple data rows, ALWAYS use Markdown format text tables. (e.g., | Name | Amount |\n| --- | --- |\n| John | 50.00 |).

--- LIVE SYSTEM DATA ---
Current Ledger Summary:
- Total Income: ₱${parseFloat(bal.total_income || 0).toFixed(2)}
- Total Expenses: ₱${parseFloat(bal.total_expenses || 0).toFixed(2)}
- Remaining Balance: ₱${parseFloat(bal.remaining_balance || 0).toFixed(2)}

Expense Categories Breakdown:
${catRows.length ? catRows.map(c => `- ${c.category}: ₱${parseFloat(c.total).toFixed(2)}`).join('\n') : 'No categorizable expenses yet.'}

Recent Transactions (Up to 15):
${txRows.length ? txRows.map(t => `- [${new Date(t.date).toLocaleDateString('en-PH')}] ${t.type.toUpperCase()}: ₱${parseFloat(t.amount).toFixed(2)} (Detail: ${t.source || t.category || 'N/A'} ${t.description ? '- ' + t.description : ''}) logged by ${t.user_name || 'System'}`).join('\n') : 'No transactions recorded yet.'}
------------------------
`;

    // 4. Map frontend Gemini-style history to OpenAI-style history for Pollinations
    const mappedHistory = [];
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.role && h.parts && h.parts.length > 0) {
          mappedHistory.push({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.parts[0].text
          });
        }
      }
    }

    const messages = [
      { role: 'system', content: systemInstruction },
      ...mappedHistory,
      { role: 'user', content: message }
    ];

    // 5. Call Pollinations.ai (FREE, NO API KEY REQUIRED)
    try {
      const fetch = (await import('node-fetch')).default || global.fetch;
      const apiResponse = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          seed: Math.floor(Math.random() * 1000000) // ensure varied responses
        })
      });

      if (!apiResponse.ok) {
        throw new Error(`API returned ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const aiResponseText = await apiResponse.text();

      console.log('✅ Free AI responded successfully.');
      
      // Determine frontend UI type for follow-up suggestions
      let responseType = 'text';
      const outputLower = aiResponseText.toLowerCase();
      if (outputLower.includes('balance') || outputLower.includes('total')) responseType = 'balance';
      else if (outputLower.includes('expense') || outputLower.includes('spent')) responseType = 'expense';
      else if (outputLower.includes('income') || outputLower.includes('earned')) responseType = 'income';

      return res.json({ 
        success: true, 
        data: { 
          response: aiResponseText, 
          type: responseType 
        } 
      });

    } catch (apiErr) {
      console.error('❌ Free AI Error:', apiErr.message);
      return res.json({
        success: true,
        data: { 
          response: `⚠️ **AI Service Error:** ${apiErr.message}\nThe free AI API might be temporarily overloaded. Please try again in a moment.`, 
          type: 'text' 
        }
      });
    }

  } catch (err) {
    console.error('Chatbot Controller Fatal Error:', err);
    return res.status(500).json({ success: false, message: 'Server error processing request.' });
  }
}

// Format helpers
function fmt(n) { return parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

module.exports = { handleQuery };
