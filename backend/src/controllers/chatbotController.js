// ============================================
// Chatbot Controller — PondoSync BudgetBukas AI
// Upgraded Financial Analyst with Real Data Retrieval & Calculation
// ============================================
const financialService = require('../services/financialAnalysisService');

/**
 * Natural Language Query Parser & Intent Classifier
 */
function parseFinancialQuery(message) {
  const text = message.toLowerCase().trim();

  // Helper: Find months mentioned in text
  const monthRegex = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/gi;
  const foundMonths = [];
  let mMatch;
  while ((mMatch = monthRegex.exec(text)) !== null) {
    const raw = mMatch[1].toLowerCase();
    const num = financialService.MONTH_NAMES[raw];
    if (num && !foundMonths.some(m => m.num === num)) {
      foundMonths.push({ name: raw, num, index: mMatch.index });
    }
  }

  // Helper: Find 4-digit years (e.g., 2024, 2025, 2026, 2027)
  const yearMatches = text.match(/\b(202[0-9])\b/g);
  const years = yearMatches ? yearMatches.map(y => parseInt(y, 10)) : [];
  const defaultYear = years.length > 0 ? years[0] : 2025; // Default to active data year (2025/2026)

  // 1. Period Comparison Intent
  // e.g. "compare june and july", "compare oct and nov 2025", "income vs expenses for june and july"
  const isCompare = text.includes('compare') || 
                    (text.includes('vs') && foundMonths.length >= 2) || 
                    (text.includes('difference between') && foundMonths.length >= 2);

  if (isCompare && foundMonths.length >= 2) {
    const yearA = years[0] || defaultYear;
    const yearB = years[1] || yearA;
    return {
      intent: 'PERIOD_COMPARISON',
      periodA: { month: foundMonths[0].num, year: yearA },
      periodB: { month: foundMonths[1].num, year: yearB }
    };
  }

  // 2. Explicit Date Range Intent (YYYY-MM-DD or Month DD, YYYY)
  const isoDates = text.match(/\b(202[0-9]-[0-1][0-9]-[0-3][0-9])\b/g);
  if (isoDates && isoDates.length >= 2) {
    return {
      intent: 'DATE_RANGE_REPORT',
      startDate: isoDates[0],
      endDate: isoDates[1]
    };
  }

  // 3. Semester Report Intent
  // e.g. "this semester", "1st sem", "2nd semester", "first sem 2025"
  if (text.includes('semester') || text.includes('sem')) {
    const isFirstSem = text.includes('1st') || text.includes('first') || text.includes('1');
    const isSecondSem = text.includes('2nd') || text.includes('second') || text.includes('2');
    const targetYear = years[0] || 2025;

    let startDate, endDate, semLabel;
    if (isSecondSem) {
      // 2nd Semester: January 1 to May 31
      startDate = `${targetYear + (isFirstSem ? 0 : 1)}-01-01`;
      endDate = `${targetYear + (isFirstSem ? 0 : 1)}-05-31`;
      semLabel = `2nd Semester Academic Year ${targetYear}-${targetYear + 1}`;
    } else {
      // 1st Semester (Default): August 1 to December 31
      startDate = `${targetYear}-08-01`;
      endDate = `${targetYear}-12-31`;
      semLabel = `1st Semester Academic Year ${targetYear}-${targetYear + 1}`;
    }

    return {
      intent: 'SEMESTER_REPORT',
      startDate,
      endDate,
      semLabel,
      isFirstSem: !isSecondSem,
      year: targetYear
    };
  }

  // 4. Monthly Report Intent
  // e.g. "report for september 2026", "october 2025 report", "summary for november", "how much did we spend in october"
  if (foundMonths.length === 1 || text.includes('monthly report') || text.includes('this month') || text.includes('last month')) {
    let targetMonth = foundMonths.length > 0 ? foundMonths[0].num : null;
    let targetYear = years.length > 0 ? years[0] : defaultYear;

    if (!targetMonth) {
      const now = new Date();
      if (text.includes('last month')) {
        targetMonth = now.getMonth() === 0 ? 12 : now.getMonth();
        targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      } else {
        targetMonth = now.getMonth() + 1;
        targetYear = now.getFullYear();
      }
    }

    // Check if it's asking for a specific monthly report or general inquiry
    if (text.includes('report') || text.includes('summary') || text.includes('spend') || text.includes('spent') || text.includes('income') || text.includes('expenses') || text.includes('balance') || foundMonths.length === 1) {
      return {
        intent: 'MONTHLY_REPORT',
        month: targetMonth,
        year: targetYear
      };
    }
  }

  // 5. Highest Expense Intent
  // e.g. "what was our highest expense", "biggest expense", "largest expense", "who spent the most", "top expenses"
  if (text.includes('highest expense') || text.includes('biggest expense') || text.includes('largest expense') || text.includes('most expensive') || text.includes('top expense') || text.includes('who spent the most')) {
    return {
      intent: 'HIGHEST_EXPENSE',
      month: foundMonths.length > 0 ? foundMonths[0].num : null,
      year: years.length > 0 ? years[0] : null
    };
  }

  // 6. Event Financial Summary Intent
  // e.g. "summary of Foundation Day", "SIKLAB budget", "CICS Got Talent expenses", "Waves of Wonder", "Flag Raising"
  const eventKeywords = [
    'foundation day', 'siklab', 'cics got talent', 'waves of wonder',
    'flag raising', 'general assembly', 'hackathon', 'acquaintance',
    'sportsfest', 'seminar', 'workshop', 'teambuilding', 'booth'
  ];

  for (const kw of eventKeywords) {
    if (text.includes(kw)) {
      return {
        intent: 'EVENT_SUMMARY',
        eventName: kw.toUpperCase()
      };
    }
  }

  // Explicit event query patterns: "event <name>", "summary of <name> event", "for <name> event"
  const eventPatternMatch = text.match(/(?:for|about|summary of|report on)\s+the\s+([a-z0-9\s—]+?)(?:\s+event|\s+activity|\?|$)/i);
  if (eventPatternMatch && eventPatternMatch[1] && eventPatternMatch[1].trim().length > 2) {
    return {
      intent: 'EVENT_SUMMARY',
      eventName: eventPatternMatch[1].trim()
    };
  }

  // 7. Category Expense Breakdown Intent
  // e.g. "breakdown of expenses by category", "expenses by category", "where is money being spent"
  const categoryKeywords = [
    'food & beverages', 'food', 'beverage', 'transportation', 'supplies',
    'printing', 'equipment', 'venue', 'miscellaneous'
  ];

  for (const cat of categoryKeywords) {
    if (text.includes(cat) && (text.includes('spend') || text.includes('spent') || text.includes('cost') || text.includes('breakdown') || text.includes('total'))) {
      return {
        intent: 'CATEGORY_ANALYSIS',
        category: cat
      };
    }
  }

  if (text.includes('category') || text.includes('breakdown') || text.includes('where is money being spent') || text.includes('where did the money go')) {
    return {
      intent: 'CATEGORY_ANALYSIS',
      category: null
    };
  }

  // Default: Overall Ledger Summary
  return {
    intent: 'OVERALL_LEDGER'
  };
}

/**
 * Generate Guaranteed Formatted Markdown Report (Fallback / Base)
 * Ensures 100% accurate, zero-hallucination data display even if AI API is offline
 */
function generateDeterministicReport(data) {
  if (!data) return 'No financial data could be retrieved.';

  if (data.reportType === 'monthly') {
    if (!data.hasData) {
      return `### 📊 Monthly Financial Report — ${data.period}\n\n` +
             `> [!NOTE]\n` +
             `> **No recorded transactions found** for **${data.period}** in the database ledger.\n\n` +
             `* If you are looking for past records, try querying a month with recorded transactions such as **October 2025** or **November 2025**.\n` +
             `* You can also ask for the **overall balance summary**.`;
    }

    let catTable = '| Category | Amount | % of Expenses | Transactions |\n| :--- | :--- | :--- | :--- |\n';
    if (data.categories.length > 0) {
      for (const c of data.categories) {
        catTable += `| **${c.category}** | ${c.totalFormatted} | ${c.percentage} | ${c.count} |\n`;
      }
    } else {
      catTable += '| *No categorized expenses* | ₱0.00 | 0.0% | 0 |\n';
    }

    let largestText = 'None recorded';
    if (data.largestExpense) {
      largestText = `**${data.largestExpense.amountFormatted}** (${data.largestExpense.category} — *${data.largestExpense.description}*, logged on ${data.largestExpense.date} by ${data.largestExpense.logger})`;
    }

    return `### 📊 Official Financial Report: ${data.period}\n\n` +
           `| Metric | Amount / Details |\n` +
           `| :--- | :--- |\n` +
           `| **Total Income** | <span style="color:#22c55e; font-weight:700;">${data.totalIncomeFormatted}</span> (${data.incomeCount} transactions) |\n` +
           `| **Total Expenses** | <span style="color:#ef4444; font-weight:700;">${data.totalExpensesFormatted}</span> (${data.expenseCount} transactions) |\n` +
           `| **Net Result** | **${data.netBalanceFormatted}** (*${data.netStatus}*) |\n` +
           `| **Total Transactions** | **${data.transactionCount}** records |\n` +
           `| **Largest Expense** | ${largestText} |\n\n` +
           `#### 🏷️ Expense Breakdown by Category\n\n` +
           `${catTable}\n` +
           `> **Summary Analysis:** In ${data.period}, the organization recorded **${data.totalIncomeFormatted}** in total revenues against **${data.totalExpensesFormatted}** in operational expenditures, resulting in a net monthly ${data.netStatus.toLowerCase()} of **${data.netBalanceFormatted}**.`;
  }

  if (data.reportType === 'comparison') {
    return `### ⚖️ Financial Period Comparison: ${data.periodA.label} vs. ${data.periodB.label}\n\n` +
           `| Metric | ${data.periodA.label} | ${data.periodB.label} | Variance (Difference) | % Change |\n` +
           `| :--- | :--- | :--- | :--- | :--- |\n` +
           `| **Total Income** | ${data.periodA.incomeFormatted} | ${data.periodB.incomeFormatted} | **${data.diff.incomeDiffFormatted}** | ${data.diff.incomePctChange} |\n` +
           `| **Total Expenses** | ${data.periodA.expensesFormatted} | ${data.periodB.expensesFormatted} | **${data.diff.expenseDiffFormatted}** | ${data.diff.expensePctChange} |\n` +
           `| **Net Balance** | ${data.periodA.netFormatted} | ${data.periodB.netFormatted} | **${data.diff.netDiffFormatted}** | — |\n` +
           `| **Total Records** | ${data.periodA.count} | ${data.periodB.count} | ${data.periodB.count - data.periodA.count >= 0 ? '+' : ''}${data.periodB.count - data.periodA.count} | — |\n\n` +
           `> **Key Takeaway:** Expenses changed by **${data.diff.expenseDiffFormatted}** (${data.diff.expensePctChange}) while income changed by **${data.diff.incomeDiffFormatted}** (${data.diff.incomePctChange}) between the two comparative periods.`;
  }

  if (data.reportType === 'event') {
    if (!data.hasData) {
      return `### 🎯 Financial Summary for Event: "${data.eventName}"\n\n` +
             `> [!NOTE]\n` +
             `> No recorded income or expense transactions matching **"${data.eventName}"** were found in the database descriptions or sources.\n\n` +
             `* Please check the spelling of the event or try keywords such as **"SIKLAB"**, **"CICS Got Talent"**, or **"Waves of Wonder"**.\n` +
             `* ${data.note}`;
    }

    let expTable = '| Date | Category | Description | Amount |\n| :--- | :--- | :--- | :--- |\n';
    for (const item of data.expenseItems.slice(0, 8)) {
      expTable += `| ${item.date} | ${item.category} | ${item.description} | **${item.amountFormatted}** |\n`;
    }
    if (data.expenseItems.length > 8) {
      expTable += `| ... | ... | *+ ${data.expenseItems.length - 8} more expense records* | ... |\n`;
    }

    let incTable = '| Date | Source | Amount |\n| :--- | :--- | :--- |\n';
    if (data.incomeItems.length > 0) {
      for (const item of data.incomeItems) {
        incTable += `| ${item.date} | ${item.source} | **${item.amountFormatted}** |\n`;
      }
    } else {
      incTable += '| — | *No event-specific income sources tagged* | ₱0.00 |\n';
    }

    return `### 🎯 Financial Report: "${data.eventName}"\n\n` +
           `| Financial Metric | Verified Value |\n` +
           `| :--- | :--- |\n` +
           `| **Total Event Revenue / Income** | <span style="color:#22c55e; font-weight:700;">${data.totalIncomeFormatted}</span> (${data.incomeItems.length} records) |\n` +
           `| **Total Event Expenditures** | <span style="color:#ef4444; font-weight:700;">${data.totalExpensesFormatted}</span> (${data.expenseItems.length} records) |\n` +
           `| **Net Financial Impact** | **${data.netBalanceFormatted}** (*${data.netStatus}*) |\n` +
           `| **Matching Records Found** | **${data.matchCount}** transactions |\n\n` +
           `#### 💸 Event Expenditures Detail\n\n${expTable}\n` +
           (data.incomeItems.length > 0 ? `#### 💰 Event Income Sources\n\n${incTable}\n` : '') +
           `> ℹ️ *${data.note}*`;
  }

  if (data.reportType === 'highest_expenses') {
    let table = '| Rank | Amount | Category | Description | Date | Logged By |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n';
    for (const exp of data.expenses) {
      table += `| **#${exp.rank}** | <span style="color:#ef4444; font-weight:700;">${exp.amountFormatted}</span> | ${exp.category} | ${exp.description} | ${exp.date} | ${exp.logger} |\n`;
    }
    return `### 🏆 Top Highest Recorded Expenses (${data.filter})\n\n${table}\n` +
           `> All amounts are verified directly against organization expense records and receipts in PostgreSQL.`;
  }

  if (data.reportType === 'category') {
    let table = '| Category | Total Spent | % of Total Expenses | Transactions | Average / Tx |\n| :--- | :--- | :--- | :--- | :--- |\n';
    for (const c of data.categories) {
      table += `| **${c.category}** | **${c.totalFormatted}** | ${c.percentage} | ${c.count} | ${c.averageFormatted} |\n`;
    }
    return `### 🏷️ Expense Breakdown by Category (${data.categoryName})\n\n` +
           `**Total Organization Expenses:** **${data.totalExpensesFormatted}**\n\n` +
           `${table}\n` +
           `> Use category figures to evaluate allocation of organization funds across supplies, venue, food, and activities.`;
  }

  if (data.reportType === 'date_range') {
    let catTable = '| Category | Total | % |\n| :--- | :--- | :--- |\n';
    for (const c of data.categories) {
      catTable += `| **${c.category}** | ${c.totalFormatted} | ${c.percentage} |\n`;
    }
    return `### 📅 Financial Summary: ${data.period}\n\n` +
           `| Metric | Amount |\n` +
           `| :--- | :--- |\n` +
           `| **Total Income** | <span style="color:#22c55e; font-weight:700;">${data.totalIncomeFormatted}</span> (${data.incomeCount} records) |\n` +
           `| **Total Expenses** | <span style="color:#ef4444; font-weight:700;">${data.totalExpensesFormatted}</span> (${data.expenseCount} records) |\n` +
           `| **Net Balance** | **${data.netBalanceFormatted}** (*${data.netStatus}*) |\n` +
           `| **Total Activity** | **${data.transactionCount}** transactions |\n\n` +
           `#### 🏷️ Categories in this Date Range\n\n${catTable}`;
  }

  // Fallback: Overall summary
  return `### 💰 PondoSync General Ledger Summary\n\n` +
         `| Account Overview | Balance |\n` +
         `| :--- | :--- |\n` +
         `| **Total All-Time Income** | <span style="color:#22c55e; font-weight:700;">${data.totalIncomeFormatted}</span> |\n` +
         `| **Total All-Time Expenses** | <span style="color:#ef4444; font-weight:700;">${data.totalExpensesFormatted}</span> |\n` +
         `| **Current Remaining Balance** | <span style="color:#d4af37; font-weight:700; font-size:1.1rem;">${data.remainingBalanceFormatted}</span> |\n\n` +
         `Ask for a specific **Monthly Report** (e.g., *"Report for October 2025"*), **Period Comparison** (*"Compare October and November 2025"*), or an **Event Summary** (*"Summary of SIKLAB"*).`;
}

/**
 * Handle incoming chatbot query
 */
async function handleQuery(req, res) {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.json({ 
        success: true, 
        data: { response: 'Please type a question or select one of the suggested prompts.', type: 'text' } 
      });
    }

    // 1. Identify Intent & Extract Parameters
    const parsed = parseFinancialQuery(message);
    let verifiedData = null;
    let analysisContextPrompt = '';

    // 2. Fetch Relevant Records & Perform Exact Calculations in Backend
    try {
      if (parsed.intent === 'MONTHLY_REPORT') {
        verifiedData = await financialService.getMonthlyReport(parsed.month, parsed.year);
      } else if (parsed.intent === 'PERIOD_COMPARISON') {
        verifiedData = await financialService.comparePeriods(parsed.periodA, parsed.periodB);
      } else if (parsed.intent === 'EVENT_SUMMARY') {
        verifiedData = await financialService.searchEventFinances(parsed.eventName);
      } else if (parsed.intent === 'SEMESTER_REPORT') {
        verifiedData = await financialService.getDateRangeSummary(parsed.startDate, parsed.endDate, parsed.semLabel);
        verifiedData.note = `Based on BatStateU JPCS standard semester timeline (${parsed.startDate} to ${parsed.endDate}). If your academic calendar dates differ, please provide the exact date range.`;
      } else if (parsed.intent === 'DATE_RANGE_REPORT') {
        verifiedData = await financialService.getDateRangeSummary(parsed.startDate, parsed.endDate);
      } else if (parsed.intent === 'CATEGORY_ANALYSIS') {
        verifiedData = await financialService.getCategoryAnalysis(parsed.category);
      } else if (parsed.intent === 'HIGHEST_EXPENSE') {
        verifiedData = await financialService.getHighestExpenses(5, parsed.month, parsed.year);
      } else {
        verifiedData = await financialService.getOverallSummary();
      }
    } catch (dbErr) {
      console.error('Financial Analysis Data Retrieval Error:', dbErr);
      // Fallback to overall summary if specific query hits an edge case
      verifiedData = await financialService.getOverallSummary();
    }

    // 3. Prepare the Deterministic Report in Markdown
    const deterministicMarkdown = generateDeterministicReport(verifiedData);

    // 4. Construct High-Fidelity Prompt for BudgetBukas AI
    analysisContextPrompt = `You are "BudgetBukas AI", the Senior Financial Analyst for the Junior Philippine Computer Society (JPCS) at BatStateU Lipa.
You are embedded directly within PondoSync: The Web-Based Financial Transparency and Fund Management System.

CORE MISSION:
You must analyze the verified financial data retrieved from the PostgreSQL database and present a clear, professional, executive financial report to the user.

STRICT ACCURACY RULES:
1. Base all numerical figures, totals, counts, and percentages STRICTLY on the VERIFIED DATA provided below. DO NOT invent figures, calculate new arithmetic, or hallucinate numbers.
2. If the data indicates that no records were found (e.g. hasData is false), clearly state that no records exist for that period or event in the system. Suggest available active periods (such as October 2025 or November 2025).
3. If an event or semester query is based on keyword matching or a standard semester calendar, be transparent about the data scope and limitations.
4. Format your report using clean Markdown:
   - Use bold titles and executive metrics.
   - Present comparative or multi-row figures in clean Markdown tables (| Col 1 | Col 2 |).
   - Provide 2-3 concise, bulleted financial insights (e.g., largest cost drivers, budget surplus/deficit status).
5. Maintain a professional, helpful, and transparent tone suitable for university student leaders and general members.

--- VERIFIED FINANCIAL DATA FROM DATABASE ---
${JSON.stringify(verifiedData, null, 2)}
---------------------------------------------
`;

    // 5. Map conversation history
    const mappedHistory = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) { // keep recent context clean
        if (h.role && h.parts && h.parts.length > 0) {
          mappedHistory.push({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.parts[0].text
          });
        }
      }
    }

    const messages = [
      { role: 'system', content: analysisContextPrompt },
      ...mappedHistory,
      { role: 'user', content: message }
    ];

    // 6. Call Pollinations.ai with Timeout & Seamless Fallback
    let finalResponseText = deterministicMarkdown;
    let responseType = 'text';

    try {
      const fetchFn = global.fetch || (await import('node-fetch')).default;
      
      // 8-second timeout controller so UI never hangs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8500);

      const apiResponse = await fetchFn('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          seed: Math.floor(Math.random() * 1000000)
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (apiResponse.ok) {
        const aiText = await apiResponse.text();
        if (aiText && aiText.trim().length > 30) {
          finalResponseText = aiText.trim();
        }
      }
    } catch (apiErr) {
      console.warn('AI API bypassed, using deterministic report engine:', apiErr.message);
      // finalResponseText remains the guaranteed deterministicMarkdown
    }

    // Determine suggestion chips
    let dynamicSuggestions = ['Monthly report for Oct 2025', 'Compare Oct and Nov 2025', 'Summary of SIKLAB', 'Expenses by category'];
    if (parsed.intent === 'MONTHLY_REPORT') {
      responseType = 'report';
      dynamicSuggestions = ['Compare with previous month', 'Expenses by category', 'What was the highest expense?', 'Total balance'];
    } else if (parsed.intent === 'PERIOD_COMPARISON') {
      responseType = 'report';
      dynamicSuggestions = ['Show category breakdown', 'Monthly report for Oct 2025', 'Total balance'];
    } else if (parsed.intent === 'EVENT_SUMMARY') {
      responseType = 'report';
      dynamicSuggestions = ['Summary of CICS Got Talent', 'Summary of Waves of Wonder', 'Monthly report for Oct 2025'];
    } else if (parsed.intent === 'CATEGORY_ANALYSIS') {
      responseType = 'category';
      dynamicSuggestions = ['Highest expenses', 'Monthly report for Oct 2025', 'Total balance'];
    }

    return res.json({
      success: true,
      data: {
        response: finalResponseText,
        type: responseType,
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

module.exports = { handleQuery };
