// ============================================
// Financial Activity Tab — Dedicated Heatmap + Transaction Panel
// Integrated into Dashboard Financial Analytics
// ============================================

let faState = {
  year: new Date().getFullYear(),
  selectedDate: null,
  allTransactions: [],
  availableYears: [],
  dropdownBound: false
};

/**
 * Main render function called by dashboard.js when Financial Activity tab is active
 */
function renderFinancialActivityTab(data) {
  if (!data) return;

  faState.allTransactions = data.calendarActivity || [];

  // Extract available years dynamically from transactions
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

  // Preserve existing year selection if valid, otherwise default to current year or latest
  if (!faState.availableYears.includes(faState.year)) {
    const currentYear = new Date().getFullYear();
    if (faState.availableYears.includes(currentYear)) {
      faState.year = currentYear;
    } else {
      faState.year = faState.availableYears[0];
    }
  }

  // Setup Year Dropdown
  renderFAYearDropdown();

  // Render both Heatmaps
  renderFAHeatmaps();

  // Auto-select date for the active year
  autoSelectFADate();
}

/**
 * Setup and populate the Year Dropdown in the Analytics header controls
 */
function renderFAYearDropdown() {
  const trigger = document.getElementById('fa-year-trigger');
  const menu = document.getElementById('fa-year-menu');
  const valSpan = document.getElementById('fa-year-val');
  if (!trigger || !menu) return;

  if (valSpan) valSpan.textContent = faState.year;

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
      if (valSpan) valSpan.textContent = yr;
      menu.querySelectorAll('.fa-year-option').forEach(o => {
        o.classList.toggle('active', parseInt(o.dataset.year, 10) === yr);
      });
      menu.classList.remove('open');

      // Reset selected date for the new year & re-render
      faState.selectedDate = null;
      renderFAHeatmaps();
      autoSelectFADate();
    });

    menu.appendChild(item);
  });

  if (!faState.dropdownBound) {
    faState.dropdownBound = true;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      menu.classList.remove('open');
    });
  }
}

/**
 * Render both Income and Expense heatmaps for the selected year
 */
function renderFAHeatmaps() {
  renderFASingleHeatmap('income', 'fa-heatmap-income-wrap', 'fa-income-summary');
  renderFASingleHeatmap('expense', 'fa-heatmap-expense-wrap', 'fa-expense-summary');
}

/**
 * Render an individual annual GitHub-style heatmap (Income or Expense)
 */
function renderFASingleHeatmap(type, containerId, summaryId) {
  const container = document.getElementById(containerId);
  const summaryEl = document.getElementById(summaryId);
  if (!container) return;

  const year = faState.year;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDaysInYear = isLeap ? 366 : 365;
  const jan1 = new Date(year, 0, 1);
  const startDay = jan1.getDay(); // 0 = Sun, 1 = Mon, etc.

  // Build daily aggregate map for this year
  const dateMap = {};
  let yearTotal = 0;
  let yearCount = 0;

  for (let offset = 0; offset < totalDaysInYear; offset++) {
    const curDate = new Date(year, 0, 1 + offset);
    const dateStr = `${year}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${String(curDate.getDate()).padStart(2, '0')}`;
    dateMap[dateStr] = { count: 0, total: 0, transactions: [] };
  }

  // Filter transactions for this type and year
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
    } else {
      dateMap[txDate] = { count: 1, total: amt, transactions: [tx] };
    }
    yearTotal += amt;
    yearCount++;
  });

  // Update header summary badge
  if (summaryEl) {
    const word = yearCount === 1 ? 'transaction' : 'transactions';
    const formattedAmt = typeof formatPeso === 'function' ? formatPeso(yearTotal) : `₱${yearTotal.toLocaleString()}`;
    summaryEl.textContent = `${yearCount} ${type} ${word} (${formattedAmt})`;
  }

  // Calculate maximum daily amount for 4-tier intensity scale
  let maxDayTotal = 0;
  Object.values(dateMap).forEach(d => {
    if (d.total > maxDayTotal) maxDayTotal = d.total;
  });

  function getIntensityLevel(dayTotal) {
    if (!dayTotal || dayTotal <= 0 || maxDayTotal <= 0) return 'level-0';
    const ratio = dayTotal / maxDayTotal;
    if (ratio <= 0.25) return `${type}-1`;
    if (ratio <= 0.50) return `${type}-2`;
    if (ratio <= 0.75) return `${type}-3`;
    return `${type}-4`;
  }

  // 1. Month Row Header (53 columns)
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

  // 2. Cells Grid (53 columns x 7 rows)
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
        const levelClass = getIntensityLevel(dayData.total);
        const selectedClass = faState.selectedDate === curDateStr ? 'fa-selected' : '';

        cellsHtml += `<div class="heatmap-cell ${levelClass} ${selectedClass}" data-date="${curDateStr}" data-type="${type}" data-count="${dayData.count}" data-total="${dayData.total.toFixed(2)}" tabindex="0" role="button" aria-label="${curDateStr}"></div>`;
      }
    }
  }
  cellsHtml += '</div>';

  container.innerHTML = `${monthsHtml}<div class="heatmap-main-row">${cellsHtml}</div>`;

  // Attach hover, focus, and click listeners
  container.querySelectorAll('.heatmap-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('mouseenter', e => showFATooltip(e, cell));
    cell.addEventListener('mousemove', () => positionFATooltip(cell));
    cell.addEventListener('mouseleave', hideFATooltip);
    cell.addEventListener('focus', e => showFATooltip(e, cell));
    cell.addEventListener('blur', hideFATooltip);
    cell.addEventListener('click', () => handleFADateClick(cell.dataset.date));
  });
}

/**
 * Handle clicking a day in either Income or Expense heatmap
 * Highlights the date in both calendars and updates the transaction panel
 */
function handleFADateClick(dateStr) {
  if (!dateStr) return;
  faState.selectedDate = dateStr;

  // Highlight selected date in BOTH Income and Expense heatmaps
  document.querySelectorAll('#analytics-activity-content .heatmap-cell').forEach(cell => {
    cell.classList.toggle('fa-selected', cell.dataset.date === dateStr);
  });

  // Filter transactions for this exact date (both income and expenses)
  const dateTx = faState.allTransactions.filter(tx => {
    const txDate = (tx.date || '').slice(0, 10);
    return txDate === dateStr;
  });

  renderFATransactions(dateStr, dateTx);
}

/**
 * Auto-select today (if in year) or the most recent date with transactions
 */
function autoSelectFADate() {
  const year = faState.year;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // If today is in the selected year, check if it has activity or default to it
  if (today.getFullYear() === year) {
    handleFADateClick(todayStr);
    return;
  }

  // Find most recent date with activity in this year
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
    handleFADateClick(`${year}-01-01`);
  }
}

/**
 * Render Transactions for Selected Date on the right panel
 */
function renderFATransactions(dateStr, transactions) {
  const dateDisplay = document.getElementById('fa-tx-date-display');
  const listEl = document.getElementById('fa-tx-list');
  const countEl = document.getElementById('fa-tx-count');
  if (!listEl) return;

  // Format date for header
  if (dateDisplay && dateStr) {
    const [yr, mo, da] = dateStr.split('-');
    const d = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, parseInt(da, 10));
    dateDisplay.textContent = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } else if (dateDisplay) {
    dateDisplay.textContent = 'Select a date';
  }

  const txList = transactions || [];

  if (countEl) {
    countEl.textContent = txList.length > 0
      ? `${txList.length} transaction${txList.length !== 1 ? 's' : ''}`
      : '0 transactions';
  }

  if (txList.length === 0) {
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

  // Sort: income first, then expense, then highest amount first
  const sorted = [...txList].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
    return parseFloat(b.amount) - parseFloat(a.amount);
  });

  let totalIncome = 0;
  let totalExpense = 0;

  let itemsHtml = '';
  sorted.forEach(tx => {
    const amt = parseFloat(tx.amount) || 0;
    const isIncome = tx.type === 'income';
    const typeClass = isIncome ? 'income' : 'expense';
    const typeLabel = isIncome ? 'Income' : 'Expense';
    const typeIcon = isIncome
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>';

    if (isIncome) totalIncome += amt; else totalExpense += amt;

    const label = isIncome ? (tx.source || 'Income') : (tx.category || 'Expense');
    const description = tx.description || '';
    const addedBy = tx.userName || tx.user_name || '';

    const formattedAmt = typeof formatPeso === 'function' ? formatPeso(amt) : `₱${amt.toFixed(2)}`;

    itemsHtml += `
      <div class="fa-tx-item">
        <div class="fa-tx-item-icon ${typeClass}">${typeIcon}</div>
        <div class="fa-tx-item-info">
          <div class="fa-tx-item-label">${escapeHtml(label)}</div>
          ${description ? `<div class="fa-tx-item-desc">${escapeHtml(description)}</div>` : ''}
          <div class="fa-tx-item-meta">
            <span class="fa-tx-item-type">${typeLabel}</span>
            ${addedBy ? `<span class="fa-tx-item-added-by">Added by ${escapeHtml(addedBy)}</span>` : ''}
          </div>
        </div>
        <div class="fa-tx-item-amount ${typeClass}">${isIncome ? '+' : '-'}${formattedAmt}</div>
      </div>
    `;
  });

  // Summary badges for the day
  let summaryHtml = '<div class="fa-tx-day-summary">';
  if (totalIncome > 0) {
    const incStr = typeof formatPeso === 'function' ? formatPeso(totalIncome) : `₱${totalIncome.toFixed(2)}`;
    summaryHtml += `<span class="fa-tx-summary-badge income">+${incStr}</span>`;
  }
  if (totalExpense > 0) {
    const expStr = typeof formatPeso === 'function' ? formatPeso(totalExpense) : `₱${totalExpense.toFixed(2)}`;
    summaryHtml += `<span class="fa-tx-summary-badge expense">-${expStr}</span>`;
  }
  summaryHtml += '</div>';

  listEl.innerHTML = summaryHtml + itemsHtml;
}

/**
 * Comprehensive Tooltip on hover/focus showing both income and expense for that date
 */
function showFATooltip(e, cell) {
  const tooltip = document.getElementById('heatmap-tooltip') || document.getElementById('fa-tooltip');
  if (!tooltip) return;

  const dateStr = cell.dataset.date;

  const dateTx = faState.allTransactions.filter(tx => (tx.date || '').slice(0, 10) === dateStr);
  const incomeTx = dateTx.filter(tx => tx.type === 'income');
  const expenseTx = dateTx.filter(tx => tx.type === 'expense');

  const incomeCount = incomeTx.length;
  const expenseCount = expenseTx.length;
  const incomeTotal = incomeTx.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const expenseTotal = expenseTx.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

  // Format date
  const [yr, mo, da] = dateStr.split('-');
  const d = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, parseInt(da, 10));
  const fullDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  let bodyHtml = `<div class="heatmap-tt-date">${fullDate}</div>`;

  if (incomeCount > 0 || expenseCount > 0) {
    if (incomeCount > 0) {
      const incWord = incomeCount === 1 ? 'transaction' : 'transactions';
      const incFormatted = typeof formatPeso === 'function' ? formatPeso(incomeTotal) : `₱${incomeTotal.toFixed(2)}`;
      bodyHtml += `<div class="heatmap-tt-count">${incomeCount} income ${incWord}</div>`;
      bodyHtml += `<div class="heatmap-tt-amount income">${incFormatted} total income</div>`;
    }
    if (expenseCount > 0) {
      const expWord = expenseCount === 1 ? 'transaction' : 'transactions';
      const expFormatted = typeof formatPeso === 'function' ? formatPeso(expenseTotal) : `₱${expenseTotal.toFixed(2)}`;
      bodyHtml += `<div class="heatmap-tt-count">${expenseCount} expense ${expWord}</div>`;
      bodyHtml += `<div class="heatmap-tt-amount expense">${expFormatted} total expenses</div>`;
    }
  } else {
    bodyHtml += '<div class="heatmap-tt-empty">No transactions recorded</div>';
  }

  tooltip.innerHTML = bodyHtml;
  tooltip.style.display = 'block';
  tooltip.classList.add('visible');
  positionFATooltip(cell);
}

function positionFATooltip(cell) {
  const tooltip = document.getElementById('heatmap-tooltip') || document.getElementById('fa-tooltip');
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
  const tooltip = document.getElementById('heatmap-tooltip') || document.getElementById('fa-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('visible');
  tooltip.style.display = 'none';
}
