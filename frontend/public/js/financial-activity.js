// ============================================
// Financial Activity Page — Dedicated Heatmap + Transaction Panel
// ============================================

let faState = {
  year: new Date().getFullYear(),
  selectedDate: null,
  allTransactions: [],
  availableYears: [],
  initialized: false,
  loading: false
};

// ── Initialization ──
function initFinancialActivity() {
  if (faState.initialized) return;
  faState.initialized = true;
  loadFinancialActivityData();
}

// ── Data Loading ──
async function loadFinancialActivityData() {
  if (faState.loading) return;
  faState.loading = true;

  // Show skeletons
  showFASkeletons();

  try {
    const res = await apiGet('/transactions/dashboard/analytics?startDate=all&endDate=all&tab=cashflow');
    if (!res || !res.success || !res.data) {
      showFAEmptyState();
      return;
    }

    const data = res.data;
    faState.allTransactions = data.calendarActivity || [];

    // Extract available years
    const yearsSet = new Set();
    faState.allTransactions.forEach(tx => {
      if (tx && tx.date) {
        const yr = parseInt(String(tx.date).slice(0, 4), 10);
        if (!isNaN(yr) && yr > 1900 && yr < 2100) yearsSet.add(yr);
      }
    });

    faState.availableYears = Array.from(yearsSet).sort((a, b) => b - a);

    if (faState.availableYears.length === 0) {
      faState.availableYears = [new Date().getFullYear()];
    }

    // Set year to current if available, otherwise latest
    if (!faState.availableYears.includes(faState.year)) {
      faState.year = faState.availableYears[0];
    }

    // Build year dropdown
    renderFAYearDropdown();

    // Render heatmaps
    renderFAHeatmaps();

    // Auto-select today or most recent date with activity
    autoSelectFADate();

  } catch (err) {
    console.error('Financial Activity load error:', err);
    showFAEmptyState();
  } finally {
    faState.loading = false;
  }
}

function showFASkeletons() {
  const incomeWrap = document.getElementById('fa-heatmap-income-wrap');
  const expenseWrap = document.getElementById('fa-heatmap-expense-wrap');
  const txPanel = document.getElementById('fa-tx-list');

  const skeletonGrid = `<div class="fa-skeleton-grid">${'<div class="fa-skeleton-cell"></div>'.repeat(53 * 7)}</div>`;

  if (incomeWrap) incomeWrap.innerHTML = skeletonGrid;
  if (expenseWrap) expenseWrap.innerHTML = skeletonGrid;
  if (txPanel) txPanel.innerHTML = `
    <div class="fa-skeleton-tx">${'<div class="fa-skeleton-tx-item"></div>'.repeat(5)}</div>
  `;
}

function showFAEmptyState() {
  const incomeWrap = document.getElementById('fa-heatmap-income-wrap');
  const expenseWrap = document.getElementById('fa-heatmap-expense-wrap');
  if (incomeWrap) incomeWrap.innerHTML = '<div class="fa-empty-msg">No income activity data available.</div>';
  if (expenseWrap) expenseWrap.innerHTML = '<div class="fa-empty-msg">No expense activity data available.</div>';
  renderFATransactions(null, []);
}

// ── Year Dropdown ──
function renderFAYearDropdown() {
  const trigger = document.getElementById('fa-year-trigger');
  const menu = document.getElementById('fa-year-menu');
  if (!trigger || !menu) return;

  trigger.querySelector('span').textContent = faState.year;

  menu.innerHTML = '';
  faState.availableYears.forEach(yr => {
    const item = document.createElement('div');
    item.className = `fa-year-option ${yr === faState.year ? 'active' : ''}`;
    item.textContent = yr;
    item.dataset.year = yr;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (faState.year === yr) {
        menu.classList.remove('open');
        return;
      }
      faState.year = yr;
      trigger.querySelector('span').textContent = yr;
      menu.querySelectorAll('.fa-year-option').forEach(o => o.classList.toggle('active', parseInt(o.dataset.year) === yr));
      menu.classList.remove('open');
      faState.selectedDate = null;
      renderFAHeatmaps();
      autoSelectFADate();
    });
    menu.appendChild(item);
  });

  // Toggle dropdown
  trigger.onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  };

  // Close on outside click
  document.addEventListener('click', () => menu.classList.remove('open'));
}

// ── Heatmap Rendering ──
function renderFAHeatmaps() {
  renderFASingleHeatmap('income', 'fa-heatmap-income-wrap', 'fa-income-summary');
  renderFASingleHeatmap('expense', 'fa-heatmap-expense-wrap', 'fa-expense-summary');
}

function renderFASingleHeatmap(type, containerId, summaryId) {
  const container = document.getElementById(containerId);
  const summaryEl = document.getElementById(summaryId);
  if (!container) return;

  const year = faState.year;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDaysInYear = isLeap ? 366 : 365;
  const jan1 = new Date(year, 0, 1);
  const startDay = jan1.getDay();

  // Build date map
  const dateMap = {};
  let yearTotal = 0;
  let yearCount = 0;

  for (let offset = 0; offset < totalDaysInYear; offset++) {
    const curDate = new Date(year, 0, 1 + offset);
    const dateStr = `${year}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${String(curDate.getDate()).padStart(2, '0')}`;
    dateMap[dateStr] = { count: 0, total: 0, transactions: [] };
  }

  const yearPrefix = `${year}-`;
  faState.allTransactions.forEach(tx => {
    if (tx.type !== type) return;
    const txDate = (tx.date || '').slice(0, 10);
    if (!txDate.startsWith(yearPrefix)) return;
    const amt = parseFloat(tx.amount) || 0;
    if (dateMap[txDate]) {
      dateMap[txDate].count++;
      dateMap[txDate].total += amt;
      dateMap[txDate].transactions.push(tx);
    }
    yearTotal += amt;
    yearCount++;
  });

  // Update summary
  if (summaryEl) {
    const word = yearCount === 1 ? 'transaction' : 'transactions';
    summaryEl.textContent = `${yearCount} ${type} ${word} (${formatPeso(yearTotal)})`;
  }

  // Max for intensity
  let maxDayTotal = 0;
  Object.values(dateMap).forEach(d => {
    if (d.total > maxDayTotal) maxDayTotal = d.total;
  });

  function getLevel(dayTotal) {
    if (!dayTotal || dayTotal <= 0 || maxDayTotal <= 0) return 'level-0';
    const ratio = dayTotal / maxDayTotal;
    if (ratio <= 0.25) return `${type}-1`;
    if (ratio <= 0.50) return `${type}-2`;
    if (ratio <= 0.75) return `${type}-3`;
    return `${type}-4`;
  }

  // Month labels
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthCols = {};
  for (let m = 0; m < 12; m++) {
    const firstDate = new Date(year, m, 1);
    const diffDays = Math.round((firstDate - jan1) / 86400000);
    const weekCol = Math.floor((diffDays + startDay) / 7);
    monthCols[weekCol] = monthNames[m];
  }

  let monthsHtml = '<div class="heatmap-months-row"><div class="heatmap-months-track">';
  for (let col = 0; col < 53; col++) {
    if (monthCols[col]) {
      monthsHtml += `<span class="heatmap-month-label" style="grid-column: ${col + 1};">${monthCols[col]}</span>`;
    }
  }
  monthsHtml += '</div></div>';

  // Cells grid
  let cellsHtml = '<div class="heatmap-cells-grid">';
  for (let col = 0; col < 53; col++) {
    for (let row = 0; row < 7; row++) {
      const offset = col * 7 + row - startDay;
      if (offset < 0 || offset >= totalDaysInYear) {
        cellsHtml += '<div class="heatmap-cell empty"></div>';
      } else {
        const curDate = new Date(year, 0, 1 + offset);
        const curDateStr = `${year}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${String(curDate.getDate()).padStart(2, '0')}`;
        const dayData = dateMap[curDateStr] || { count: 0, total: 0 };
        const levelClass = getLevel(dayData.total);
        const selectedClass = faState.selectedDate === curDateStr ? 'fa-selected' : '';

        cellsHtml += `<div class="heatmap-cell ${levelClass} ${selectedClass}" data-date="${curDateStr}" data-type="${type}" data-count="${dayData.count}" data-total="${dayData.total.toFixed(2)}" tabindex="0" role="button" aria-label="${curDateStr}"></div>`;
      }
    }
  }
  cellsHtml += '</div>';

  container.innerHTML = `${monthsHtml}<div class="heatmap-main-row">${cellsHtml}</div>`;

  // Attach event listeners
  container.querySelectorAll('.heatmap-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('mouseenter', e => showFATooltip(e, cell));
    cell.addEventListener('mousemove', () => positionFATooltip(cell));
    cell.addEventListener('mouseleave', hideFATooltip);
    cell.addEventListener('focus', e => showFATooltip(e, cell));
    cell.addEventListener('blur', hideFATooltip);
    cell.addEventListener('click', () => handleFADateClick(cell.dataset.date));
  });
}

// ── Date Click Handler ──
function handleFADateClick(dateStr) {
  faState.selectedDate = dateStr;

  // Update selected visual in both heatmaps
  document.querySelectorAll('#page-financial-activity .heatmap-cell').forEach(cell => {
    cell.classList.toggle('fa-selected', cell.dataset.date === dateStr);
  });

  // Get all transactions for this date (both income and expense)
  const dateTx = faState.allTransactions.filter(tx => {
    const txDate = (tx.date || '').slice(0, 10);
    return txDate === dateStr;
  });

  renderFATransactions(dateStr, dateTx);
}

function autoSelectFADate() {
  const year = faState.year;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // If today is in the selected year, try it first
  if (today.getFullYear() === year) {
    handleFADateClick(todayStr);
    return;
  }

  // Otherwise find most recent date with transactions in this year
  const yearPrefix = `${year}-`;
  let latestDate = null;
  faState.allTransactions.forEach(tx => {
    const txDate = (tx.date || '').slice(0, 10);
    if (txDate.startsWith(yearPrefix)) {
      if (!latestDate || txDate > latestDate) latestDate = txDate;
    }
  });

  if (latestDate) {
    handleFADateClick(latestDate);
  } else {
    // No transactions - show Jan 1
    handleFADateClick(`${year}-01-01`);
  }
}

// ── Transaction Panel ──
function renderFATransactions(dateStr, transactions) {
  const dateDisplay = document.getElementById('fa-tx-date-display');
  const listEl = document.getElementById('fa-tx-list');
  const countEl = document.getElementById('fa-tx-count');
  if (!listEl) return;

  // Format date header
  if (dateDisplay && dateStr) {
    const [yr, mo, da] = dateStr.split('-');
    const d = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(da));
    dateDisplay.textContent = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } else if (dateDisplay) {
    dateDisplay.textContent = 'Select a date';
  }

  if (countEl) {
    countEl.textContent = transactions.length > 0
      ? `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`
      : '';
  }

  if (!transactions || transactions.length === 0) {
    listEl.innerHTML = `
      <div class="fa-tx-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); opacity: 0.5;">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No transactions recorded on this date.</p>
      </div>
    `;
    return;
  }

  // Sort: income first, then expense, by amount desc
  const sorted = [...transactions].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
    return parseFloat(b.amount) - parseFloat(a.amount);
  });

  let totalIncome = 0;
  let totalExpense = 0;

  let html = '';
  sorted.forEach(tx => {
    const amt = parseFloat(tx.amount) || 0;
    const isIncome = tx.type === 'income';
    const typeClass = isIncome ? 'income' : 'expense';
    const typeLabel = isIncome ? 'Income' : 'Expense';
    const typeIcon = isIncome
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>';

    if (isIncome) totalIncome += amt; else totalExpense += amt;

    const label = isIncome ? (tx.source || 'Income') : (tx.category || 'Expense');
    const description = tx.description || '';

    html += `
      <div class="fa-tx-item">
        <div class="fa-tx-item-icon ${typeClass}">${typeIcon}</div>
        <div class="fa-tx-item-info">
          <div class="fa-tx-item-label">${escapeHtml(label)}</div>
          ${description ? `<div class="fa-tx-item-desc">${escapeHtml(description)}</div>` : ''}
          <div class="fa-tx-item-type">${typeLabel}</div>
        </div>
        <div class="fa-tx-item-amount ${typeClass}">${isIncome ? '+' : '-'}${formatPeso(amt)}</div>
      </div>
    `;
  });

  // Add day summary at top
  let summaryHtml = '<div class="fa-tx-day-summary">';
  if (totalIncome > 0) {
    summaryHtml += `<span class="fa-tx-summary-badge income">+${formatPeso(totalIncome)}</span>`;
  }
  if (totalExpense > 0) {
    summaryHtml += `<span class="fa-tx-summary-badge expense">-${formatPeso(totalExpense)}</span>`;
  }
  summaryHtml += '</div>';

  listEl.innerHTML = summaryHtml + html;
}

// ── Tooltip ──
function showFATooltip(e, cell) {
  const tooltip = document.getElementById('fa-tooltip');
  if (!tooltip) return;

  const dateStr = cell.dataset.date;
  const type = cell.dataset.type;

  // Get BOTH income and expense data for this date
  const dateTx = faState.allTransactions.filter(tx => (tx.date || '').slice(0, 10) === dateStr);
  const incomeCount = dateTx.filter(tx => tx.type === 'income').length;
  const expenseCount = dateTx.filter(tx => tx.type === 'expense').length;
  const incomeTotal = dateTx.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const expenseTotal = dateTx.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

  // Format date
  const [yr, mo, da] = dateStr.split('-');
  const d = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(da));
  const fullDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  let bodyHtml = `<div class="heatmap-tt-date">${fullDate}</div>`;

  if (incomeCount > 0 || expenseCount > 0) {
    if (incomeCount > 0) {
      bodyHtml += `<div class="heatmap-tt-count">${incomeCount} income transaction${incomeCount !== 1 ? 's' : ''}</div>`;
      bodyHtml += `<div class="heatmap-tt-amount income">${formatPeso(incomeTotal)} total income</div>`;
    }
    if (expenseCount > 0) {
      bodyHtml += `<div class="heatmap-tt-count">${expenseCount} expense transaction${expenseCount !== 1 ? 's' : ''}</div>`;
      bodyHtml += `<div class="heatmap-tt-amount expense">${formatPeso(expenseTotal)} total expenses</div>`;
    }
  } else {
    bodyHtml += '<div class="heatmap-tt-empty">No transactions</div>';
  }

  tooltip.innerHTML = bodyHtml;
  tooltip.style.display = 'block';
  tooltip.classList.add('visible');
  positionFATooltip(cell);
}

function positionFATooltip(cell) {
  const tooltip = document.getElementById('fa-tooltip');
  if (!tooltip || !tooltip.classList.contains('visible')) return;

  const rect = cell.getBoundingClientRect();
  const ttRect = tooltip.getBoundingClientRect();

  let left = rect.left + (rect.width / 2) - (ttRect.width / 2);
  let top = rect.top - ttRect.height - 8;

  if (top < 10) top = rect.bottom + 8;
  left = Math.max(10, Math.min(left, window.innerWidth - ttRect.width - 10));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideFATooltip() {
  const tooltip = document.getElementById('fa-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('visible');
  tooltip.style.display = 'none';
}

// escapeHtml is defined in dashboard.js
