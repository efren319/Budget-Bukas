// ============================================
// Chatbot Controller — PondoSync AI
// Intelligent Conversational Financial Assistant
// ============================================
const pool = require('../config/db');
const financialService = require('../services/financialAnalysisService');
const geminiUsage = require('../services/geminiUsageService');

/**
 * Detect if text is Tagalog/Taglish
 */
function isTagalog(text) {
  if (!text) return false;
  const tagalogWords = [
    'ano', 'bakit', 'paano', 'magkano', 'ilan', 'sino', 'saan', 'kailan',
    'pera', 'gastos', 'pondo', 'natitira', 'kita', 'meron', 'wala', 'ba',
    'po', 'opo', 'naman', 'pala', 'nga', 'kamusta', 'kumusta', 'salamat',
    'lahat', 'transaksyon', 'buwan', 'ulat', 'tulong', 'kategorya', 'sige',
    'oo', 'pwede', 'pakita', 'patingin'
  ];
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/);
  return words.some(w => tagalogWords.includes(w));
}

/**
 * Extract parameters from the user's message and conversation history.
 * Ensures that categories do NOT 'stick' when the user asks for all transactions.
 */
function extractQueryParams(message, history = []) {
  const text = message.toLowerCase().trim();
  const clean = text.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const tagalog = isTagalog(text);

  // Month extraction
  const monthRegex = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/gi;
  const foundMonths = [];
  let mMatch;
  while ((mMatch = monthRegex.exec(text)) !== null) {
    const raw = mMatch[1].toLowerCase();
    const num = financialService.MONTH_NAMES[raw];
    if (num && !foundMonths.some(m => m.num === num)) {
      foundMonths.push({ name: raw, num });
    }
  }

  // 4-digit year extraction
  const yearMatches = text.match(/\b(202[0-9])\b/g);
  const years = yearMatches ? yearMatches.map(y => parseInt(y, 10)) : [];
  const defaultYear = years.length > 0 ? years[0] : 2025;

  // Quarter extraction (q1, q2, q3, q4, quarter 1, etc.)
  const quarterRegex = /\b(q[1-4]|quarter\s*[1-4])\b/gi;
  const foundQuarters = [];
  let qMatch;
  while ((qMatch = quarterRegex.exec(text)) !== null) {
    const raw = qMatch[1].toLowerCase().replace(/\s+/g, '');
    const qNum = parseInt(raw.replace('quarter', '').replace('q', ''), 10);
    if (!foundQuarters.includes(qNum)) {
      foundQuarters.push(qNum);
    }
  }

  // Category detection: ONLY detect category if explicitly mentioned in the CURRENT message
  const categoryKeywords = [
    'food & beverages', 'food and beverages', 'food', 'beverage', 'supplies',
    'transportation', 'printing', 'equipment', 'venue', 'miscellaneous', 'events'
  ];
  let explicitCategory = null;
  for (const cat of categoryKeywords) {
    if (text.includes(cat)) {
      explicitCategory = cat.includes('food') ? 'Food & Beverages' : (cat.charAt(0).toUpperCase() + cat.slice(1));
      break;
    }
  }

  // Explicit instruction for "all transactions"
  const isAskingAllTransactions = 
    text.includes('all transactions') || 
    text.includes('all the transactions') || 
    text.includes('all records') || 
    text.includes('lahat ng transaksyon') ||
    text.includes('lahat ng talaan') ||
    (text.includes('list all') && !explicitCategory);

  // If the user explicitly asks for all transactions, clear category filter
  if (isAskingAllTransactions) {
    explicitCategory = null;
  }

  // Check for conversational affirmations ("yes", "oo", "sige", "show all", "proceed")
  const affirmativeWords = [
    'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'sige', 'oo', 'opo',
    'yes please', 'show all', 'view all', 'all', 'list all', 'proceed',
    'continue', 'go ahead', 'pakita', 'pakita lahat', 'sige po', 'plz',
    'please', 'yup'
  ];
  const isAffirmative = affirmativeWords.includes(clean);

  // Context from immediate prior turn
  let lastAssistantReply = '';
  let lastUserQuery = '';
  if (Array.isArray(history) && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      const role = h.role;
      const content = (h.parts?.[0]?.text || h.content || '').toLowerCase();
      if (!lastAssistantReply && (role === 'model' || role === 'assistant')) {
        lastAssistantReply = content;
      } else if (!lastUserQuery && role === 'user') {
        lastUserQuery = content;
      }
      if (lastAssistantReply && lastUserQuery) break;
    }
  }

  // Extract prior context only if needed (for affirmative replies or follow-up questions)
  let contextMonth = null;
  let contextYear = null;
  let contextCategory = null;
  if (isAffirmative || foundMonths.length === 0) {
    let pMatch;
    while ((pMatch = monthRegex.exec(`${lastUserQuery} ${lastAssistantReply}`)) !== null) {
      const num = financialService.MONTH_NAMES[pMatch[1].toLowerCase()];
      if (num) { contextMonth = num; break; }
    }
    const pastYearMatches = `${lastUserQuery} ${lastAssistantReply}`.match(/\b(202[0-9])\b/g);
    if (pastYearMatches && pastYearMatches.length > 0) {
      contextYear = parseInt(pastYearMatches[0], 10);
    }
  }

  // Event search keyword extraction
  const eventKeywords = ['siklab', 'waves of wonder', 'debugging the future', 'pinoy big spartan', 'cics got talent', 'cics edition'];
  let matchedEvent = null;
  for (const ev of eventKeywords) {
    if (text.includes(ev)) {
      matchedEvent = ev.toUpperCase();
      break;
    }
  }

  return {
    text,
    clean,
    tagalog,
    foundMonths,
    years,
    defaultYear,
    explicitCategory,
    isAskingAllTransactions,
    isAffirmative,
    lastAssistantReply,
    lastUserQuery,
    contextMonth,
    contextYear,
    contextCategory,
    matchedEvent,
    foundQuarters
  };
}

/**
 * Identify intent and retrieve accurate PostgreSQL data
 */
async function retrieveVerifiedData(params, message) {
  const {
    text, clean, foundMonths, years, defaultYear,
    explicitCategory, isAskingAllTransactions, isAffirmative,
    lastAssistantReply, lastUserQuery, contextMonth, contextYear,
    matchedEvent, foundQuarters = []
  } = params;

  // 1. GREETING
  const greetingWords = ['hi', 'hello', 'hey', 'kamusta', 'kumusta', 'good morning', 'good afternoon', 'good evening', 'sup', 'yo', 'mabuhay'];
  if (greetingWords.includes(clean) || /^(hi|hello|hey|kamusta|kumusta|good\s*(morning|afternoon|evening)|sup|yo|mabuhay)\b/i.test(text)) {
    const summary = await financialService.getOverallSummary();
    return {
      intent: 'GREETING',
      type: 'text',
      data: summary
    };
  }

  // 2. HELP
  if (clean === 'help' || text.includes('ano pwede') || text.includes('what can you do') || text.includes('how to use') || text.includes('tulong')) {
    const summary = await financialService.getOverallSummary();
    return {
      intent: 'HELP',
      type: 'text',
      data: summary
    };
  }

  // 3. AFFIRMATIVE FOLLOW-UP ("yes", "oo", "sure", etc.)
  if (isAffirmative) {
    const targetMonth = contextMonth || 9;
    const targetYear = contextYear || defaultYear;

    // Check what the assistant offered or what was discussed
    if (lastAssistantReply.includes('highest expense') || lastAssistantReply.includes('largest expense')) {
      const highest = await financialService.getHighestExpenses(5, targetMonth, targetYear);
      return { intent: 'HIGHEST_EXPENSE', type: 'report', data: highest };
    }
    if (lastAssistantReply.includes('category') || lastAssistantReply.includes('breakdown')) {
      const catAnalysis = await financialService.getCategoryAnalysis(null);
      return { intent: 'CATEGORY_ANALYSIS', type: 'category', data: catAnalysis };
    }
    // Default follow-up: show all transactions for the discussed period
    const listData = await financialService.getTransactionList({
      category: null,
      month: targetMonth,
      year: targetYear,
      limit: 100
    });
    return { intent: 'TRANSACTION_LIST', type: 'table', data: listData };
  }

  // 4. TOP / HIGHEST / MOST EXPENSIVE / BIGGEST TRANSACTIONS
  // Uses a scoring approach to detect intent naturally rather than brittle keyword checks.
  // Matches queries like: "top 5 expenses", "highest income", "biggest transaction",
  // "pinakamalaki na gastos", "top 3 most expensive", "largest income in october", etc.
  const topRankingSignals = ['top', 'highest', 'biggest', 'largest', 'most expensive', 'most costly', 'greatest', 'pinakamalaki', 'pinakamahal', 'pinakamataas', 'pinakamataas na'];
  const typeExpenseSignals = ['expense', 'expenses', 'gastos', 'nagastos', 'bayad', 'binayad', 'cost', 'costly', 'expensive', 'purchase', 'purchases', 'spending', 'spent'];
  const typeIncomeSignals = ['income', 'incomes', 'kita', 'pumasok', 'revenue', 'earning', 'earnings', 'received', 'collection', 'sales'];
  const generalTxSignals = ['transaction', 'transactions', 'transaksyon', 'record', 'records'];

  let rankScore = 0;
  let expenseTypeScore = 0;
  let incomeTypeScore = 0;
  let generalTxScore = 0;

  for (const signal of topRankingSignals) {
    if (text.includes(signal)) rankScore += 2;
  }
  // Also check for patterns like "top 5", "top 10" even without type words
  if (/\b(top|first)\s+\d+/i.test(text)) rankScore += 3;

  for (const signal of typeExpenseSignals) {
    if (text.includes(signal)) expenseTypeScore += 2;
  }
  for (const signal of typeIncomeSignals) {
    if (text.includes(signal)) incomeTypeScore += 2;
  }
  for (const signal of generalTxSignals) {
    if (text.includes(signal)) generalTxScore += 1;
  }

  const isTopQuery = rankScore >= 2;

  if (isTopQuery) {
    let requestedLimit = 5;
    const numMatch = text.match(/\b(?:top|first)?\s*(\d{1,2})\b/i);
    if (numMatch && numMatch[1]) {
      const parsed = parseInt(numMatch[1], 10);
      // Avoid picking up year numbers like 2025
      if (parsed > 0 && parsed <= 50) requestedLimit = parsed;
    }

    const targetMonth = foundMonths.length > 0 ? foundMonths[0].num : (contextMonth || null);
    const targetYear = years.length > 0 ? years[0] : (contextYear || (targetMonth ? defaultYear : null));

    // Determine if user wants income or expense
    if (incomeTypeScore > expenseTypeScore) {
      // User is asking about top income
      const highest = await financialService.getHighestIncome(requestedLimit, targetMonth, targetYear);
      return { intent: 'HIGHEST_INCOME', type: 'report', data: highest };
    } else {
      // Default to expenses (most common ask, also when general transaction is mentioned)
      const highest = await financialService.getHighestExpenses(requestedLimit, targetMonth, targetYear);
      return { intent: 'HIGHEST_EXPENSE', type: 'report', data: highest };
    }
  }

  // 5. EXPLICIT TRANSACTION LISTING
  // e.g., "list all transactions from september 2025", "show the expenses in oct 2025", "list all supplies transactions"
  const isListQuery = 
    isAskingAllTransactions || 
    text.includes('list') || 
    text.includes('show all') || 
    text.includes('view all') || 
    text.includes('all transactions') || 
    text.includes('show the expenses') ||
    text.includes('show expenses') ||
    text.includes('show the income') ||
    text.includes('show income') ||
    text.includes('all the') || 
    text.includes('all ') || 
    text.includes('lahat') || 
    text.includes('transactions') || 
    text.includes('mga transaksyon');

  if (isListQuery && (foundMonths.length > 0 || explicitCategory || matchedEvent || text.includes('transaction') || text.includes('expense') || text.includes('gastos') || text.includes('income'))) {
    const targetMonth = foundMonths.length > 0 ? foundMonths[0].num : (contextMonth || null);
    const targetYear = years.length > 0 ? years[0] : (contextYear || defaultYear);

    let txType = null;
    if ((text.includes('expense') || text.includes('gastos') || text.includes('nagastos')) && !text.includes('income') && !text.includes('kita')) {
      txType = 'expense';
    } else if ((text.includes('income') || text.includes('kita') || text.includes('pumasok')) && !text.includes('expense') && !text.includes('gastos')) {
      txType = 'income';
    }

    const listData = await financialService.getTransactionList({
      category: isAskingAllTransactions ? null : explicitCategory,
      month: targetMonth,
      year: targetYear,
      type: txType,
      search: matchedEvent || null,
      limit: 100
    });
    return { intent: 'TRANSACTION_LIST', type: 'table', data: listData };
  }

  // 6. EVENT FINANCES
  if (matchedEvent || text.includes('event') || text.includes('summary of')) {
    const eventName = matchedEvent || text.replace(/summary of|event|financial summary of/gi, '').trim();
    if (eventName.length >= 3) {
      const eventFinances = await financialService.searchEventFinances(eventName);
      if (eventFinances.hasData) {
        return { intent: 'EVENT_SUMMARY', type: 'report', data: eventFinances };
      }
    }
  }

  // 7. PERIOD COMPARISON
  const isCompare = text.includes('compare') || 
                    text.includes('comparison') || 
                    text.includes('pagkumparahin') || 
                    text.includes('paghambingin') || 
                    text.includes('difference') || 
                    (text.includes('vs') && (foundMonths.length >= 2 || foundQuarters.length >= 2));

  // Case A: Two months mentioned (e.g. October and November)
  if (foundMonths.length >= 2 && (isCompare || text.includes('and') || text.includes('at') || text.includes('vs'))) {
    const sortedMonths = [...foundMonths].sort((a, b) => a.num - b.num);
    const yearA = years[0] || defaultYear;
    const yearB = years[1] || yearA;
    const comparison = await financialService.comparePeriods(
      { month: sortedMonths[0].num, year: yearA },
      { month: sortedMonths[1].num, year: yearB }
    );
    return { intent: 'PERIOD_COMPARISON', type: 'report', data: comparison };
  }

  // Case B: Two quarters mentioned (e.g. Q1 and Q2)
  if (foundQuarters.length >= 2 && (isCompare || text.includes('and') || text.includes('vs'))) {
    const sortedQ = [...foundQuarters].sort((a, b) => a - b);
    const yr = years[0] || defaultYear;
    const qDates = {
      1: { start: `${yr}-01-01`, end: `${yr}-03-31`, label: `Q1 ${yr}` },
      2: { start: `${yr}-04-01`, end: `${yr}-06-30`, label: `Q2 ${yr}` },
      3: { start: `${yr}-07-01`, end: `${yr}-09-30`, label: `Q3 ${yr}` },
      4: { start: `${yr}-10-01`, end: `${yr}-12-31`, label: `Q4 ${yr}` }
    };
    const qA = qDates[sortedQ[0]];
    const qB = qDates[sortedQ[1]];
    const comparison = await financialService.comparePeriods(
      { startDate: qA.start, endDate: qA.end, label: qA.label },
      { startDate: qB.start, endDate: qB.end, label: qB.label }
    );
    return { intent: 'PERIOD_COMPARISON', type: 'report', data: comparison };
  }

  // Case C: Relative comparison ("compare with previous month", "compare to last month")
  if (isCompare && (text.includes('previous month') || text.includes('last month') || text.includes('nakaraang buwan'))) {
    const targetMonth = foundMonths.length > 0 ? foundMonths[0].num : (contextMonth || 10);
    const targetYear = years.length > 0 ? years[0] : (contextYear || defaultYear);
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;

    const comparison = await financialService.comparePeriods(
      { month: prevMonth, year: prevYear },
      { month: targetMonth, year: targetYear }
    );
    return { intent: 'PERIOD_COMPARISON', type: 'report', data: comparison };
  }

  // Case D: Two years mentioned
  if (isCompare && years.length >= 2) {
    const sortedYears = [...years].sort((a, b) => a - b);
    const comparison = await financialService.comparePeriods(
      { startDate: `${sortedYears[0]}-01-01`, endDate: `${sortedYears[0]}-12-31`, label: `Year ${sortedYears[0]}` },
      { startDate: `${sortedYears[1]}-01-01`, endDate: `${sortedYears[1]}-12-31`, label: `Year ${sortedYears[1]}` }
    );
    return { intent: 'PERIOD_COMPARISON', type: 'report', data: comparison };
  }

  // 8. MONTHLY REPORT
  if (foundMonths.length === 1 || text.includes('monthly report') || text.includes('this month') || text.includes('last month')) {
    let targetMonth = foundMonths.length > 0 ? foundMonths[0].num : null;
    let targetYear = years.length > 0 ? years[0] : defaultYear;

    if (!targetMonth) {
      const now = new Date();
      targetMonth = text.includes('last month') ? (now.getMonth() === 0 ? 12 : now.getMonth()) : (now.getMonth() + 1);
      targetYear = (text.includes('last month') && now.getMonth() === 0) ? now.getFullYear() - 1 : now.getFullYear();
    }

    const monthlyData = await financialService.getMonthlyReport(targetMonth, targetYear);
    return { intent: 'MONTHLY_REPORT', type: 'report', data: monthlyData };
  }

  // 9. CATEGORY BREAKDOWN
  if (text.includes('category') || text.includes('breakdown') || text.includes('kategorya') || explicitCategory) {
    const catData = await financialService.getCategoryAnalysis(explicitCategory);
    return { intent: 'CATEGORY_ANALYSIS', type: 'category', data: catData };
  }

  // 10. OFFICER INQUIRY
  if (text.includes('president') || text.includes('treasurer') || text.includes('auditor') || text.includes('secretary') || text.includes('officer') || text.includes('opisyal') || text.includes('sino ang')) {
    const [userRows] = await pool.query(`
      SELECT name, position, role 
      FROM users 
      WHERE is_active = TRUE AND email NOT LIKE '%_deleted_%'
      ORDER BY 
        CASE 
          WHEN position ILIKE '%president%' AND position NOT ILIKE '%vice%' THEN 1
          WHEN position ILIKE '%vice president%' THEN 2
          WHEN position ILIKE '%treasurer%' THEN 3
          WHEN position ILIKE '%auditor%' THEN 4
          WHEN position ILIKE '%secretary%' THEN 5
          ELSE 6
        END,
        name ASC
    `);
    return {
      intent: 'OFFICER_INQUIRY',
      type: 'text',
      data: { officers: userRows || [] }
    };
  }

  // 11. BALANCE / LEDGER INQUIRY
  const balanceKeywords = [
    'balance', 'pondo', 'funds', 'natitira', 'kasalukuyan', 'current balance',
    'financial status', 'status', 'summary', 'overall', 'pera', 'magkano',
    'how much', 'money', 'kabuuang pera', 'kaban', 'net cash', 'total balance',
    'remaining', 'overview', 'state'
  ];
  const isBalanceQuery = balanceKeywords.some(kw => text.includes(kw));

  if (isBalanceQuery) {
    const summary = await financialService.getOverallSummary();
    return {
      intent: 'BALANCE_INQUIRY',
      type: 'balance',
      data: summary
    };
  }

  // 12. UNKNOWN / UNSUPPORTED QUERY FOR OFFLINE LEDGER
  return {
    intent: 'UNKNOWN_QUERY',
    type: 'text',
    data: {
      originalQuery: message,
      text,
      clean,
      foundMonths,
      years,
      explicitCategory
    }
  };
}

/**
 * Generate smart, relevant example prompts when offline ledger cannot answer a query
 * Uses keyword clues to say "Do you mean..." with close financial prompts
 */
function generateContextualSuggestions(message, text) {
  const t = (text || message || '').toLowerCase();
  const suggestions = [];

  // Month-related clues (e.g. user typed "october", "november", "december")
  const months = [
    { name: 'January', match: ['jan', 'january'] },
    { name: 'February', match: ['feb', 'february'] },
    { name: 'March', match: ['mar', 'march'] },
    { name: 'April', match: ['apr', 'april'] },
    { name: 'May', match: ['may'] },
    { name: 'June', match: ['jun', 'june'] },
    { name: 'July', match: ['jul', 'july'] },
    { name: 'August', match: ['aug', 'august'] },
    { name: 'September', match: ['sep', 'september'] },
    { name: 'October', match: ['oct', 'october'] },
    { name: 'November', match: ['nov', 'november'] },
    { name: 'December', match: ['dec', 'december'] }
  ];
  const matchedMonth = months.find(m => m.match.some(kw => t.includes(kw)));
  if (matchedMonth) {
    suggestions.push(`Monthly report for ${matchedMonth.name} 2025`);
    suggestions.push(`List all transactions in ${matchedMonth.name} 2025`);
    suggestions.push(`Highest expenses in ${matchedMonth.name} 2025`);
    suggestions.push(`Compare ${matchedMonth.name} with previous month`);
    return suggestions.slice(0, 4);
  }

  // Expense-related clues
  if (t.includes('expense') || t.includes('gastos') || t.includes('cost') || t.includes('spending') || t.includes('bili') || t.includes('buy') || t.includes('purchase')) {
    suggestions.push('What was our highest expense?');
    suggestions.push('Expenses by category');
    suggestions.push('Top 5 expenses');
    suggestions.push('List all transactions in October 2025');
    return suggestions;
  }

  // Income / Collection-related clues
  if (t.includes('income') || t.includes('kita') || t.includes('collection') || t.includes('revenue') || t.includes('sales') || t.includes('pumasok') || t.includes('fee')) {
    suggestions.push('Top 5 income sources');
    suggestions.push('List all income records');
    suggestions.push('Monthly income vs expenses comparison');
    suggestions.push('What is our current balance?');
    return suggestions;
  }

  // Comparison-related clues
  if (t.includes('compare') || t.includes('vs') || t.includes('versus') || t.includes('difference') || t.includes('pagkumpara') || t.includes('hambing')) {
    suggestions.push('Compare October and November 2025');
    suggestions.push('Compare Q3 and Q4 2025');
    suggestions.push('Compare with previous month');
    suggestions.push('What is our current balance?');
    return suggestions;
  }

  // Category-related clues
  if (t.includes('category') || t.includes('kategorya') || t.includes('supplies') || t.includes('food') || t.includes('equipment') || t.includes('transportation') || t.includes('breakdown')) {
    suggestions.push('Expenses by category');
    suggestions.push('Category breakdown of Supplies');
    suggestions.push('Category breakdown of Food & Beverages');
    suggestions.push('Monthly report for October 2025');
    return suggestions;
  }

  // Officer / People-related clues
  if (t.includes('officer') || t.includes('opisyal') || t.includes('sino') || t.includes('who') || t.includes('president') || t.includes('treasurer') || t.includes('auditor') || t.includes('secretary')) {
    suggestions.push('Who are the current JPCS officers?');
    suggestions.push('Who is the JPCS President?');
    suggestions.push('Who is the JPCS Treasurer?');
    suggestions.push('What is our current balance?');
    return suggestions;
  }

  // Event-related clues
  if (t.includes('event') || t.includes('activity') || t.includes('siklab') || t.includes('waves') || t.includes('program')) {
    suggestions.push('Financial summary of SIKLAB');
    suggestions.push('Financial summary of Waves of Wonder');
    suggestions.push('Expenses by category');
    suggestions.push('What is our current balance?');
    return suggestions;
  }

  // Balance-related clues
  if (t.includes('balance') || t.includes('pondo') || t.includes('pera') || t.includes('natitira') || t.includes('magkano') || t.includes('how much') || t.includes('funds')) {
    suggestions.push('What is our current balance?');
    suggestions.push('Monthly report for October 2025');
    suggestions.push('What was our highest expense?');
    suggestions.push('Expenses by category');
    return suggestions;
  }

  // General fallback close suggestions
  return [
    'What is our current balance?',
    'Monthly report for October 2025',
    'Compare October and November 2025',
    'What was our highest expense?'
  ];
}

/**
 * Build dynamic, relevant suggestion chips based on retrieved data
 */
function getDynamicSuggestions(intent, verifiedResult) {
  if (intent === 'UNKNOWN_QUERY') {
    const rawQ = verifiedResult?.data?.originalQuery || '';
    const textQ = verifiedResult?.data?.text || rawQ;
    return generateContextualSuggestions(rawQ, textQ);
  }
  if (intent === 'GREETING' || intent === 'HELP') {
    return [
      'What is our current balance?',
      'Monthly report for October 2025',
      'Compare October and November 2025',
      'What was our highest expense?'
    ];
  }
  if (intent === 'TRANSACTION_LIST') {
    return ['Monthly report for October 2025', 'Expenses by category', 'What was our highest expense?', 'Total balance'];
  }
  if (intent === 'PERIOD_COMPARISON') {
    const bLabel = verifiedResult?.data?.periodB?.label || 'Current Period';
    return [
      `Monthly report for ${bLabel}`,
      `Expenses by category in ${bLabel}`,
      `What is our total balance?`,
      `What was our highest expense?`
    ];
  }
  if (intent === 'MONTHLY_REPORT') {
    return ['Compare with previous month', 'Expenses by category', 'What was our highest expense?', 'List all transactions'];
  }
  if (intent === 'CATEGORY_ANALYSIS') {
    return ['Highest expenses', 'Monthly report for October 2025', 'Total balance', 'List all transactions'];
  }
  if (intent === 'HIGHEST_EXPENSE') {
    return ['Top 5 income', 'Expenses by category', 'Monthly report for October 2025', 'Total balance'];
  }
  if (intent === 'HIGHEST_INCOME') {
    return ['Top 5 expenses', 'Expenses by category', 'Monthly report for October 2025', 'Total balance'];
  }
  if (intent === 'EVENT_SUMMARY') {
    return ['Summary of Waves of Wonder', 'Summary of SIKLAB', 'Expenses by category', 'Total balance'];
  }
  if (intent === 'OFFICER_INQUIRY') {
    return ['What is our total balance?', 'Monthly report for October 2025', 'Expenses by category'];
  }
  if (intent === 'BALANCE_INQUIRY') {
    return ['Monthly report for October 2025', 'Expenses by category', 'What was our highest expense?', 'Compare October and November 2025'];
  }
  return ['Monthly report for October 2025', 'Expenses by category', 'Summary of SIKLAB', 'What was our highest expense?'];
}

/**
 * Handle incoming chatbot query
 */
async function handleQuery(req, res) {
  try {
    const { message, history = [], formatPrefs = {} } = req.body;

    if (!message || !message.trim()) {
      return res.json({
        success: true,
        data: {
          response: 'Please type a question or select one of the suggested prompts.',
          type: 'text',
          source: 'offline',
          engine: 'PondoSync Verified Ledger Engine'
        }
      });
    }

    // 1. Extract query parameters
    const queryParams = extractQueryParams(message, history);

    // 2. Fetch verified data from PostgreSQL
    let verifiedResult;
    try {
      verifiedResult = await retrieveVerifiedData(queryParams, message);
    } catch (dbErr) {
      console.error('[Chatbot] Database retrieval error:', dbErr.message);
      const fallbackSummary = await financialService.getOverallSummary();
      verifiedResult = { intent: 'BALANCE_INQUIRY', type: 'balance', data: fallbackSummary };
    }

    const { intent, type: responseType, data: retrievedData } = verifiedResult;
    const dynamicSuggestions = getDynamicSuggestions(intent, verifiedResult);

    // 3. Format Preferences Context
    const formatInstructions = [
      formatPrefs.table !== false 
        ? '• Tables ENABLED: Present multiple records and structured metrics in clean markdown tables.' 
        : '• Tables DISABLED: DO NOT use markdown tables (| ... |). Instead, format data into bullet points, numbered lists, or descriptive paragraphs.',
      formatPrefs.list !== false 
        ? '• Lists ENABLED: Use clean bullet points (•) where appropriate.' 
        : '• Lists DISABLED: DO NOT use bullet points or numbered lists. Use cohesive sentences and paragraphs.',
      formatPrefs.graph 
        ? '• Graph ENABLED: Visual charts are automatically generated by the web interface directly from your markdown tables. DO NOT output raw JSON, code blocks, or chart configuration code. Simply present the data in a clean markdown table.' 
        : '• Graph DISABLED: The user has turned off graphs. Do not suggest or format for charts.'
    ].join('\n');

    // Language setting
    const languageInstruction = queryParams.tagalog
      ? 'The user is speaking in Tagalog or Taglish. Respond in natural, warm, and professional Tagalog/Taglish.'
      : 'Respond in professional, clean, conversational English.';

    // 4. Construct Gemini system instruction
    const systemPrompt = `You are "PondoSync AI", the friendly, intelligent financial transparency assistant for the Junior Philippine Computer Society (JPCS) at BatStateU Lipa.

CONVERSATIONAL RULES:
1. Provide a direct, natural, conversational response like ChatGPT. Avoid stiff, canned, or robotic templates.
2. Ground all numbers in the verified database data provided below. Do not invent amounts or transactions.
3. When listing transactions, list ALL matching records provided in the dataset without truncating.
4. Format monetary values with the ₱ symbol (e.g. ₱1,100.00).
5. When presenting tables of transactions, always use the following 5-column structure (do NOT include a Type column):
   | Date | Description | Category | Amount | Recorded By |
   - For Date, strictly preserve the exact date string provided in the dataset (YYYY-MM-DD, e.g. 2025-10-02). Do NOT alter the date, shift it by timezones, or change it by a day.
   - Do NOT include a 'Type' column. Income vs Expense is identified by the Amount color and sign.
   - For the Amount column, prefix income amounts with '+' (e.g. +₱911.00) and expense amounts with '-' (e.g. -₱69.00).
   - For Category, use the real category (e.g. 'Booth Income', 'Supplies', 'Food & Beverages', 'Transportation', 'Membership Fees'). Never label category simply as 'Income'.
   - For Description, always use the real specific item or transaction description (e.g. 'Bond paper 500s', 'Epson black ink', 'Marker pack'), NEVER repeat the category name in the description. This ensures users and charts can distinguish individual items clearly.
   - For Recorded By, ALWAYS output the exact officer name provided in the dataset (from 'recordedBy', 'user_name', or 'logger'). For example, if the record indicates "Janelle P. Salva", output "Janelle P. Salva". NEVER write "Not specified" or "Unknown" when an officer name is provided in the data.
6. ${languageInstruction}
7. CRITICAL: NEVER output JSON, code blocks, or markdown backticks for code (no \`\`\`json, \`\`\`javascript, \`\`\`chart, etc.). The frontend automatically creates all charts directly from standard markdown tables. Present your entire response as conversational text, bullet lists, and standard markdown tables. Outputting code blocks or JSON is strictly prohibited.

FORMATTING PREFERENCES:
${formatInstructions}

${intent === 'HIGHEST_INCOME' ? `CRITICAL INTENT CONTEXT:
The user asked for the HIGHEST / TOP INCOME records. The dataset below contains ONLY INCOME records — there are ZERO expense records in this dataset.
- ALL amounts MUST use the '+' prefix (e.g. +₱5,000.00). Do NOT use '-' prefix on ANY record.
- Each record's "type" field is "income" — respect this.
- Present them as the top income sources, not expenses.` : ''}
${intent === 'HIGHEST_EXPENSE' ? `CRITICAL INTENT CONTEXT:
The user asked for the HIGHEST / TOP EXPENSE records. The dataset below contains ONLY EXPENSE records.
- ALL amounts MUST use the '-' prefix (e.g. -₱5,000.00). Do NOT use '+' prefix on ANY record.` : ''}
${intent === 'PERIOD_COMPARISON' ? `CRITICAL INSTRUCTIONS FOR FINANCIAL COMPARISON DASHBOARD:
You are generating a professional financial comparison dashboard between ${retrievedData?.periodA?.label || 'Previous Period'} and ${retrievedData?.periodB?.label || 'Current Period'}.
You MUST structure your response with these exact markdown sections:

### 📊 Financial Overview
Output this exact 3-column table comparing the two periods with transaction counts so the UI renders dedicated comparative cards:
| Metric | ${retrievedData?.periodA?.label} | ${retrievedData?.periodB?.label} |
| :--- | :---: | :---: |
| **Net Cash Flow** | **${retrievedData?.periodA?.netFormatted}** (*${retrievedData?.periodA?.netStatus}*) | **${retrievedData?.periodB?.netFormatted}** (*${retrievedData?.periodB?.netStatus}*) |
| **Total Income** | ${retrievedData?.periodA?.incomeFormatted} (${retrievedData?.periodA?.incomeCount || 0} transactions) | ${retrievedData?.periodB?.incomeFormatted} (${retrievedData?.periodB?.incomeCount || 0} transactions) |
| **Total Expenses** | ${retrievedData?.periodA?.expensesFormatted} (${retrievedData?.periodA?.expenseCount || 0} transactions) | ${retrievedData?.periodB?.expensesFormatted} (${retrievedData?.periodB?.expenseCount || 0} transactions) |

### ⚖️ Income and Expenses Comparison
Output this exact 5-column table comparing the two periods (use ONLY the period name e.g. '${retrievedData?.periodA?.label}' and '${retrievedData?.periodB?.label}' as headers, DO NOT add 'Previous Period' or 'Current Period'):
| Financial Metric | ${retrievedData?.periodA?.label} | ${retrievedData?.periodB?.label} | Difference (₱) | Percentage Change |
| :--- | :---: | :---: | :---: | :---: |
| **Total Income** | ${retrievedData?.periodA?.incomeFormatted} | ${retrievedData?.periodB?.incomeFormatted} | ${retrievedData?.diff?.incomeDiffFormatted} | ${retrievedData?.diff?.incomePctChange} |
| **Total Expenses** | ${retrievedData?.periodA?.expensesFormatted} | ${retrievedData?.periodB?.expensesFormatted} | ${retrievedData?.diff?.expenseDiffFormatted} | ${retrievedData?.diff?.expensePctChange} |
| **Net Cash Flow** | ${retrievedData?.periodA?.netFormatted} | ${retrievedData?.periodB?.netFormatted} | ${retrievedData?.diff?.netDiffFormatted} | ${retrievedData?.diff?.netPctChange} |
| **Expense-to-Income Ratio** | ${retrievedData?.periodA?.ratioFormatted} | ${retrievedData?.periodB?.ratioFormatted} | ${retrievedData?.diff?.ratioDiffFormatted} | ${retrievedData?.diff?.ratioPctChange} |

### 🔍 Key Findings
Provide concise, data-based observations strictly grounded in the calculated numbers above:
- **Income Growth/Decline:** State whether income grew or declined by ${retrievedData?.diff?.incomeDiffFormatted} (${retrievedData?.diff?.incomePctChange}).
- **Expense Trend:** State whether expenses increased or reduced by ${retrievedData?.diff?.expenseDiffFormatted} (${retrievedData?.diff?.expensePctChange}).
- **Changes in Net Cash Flow:** Explain the shift in net cash flow from ${retrievedData?.periodA?.netFormatted} to ${retrievedData?.periodB?.netFormatted} (${retrievedData?.diff?.netDiffFormatted}).
- **Expense-to-Income Ratio:** Note whether spending efficiency improved or worsened by ${retrievedData?.diff?.ratioDiffFormatted} (from ${retrievedData?.periodA?.ratioFormatted} to ${retrievedData?.periodB?.ratioFormatted}).
- **Largest Drivers:** Mention the largest expense categories or key income sources from each period.
- **Financial Risk / Unusual Spending:** Note any financial risks, deficit trends, or significant variance.
- **Conclusion:** Conclude with 1-2 clear sentences explaining which period performed better financially and why (${retrievedData?.diff?.betterPeriod || ''}).

### 💡 Recommendations
Provide 2-3 relevant, actionable suggestions based on the results (e.g. reviewing rising cost centers, setting spending thresholds, or optimizing income collection timing).

CRITICAL: Do NOT invent or recalculate any numbers. Use the exact values provided in VERIFIED DATABASE DATA.` : ''}
${intent === 'UNKNOWN_QUERY' ? `CRITICAL CONTEXT:
The user sent a message that did not match a specific database record or financial filter: "${message}".
- If this is a friendly greeting or small talk, respond warmly and conversationally as PondoSync AI, explaining what JPCS financial transparency information you can provide.
- If this is a question about JPCS finances but ambiguous, explain what information is available and suggest specific queries (e.g. current balance, monthly reports, expenses by category, period comparisons).
- If the user is asking an off-topic question, answer briefly and politely, and gently remind them that your primary specialty is JPCS financial transparency.
- NEVER invent fake transaction records, fake dates, or hallucinate financial numbers.` : ''}
${retrievedData?.hasData === false ? `CRITICAL CONTEXT:
The requested period has no recorded transactions in the database. You MUST explicitly state: "No recorded transactions found for ${retrievedData.period || 'the requested period'}." Do not invent or estimate any transactions.` : ''}

VERIFIED DATABASE DATA:
${intent === 'UNKNOWN_QUERY' ? JSON.stringify({
  status: 'No specific database transaction matched this query',
  suggestedLedgerQueries: [
    'What is our current balance?',
    'Monthly report for October 2025',
    'Compare October and November 2025',
    'What was our highest expense?',
    'Expenses by category'
  ]
}, null, 2) : JSON.stringify(retrievedData, null, 2)}`;

    // Prepare multi-turn history for AI
    const mappedHistory = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        if (h.role && h.parts && h.parts.length > 0) {
          mappedHistory.push({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.parts[0].text
          });
        }
      }
    }

    // If client requested offline only mode, produce verified report directly
    if (req.body.mode === 'offline_only' || req.body.forceOffline) {
      const offlineReply = buildOfflineReport(intent, retrievedData, queryParams, formatPrefs);
      return res.json({
        success: true,
        data: {
          status: 'ready',
          response: offlineReply,
          type: responseType,
          source: 'offline',
          engine: 'PondoSync Verified Ledger Engine',
          userQuery: message,
          suggestions: dynamicSuggestions
        }
      });
    }

    // 5. Call Gemini when configured and no verified quota is at the 5% threshold.
    let finalResponseText = '';
    let isAiSuccess = false;
    let offlineReason = null;
    let aiEngineName = 'PondoSync Verified Ledger Engine';
    let retryCooldown = null;
    const geminiModels = geminiUsage.getModelCandidates();
    let gModel = geminiModels[0];
    let usageBeforeRequest = await geminiUsage.getUsageStatus(gModel);

    if (!process.env.GEMINI_API_KEY) {
      offlineReason = 'api_key_missing';
    } else if (usageBeforeRequest.blocked) {
      // Enforced on the server even if a client bypasses or has stale UI state.
      offlineReason = 'quota_low';
    } else {
      const geminiContents = mappedHistory.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      }));
      geminiContents.push({ role: 'user', parts: [{ text: message }] });

      let madeGeminiAttempt = false;
      for (let modelIndex = 0; modelIndex < geminiModels.length; modelIndex += 1) {
        gModel = geminiModels[modelIndex];
        const modelUsage = modelIndex === 0
          ? usageBeforeRequest
          : await geminiUsage.getUsageStatus(gModel);
        usageBeforeRequest = modelUsage;

        // The server checks each model before sending it to Google, including
        // models reached through the Gemini-only fallback chain.
        if (modelUsage.blocked) {
          offlineReason = 'quota_low';
          break;
        }

        let geminiTimeout;
        let tryNextModel = false;
        madeGeminiAttempt = true;
        try {
          console.log(`[Chatbot] Calling Gemini API (${gModel})...`);
          const geminiController = new AbortController();
          geminiTimeout = setTimeout(() => geminiController.abort(), 20000);
          geminiUsage.recordGeminiAttempt(gModel);

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gModel)}:generateContent`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
              },
              body: JSON.stringify({
                contents: geminiContents,
                systemInstruction: { parts: [{ text: systemPrompt }] }
              }),
              signal: geminiController.signal
            }
          );

          const geminiJson = await geminiRes.json().catch(() => ({}));
          if (geminiRes.ok) {
            const gText = geminiJson?.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
            if (gText && gText.trim().length > 15) {
              finalResponseText = gText.trim();
              isAiSuccess = true;
              const actualGeminiModel = geminiJson.modelVersion || gModel;
              aiEngineName = `PondoSync AI (${actualGeminiModel})`;
              geminiUsage.recordGeminiSuccess(actualGeminiModel, geminiJson.usageMetadata || {});
              console.log(`[Chatbot] Gemini AI responded successfully using ${actualGeminiModel}.`);
            } else {
              offlineReason = 'empty_response';
              geminiUsage.recordGeminiFailure(geminiRes.status, 'error', 'Gemini returned an empty response.');
            }
          } else {
            const errorDetail = geminiJson?.error?.message || geminiJson?.error?.status || '';
            const rateLimited = geminiRes.status === 429;
            offlineReason = rateLimited ? 'rate_limit' : 'model_unavailable';
            geminiUsage.recordGeminiFailure(
              geminiRes.status,
              rateLimited ? 'rate_limited' : 'error',
              errorDetail
            );
            console.warn(`[Chatbot] Gemini API (${gModel}) returned status ${geminiRes.status}.`);
            // A 429 is project/model quota feedback; don't hop models to evade
            // that response. Unavailable or overloaded models may fall through.
            tryNextModel = !rateLimited && (geminiRes.status === 404 || geminiRes.status === 503);
          }
        } catch (gErr) {
          offlineReason = gErr.name === 'AbortError' ? 'timeout' : 'network_error';
          geminiUsage.recordGeminiFailure(null, 'error', gErr.message);
          console.warn(`[Chatbot] Gemini API (${gModel}) request failed:`, gErr.message);
          tryNextModel = true;
        } finally {
          if (geminiTimeout) clearTimeout(geminiTimeout);
        }

        if (isAiSuccess || !tryNextModel || modelIndex === geminiModels.length - 1) break;
      }

      if (madeGeminiAttempt) {
        geminiUsage.invalidateQuotaCache();
        // Refresh quota data after requests; the response path does not wait
        // on monitoring latency, and the usage endpoint can join the refresh.
        geminiUsage.getUsageStatus().catch(error => {
          console.warn('[Gemini Usage] Refresh after request failed:', error.message);
        });
      }
    }

    // 7. If online AI succeeded, return the AI response!
    if (isAiSuccess && finalResponseText) {
      // Strip any stray JSON code blocks or chart configuration objects if hallucinated by the model
      finalResponseText = finalResponseText
        .replace(/```(?:json|javascript|js)?\s*\{[\s\S]*?chartType[\s\S]*?\}\s*```/gi, '')
        .replace(/```(?:json)\s*[\{\[][\s\S]*?[\}\]]\s*```/gi, '')
        .trim();

      if (retrievedData && retrievedData.hasData === false) {
        if (!finalResponseText.includes('No recorded transactions found')) {
          finalResponseText = `No recorded transactions found for **${retrievedData.period || 'the requested period'}**.\n\n` + finalResponseText;
        }
      }

      return res.json({
        success: true,
        data: {
          status: 'ready',
          response: finalResponseText,
          type: responseType,
          source: 'ai',
          engine: aiEngineName,
          reason: null,
          canRetryAI: false,
          model: gModel,
          usageStatus: usageBeforeRequest,
          userQuery: message,
          suggestions: dynamicSuggestions
        }
      });
    }

    // 8. Offline fallback: Generate a clean, accurate report from the verified database data
    const offlineReply = buildOfflineReport(intent, retrievedData, queryParams, formatPrefs);
    return res.json({
      success: true,
      data: {
        status: 'ready',
        response: offlineReply,
        type: responseType,
        source: 'offline',
        engine: 'PondoSync Verified Ledger Engine',
        reason: offlineReason,
        canRetryAI: offlineReason !== 'quota_low',
        retryCooldown: retryCooldown,
        quotaWarning: usageBeforeRequest.warning,
        model: gModel,
        usageStatus: usageBeforeRequest,
        userQuery: message,
        suggestions: dynamicSuggestions
      }
    });

  } catch (err) {
    console.error('Chatbot Controller Error:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while analyzing financial records.'
    });
  }
}

async function handleUsageStatus(req, res) {
  try {
    const status = await geminiUsage.getUsageStatus();
    return res.json({ success: true, data: status });
  } catch (error) {
    console.error('[Chatbot] Gemini usage status error:', error.message);
    return res.status(200).json({
      success: true,
      data: {
        currentModel: geminiUsage.getConfiguredModel(),
        availability: process.env.GEMINI_API_KEY ? 'configured' : 'unavailable',
        availabilityMessage: 'Gemini quota monitoring is unavailable.',
        blocked: false,
        warning: null,
        quota: { availability: 'unavailable', reason: 'Quota monitoring data could not be retrieved.', metrics: [], percentUsed: null, percentRemaining: null },
        backendObserved: geminiUsage.getObservedUsage(),
        refreshedAt: new Date().toISOString()
      }
    });
  }
}

/**
 * Clean offline report formatter for when online AI is unavailable
 */
function buildOfflineReport(intent, data, params, formatPrefs = {}) {
  if (!data) return 'No financial data could be retrieved from the database.';

  let reportText = '';

  // Helper note for when graph preference is enabled on non-chartable queries
  const noGraphNote = formatPrefs && formatPrefs.graph
    ? '\n\n*Note on Visual Graph: A chart cannot be generated for this inquiry because the data contains only a single summary figure or non-numeric information without comparative categories or time-series points to plot.*'
    : '';

  // Unknown / Unsupported query in Offline Ledger Mode
  if (intent === 'UNKNOWN_QUERY') {
    const rawQ = (data && data.originalQuery) || (params && params.clean) || 'your inquiry';
    const cleanQ = String(rawQ).replace(/<[^>]*>/g, '').trim();
    const suggestions = generateContextualSuggestions(cleanQ, (data && data.text) || cleanQ);
    const suggestionList = suggestions.map(s => `• *"${s}"*`).join('\n');

    return `I am currently operating in **Offline Ledger Mode** and can only execute verified financial queries directly against the JPCS database records.\n\n` +
           `I couldn't process or find a matching financial query for:\n` +
           `> *"${cleanQ}"*\n\n` +
           `**Do you mean one of these?**\n` +
           `${suggestionList}\n\n` +
           `*💡 Tip: Toggle **AI Mode** to **ON** in the top bar to ask open-ended questions or converse naturally with PondoSync AI.*` +
           noGraphNote;
  }

  // Greeting in Offline Mode
  if (intent === 'GREETING') {
    return `Hello! I am operating in **Offline Ledger Mode**, connected directly to verified JPCS database records.\n\n` +
           `How can I help you with our organization's finances today?\n\n` +
           `**You can ask me questions like:**\n` +
           `• *"What is our current balance?"*\n` +
           `• *"Monthly report for October 2025"*\n` +
           `• *"Compare October and November 2025"*\n` +
           `• *"Top 5 highest expenses"*\n` +
           `• *"Expenses by category"*\n\n` +
           `*💡 Tip: Toggle **AI Mode** to **ON** in the top bar to chat freely with PondoSync AI.*`;
  }

  // Help in Offline Mode
  if (intent === 'HELP') {
    return `### 📖 Offline Ledger Mode Guide\n\n` +
           `In **Offline Ledger Mode**, queries are matched directly against verified financial records in the PostgreSQL database without using an external AI model.\n\n` +
           `**Supported Queries & Commands:**\n` +
           `• **Current Funds / Balance:** *"What is our current balance?"* or *"Magkano natitirang pondo?"*\n` +
           `• **Monthly Breakdown:** *"Monthly report for October 2025"*\n` +
           `• **Period Comparisons:** *"Compare October and November 2025"* or *"Compare Q3 and Q4"*\n` +
           `• **Ranked Expenses / Income:** *"Top 5 expenses"* or *"Highest income"*\n` +
           `• **Category Breakdown:** *"Expenses by category"* or *"Breakdown of Supplies"*\n` +
           `• **Transaction Records:** *"List all transactions in October 2025"*\n` +
           `• **Event Ledgers:** *"Summary of SIKLAB"* or *"Summary of Waves of Wonder"*\n` +
           `• **Officers:** *"Who are the current JPCS officers?"*\n\n` +
           `*💡 Tip: Toggle **AI Mode** to **ON** for open conversational queries.*`;
  }

  // Period comparison
  if (intent === 'PERIOD_COMPARISON' && data.periodA && data.periodB) {
    if (!data.periodA.hasData && !data.periodB.hasData) {
      return `No financial records were found for either **${data.periodA.label}** or **${data.periodB.label}** in the database.`;
    }

    const overviewTable = 
      `### 📊 Financial Overview\n\n` +
      `| Metric | ${data.periodA.label} | ${data.periodB.label} |\n` +
      `| :--- | :---: | :---: |\n` +
      `| **Net Cash Flow** | **${data.periodA.netFormatted}** (*${data.periodA.netStatus}*) | **${data.periodB.netFormatted}** (*${data.periodB.netStatus}*) |\n` +
      `| **Total Income** | <span style="color:#22c55e; font-weight:700;">${data.periodA.incomeFormatted}</span> (${data.periodA.incomeCount || 0} transactions) | <span style="color:#22c55e; font-weight:700;">${data.periodB.incomeFormatted}</span> (${data.periodB.incomeCount || 0} transactions) |\n` +
      `| **Total Expenses** | <span style="color:#ef4444; font-weight:700;">${data.periodA.expensesFormatted}</span> (${data.periodA.expenseCount || 0} transactions) | <span style="color:#ef4444; font-weight:700;">${data.periodB.expensesFormatted}</span> (${data.periodB.expenseCount || 0} transactions) |\n\n`;

    const compTable =
      `### ⚖️ Income and Expenses Comparison\n\n` +
      `| Financial Metric | ${data.periodA.label} | ${data.periodB.label} | Difference (₱) | Percentage Change |\n` +
      `| :--- | :---: | :---: | :---: | :---: |\n` +
      `| **Total Income** | ${data.periodA.incomeFormatted} | ${data.periodB.incomeFormatted} | **${data.diff.incomeDiffFormatted}** | **${data.diff.incomePctChange}** |\n` +
      `| **Total Expenses** | ${data.periodA.expensesFormatted} | ${data.periodB.expensesFormatted} | **${data.diff.expenseDiffFormatted}** | **${data.diff.expensePctChange}** |\n` +
      `| **Net Cash Flow** | **${data.periodA.netFormatted}** | **${data.periodB.netFormatted}** | **${data.diff.netDiffFormatted}** | **${data.diff.netPctChange}** |\n` +
      `| **Expense-to-Income Ratio** | ${data.periodA.ratioFormatted} | ${data.periodB.ratioFormatted} | **${data.diff.ratioDiffFormatted}** | **${data.diff.ratioPctChange}** |\n\n`;

    return overviewTable + compTable + `All figures calculated directly from the PostgreSQL general ledger.`;
  }

  // Highest expenses
  if (intent === 'HIGHEST_EXPENSE' && data.expenses) {
    let table = '| Date | Description | Category | Amount | Recorded By |\n| :--- | :--- | :--- | :---: | :--- |\n';
    for (const exp of data.expenses) {
      table += `| ${exp.date} | ${exp.description} | ${exp.category} | **-${exp.amountFormatted}** | ${exp.recordedBy || exp.logger || 'Officer'} |\n`;
    }
    reportText = `Here are the highest recorded expenses for **${data.filter || 'All Time'}**:\n\n${table}\nAll records verified from the PostgreSQL database.`;
    if (data.expenses.length <= 1) {
      reportText += noGraphNote;
    }
    return reportText;
  }

  // Highest income
  if (intent === 'HIGHEST_INCOME' && data.incomeRecords) {
    let table = '| Date | Description | Category | Amount | Recorded By |\n| :--- | :--- | :--- | :---: | :--- |\n';
    for (const inc of data.incomeRecords) {
      table += `| ${inc.date} | ${inc.description} | ${inc.category} | **+${inc.amountFormatted}** | ${inc.recordedBy || inc.logger || 'Officer'} |\n`;
    }
    reportText = `Here are the highest recorded income for **${data.filter || 'All Time'}**:\n\n${table}\nAll records verified from the PostgreSQL database.`;
    if (data.incomeRecords.length <= 1) {
      reportText += noGraphNote;
    }
    return reportText;
  }

  // Transaction list
  if (intent === 'TRANSACTION_LIST' && data.transactions) {
    const title = data.category ? `${data.category} Transactions` : 'All Transactions';
    const period = data.monthName && data.year ? `${data.monthName} ${data.year}` : (data.year ? `Year ${data.year}` : 'Recorded Period');
    
    let table = '| Date | Description | Category | Amount | Recorded By |\n| :--- | :--- | :--- | :---: | :--- |\n';
    for (const tx of data.transactions) {
      const isInc = tx.type === 'income';
      const prefix = isInc ? '+' : '-';
      table += `| ${tx.date} | ${tx.description} | ${tx.category} | **${prefix}${tx.amountFormatted}** | ${tx.recordedBy || tx.logger || 'Officer'} |\n`;
    }

    reportText = `Here are the recorded transactions for **${period}**:\n\n` +
                 `• **Total Recorded Amount:** **${data.totalAmountFormatted}**\n` +
                 `• **Total Transactions:** **${data.count}**\n\n` +
                 `${table}\n` +
                 `All records verified directly from the PostgreSQL general ledger.`;
    
    if (data.transactions.length <= 1) {
      reportText += noGraphNote;
    }
    return reportText;
  }

  // Category analysis
  if (intent === 'CATEGORY_ANALYSIS' && data.categories) {
    if (data.categories.length === 1 && data.topTransactions && data.topTransactions.length > 0) {
      const cat = data.categories[0];
      let itemTable = '| Date | Description | Category | Amount | Recorded By |\n| :--- | :--- | :--- | :---: | :--- |\n';
      for (const tx of data.topTransactions) {
        itemTable += `| ${tx.date} | ${tx.description} | ${cat.category} | **-${tx.amountFormatted}** | ${tx.recordedBy || tx.loggedBy || 'Officer'} |\n`;
      }
      return `### Category Expense: ${cat.category}\n\n` +
             `• **Total Expenses:** **${cat.totalFormatted}**\n` +
             `• **Transaction Count:** **${cat.count}**\n\n` +
             `#### Breakdown of Items in ${cat.category}\n\n` +
             `${itemTable}\n` +
             `All records verified from the PostgreSQL database.`;
    }

    let catTable = '| Category | Total Amount | % of Expenses | Transactions |\n| :--- | :--- | :--- | :--- |\n';
    for (const c of data.categories) {
      catTable += `| **${c.category}** | ${c.totalFormatted} | ${c.percentage || ''} | ${c.count} |\n`;
    }
    return `### Expense Breakdown by Category\n\n` +
           `• **Total Expenses:** **${data.totalExpensesFormatted}**\n\n` +
           `${catTable}\n` +
           `All records verified from the PostgreSQL database.`;
  }

  // Monthly report
  if (intent === 'MONTHLY_REPORT' && data.hasData === false) {
    return `No recorded transactions found for **${data.period || 'the requested period'}**.` + noGraphNote;
  }

  if (intent === 'MONTHLY_REPORT' && data.period) {
    let catTable = '| Category | Amount | % of Total | Transactions |\n| :--- | :--- | :--- | :--- |\n';
    if (data.categories && data.categories.length > 0) {
      for (const c of data.categories) {
        catTable += `| **${c.category}** | ${c.totalFormatted} | ${c.percentage} | ${c.count} |\n`;
      }
    }

    let txTable = '';
    const txs = data.transactions || data.sampleTransactions;
    if (txs && txs.length > 0) {
      txTable = `\n\n#### Recorded Transactions (${data.period})\n\n| Date | Description | Category | Amount | Recorded By |\n| :--- | :--- | :--- | :---: | :--- |\n`;
      for (const tx of txs) {
        const isInc = (tx.type || '').toLowerCase() === 'income';
        const prefix = isInc ? '+' : '-';
        txTable += `| ${tx.date} | ${tx.description} | ${tx.category} | **${prefix}${tx.amountFormatted}** | ${tx.recordedBy || tx.logger || 'Officer'} |\n`;
      }
    }

    return `### Financial Report: ${data.period}\n\n` +
           `| Metric | Amount |\n` +
           `| :--- | :--- |\n` +
           `| **Total Income** | <span style="color:#22c55e; font-weight:700;">${data.totalIncomeFormatted}</span> (${data.incomeCount} records) |\n` +
           `| **Total Expenses** | <span style="color:#ef4444; font-weight:700;">${data.totalExpensesFormatted}</span> (${data.expenseCount} records) |\n` +
           `| **Net Balance** | **${data.netBalanceFormatted}** (*${data.netStatus}*) |\n` +
           `| **Total Transactions** | **${data.transactionCount}** |\n\n` +
           (data.categories && data.categories.length > 0 ? `#### Expense Breakdown by Category\n\n${catTable}` : '') +
           txTable +
           `\n\nAll records calculated directly from database records.`;
  }

  // Balance inquiry
  if (data.remainingBalanceFormatted) {
    return `### JPCS Financial Status Overview\n\n` +
           `| Account | Amount |\n` +
           `| :--- | :--- |\n` +
           `| **Total Income** | <span style="color:#22c55e; font-weight:700;">${data.totalIncomeFormatted}</span> |\n` +
           `| **Total Expenses** | <span style="color:#ef4444; font-weight:700;">${data.totalExpensesFormatted}</span> |\n` +
           `| **Remaining Balance** | <span style="color:#d4af37; font-weight:700;">${data.remainingBalanceFormatted}</span> |\n\n` +
           `You can ask for specific reports such as *"Monthly report for October 2025"* or *"List all transactions from September 2025"*.` +
           noGraphNote;
  }

  // Officers inquiry
  if (data.officers && data.officers.length > 0) {
    let offTable = '| Name | Position | Role |\n| :--- | :--- | :--- |\n';
    for (const o of data.officers) {
      offTable += `| **${o.name}** | ${o.position || 'Officer'} | ${o.role} |\n`;
    }
    return `### Current JPCS Organization Officers\n\n${offTable}` + noGraphNote;
  }

  return 'Data retrieved from PostgreSQL database successfully.' + noGraphNote;
}

module.exports = { handleQuery, handleUsageStatus };
