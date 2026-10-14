// ============================================
// Financial Chatbot Verification Test Suite
// Tests all 9 requirements from PondoSync Upgrade Phase 8
// ============================================
require('../../backend/node_modules/dotenv').config({ path: './.env' });
const pool = require('../../backend/src/config/db');
const financialService = require('../../backend/src/services/financialAnalysisService');
const { handleQuery } = require('../../backend/src/controllers/chatbotController');

async function runTests() {
  console.log('🧪 Starting PondoSync Financial Chatbot Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Monthly Report retrieves all records for requested month & year
  // -------------------------------------------------------------
  console.log('Test 1: Monthly Report Data Retrieval');
  const octReport = await financialService.getMonthlyReport(10, 2025);
  assert(octReport.period === 'October 2025', 'Correct period name generated');
  assert(octReport.transactionCount === 34, `Retrieved all 34 records for Oct 2025 (not just 15), got: ${octReport.transactionCount}`);
  assert(octReport.incomeCount === 29, `Income count is 29, got: ${octReport.incomeCount}`);
  assert(octReport.expenseCount === 5, `Expense count is 5, got: ${octReport.expenseCount}`);

  // -------------------------------------------------------------
  // Test 2: Income and Expense totals match direct SQL database calculations
  // -------------------------------------------------------------
  console.log('\nTest 2: Mathematical Accuracy vs. Direct SQL');
  const [directSql] = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS direct_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS direct_expense
    FROM transactions
    WHERE EXTRACT(MONTH FROM date) = 10 AND EXTRACT(YEAR FROM date) = 2025
  `);
  const expectedIncome = parseFloat(directSql[0].direct_income);
  const expectedExpense = parseFloat(directSql[0].direct_expense);
  assert(octReport.totalIncome === expectedIncome, `Total Income matches direct SQL (Expected: ${expectedIncome}, Got: ${octReport.totalIncome})`);
  assert(octReport.totalExpenses === expectedExpense, `Total Expenses matches direct SQL (Expected: ${expectedExpense}, Got: ${octReport.totalExpenses})`);
  assert(octReport.netBalance === (expectedIncome - expectedExpense), `Net Balance calculation is exact (${octReport.netBalance})`);

  // -------------------------------------------------------------
  // Test 3: Category Breakdown uses the requested period
  // -------------------------------------------------------------
  console.log('\nTest 3: Period-Specific Category Breakdown');
  const octCats = octReport.categories;
  const foodCat = octCats.find(c => c.category === 'Food & Beverages');
  assert(foodCat !== undefined, 'Food & Beverages category found in Oct 2025');
  assert(foodCat.total === 1980.00, `Food & Beverages total matches DB records (Expected: 1980.00, Got: ${foodCat.total})`);
  const catSum = octCats.reduce((sum, c) => sum + c.total, 0);
  assert(Math.abs(catSum - octReport.totalExpenses) < 0.01, `Category sum equals total expenses (${catSum} === ${octReport.totalExpenses})`);

  // -------------------------------------------------------------
  // Test 4: Period Comparisons use correct dates and calculate differences
  // -------------------------------------------------------------
  console.log('\nTest 4: Period Comparison Differences & Percentages');
  const comparison = await financialService.comparePeriods(
    { month: 10, year: 2025 },
    { month: 11, year: 2025 }
  );
  const expectedIncomeDiff = comparison.periodB.income - comparison.periodA.income;
  const expectedExpenseDiff = comparison.periodB.expenses - comparison.periodA.expenses;
  assert(comparison.diff.incomeDiff === expectedIncomeDiff, `Income difference calculated correctly (${comparison.diff.incomeDiff})`);
  assert(comparison.diff.expenseDiff === expectedExpenseDiff, `Expense difference calculated correctly (${comparison.diff.expenseDiff})`);
  assert(comparison.diff.incomePctChange === '-82.9%', `Income percentage change is accurate (${comparison.diff.incomePctChange})`);
  assert(comparison.diff.expensePctChange === '+1230.0%', `Expense percentage change is accurate (${comparison.diff.expensePctChange})`);

  // -------------------------------------------------------------
  // Test 5: Event Searches & Ambiguity handling
  // -------------------------------------------------------------
  console.log('\nTest 5: Event Search & Transparency Flag');
  const eventData = await financialService.searchEventFinances('SIKLAB');
  assert(eventData.eventName === 'SIKLAB', 'Event name recognized');
  assert(eventData.matchCount === 20, `Found 20 matching records for SIKLAB, got: ${eventData.matchCount}`);
  assert(eventData.totalExpenses === 10831.84, `Total SIKLAB expenses match database records (${eventData.totalExpenses})`);
  assert(typeof eventData.note === 'string' && eventData.note.includes('keyword'), 'Includes transparent data limitation note');

  // -------------------------------------------------------------
  // Test 6: Missing Data produces honest response without hallucination
  // -------------------------------------------------------------
  console.log('\nTest 6: Missing Data Handling');
  const emptyReport = await financialService.getMonthlyReport(9, 2026);
  assert(emptyReport.hasData === false, 'Correctly flags hasData = false for month with no transactions');
  assert(emptyReport.totalIncome === 0, 'Total income is 0');
  assert(emptyReport.totalExpenses === 0, 'Total expenses is 0');

  // Test controller response for empty month
  let emptyChatResponse = '';
  await handleQuery({
    body: { message: 'Generate a financial report for September 2026' }
  }, {
    json: (res) => { emptyChatResponse = res.data.response; }
  });
  assert(emptyChatResponse.includes('No recorded transactions found'), 'Chatbot honestly reports missing records for Sept 2026');

  // -------------------------------------------------------------
  // Test 7: Unauthenticated Requests blocked by auth middleware
  // -------------------------------------------------------------
  console.log('\nTest 7: Authentication Middleware Security');
  const authMiddleware = require('../../backend/src/middleware/auth');
  let authStatus = null;
  let authMessage = '';
  const mockReq = { headers: {} };
  const mockRes = {
    status: (code) => { authStatus = code; return mockRes; },
    json: (data) => { authMessage = data.message; return mockRes; }
  };
  authMiddleware(mockReq, mockRes, () => {});
  assert(authStatus === 401, `Unauthenticated request returns 401 Unauthorized (Got: ${authStatus})`);
  assert(authMessage.includes('No token provided'), 'Rejects with appropriate security message');

  // -------------------------------------------------------------
  // Test 8: Highest expense query
  // -------------------------------------------------------------
  console.log('\nTest 8: Highest Expense Retrieval');
  const highest = await financialService.getHighestExpenses(1);
  assert(highest.expenses.length === 1, 'Retrieved top 1 expense');
  assert(highest.expenses[0].amount > 0, `Highest expense is positive: ${highest.expenses[0].amountFormatted}`);

  // -------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
