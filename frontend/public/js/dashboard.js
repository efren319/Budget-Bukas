// ============================================
// Dashboard.js — Stats, Charts, Activity, Analytics
// ============================================

let mainChart = null;
let pieChart = null;
let currentDashboardDataStr = null;
let pollingInterval = null;

// ── Analytics State ──
let analyticsChart = null;
let breakdownChart = null;
const analyticsCache = new Map();
let heatmapSelectedYear = new Date().getFullYear();
let activeDayPopoverKey = null;

// ── Interactive Financial Date Range Calendar State ──
let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let calSelectedStart = null;
let calSelectedEnd = null;
let calActiveEndpoint = 'start'; // 'start' or 'end'
const calendarActivityMap = new Map();

let analyticsState = {
  tab: 'cashflow',
  chartType: 'bar',
  startDate: null,
  endDate: null,
  groupBy: 'month',
  data: null
};

// Sync Chart.js animations with Performance Mode
function syncChartPerfMode(isPerf) {
  if (typeof Chart !== 'undefined') {
    Chart.defaults.animation = isPerf ? false : { duration: 600, easing: 'easeOutQuart' };
    if (analyticsChart && analyticsChart.options) {
      analyticsChart.options.animation = isPerf ? false : { duration: 600, easing: 'easeOutQuart' };
      analyticsChart.update('none');
    }
    if (breakdownChart && breakdownChart.options) {
      breakdownChart.options.animation = isPerf ? false : { duration: 600 };
      breakdownChart.update('none');
    }
    if (pieChart && pieChart.options) {
      pieChart.options.animation = isPerf ? false : { duration: 600 };
      pieChart.update('none');
    }
  }
}

if (window.PondoSyncPerf) {
  if (window.PondoSyncPerf.isEnabled()) {
    if (typeof Chart !== 'undefined') Chart.defaults.animation = false;
  }
  window.PondoSyncPerf.addListener(syncChartPerfMode);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Smoothly animates a number element from 0 to its target value (Philippine Peso format).
 */
function animateCounter(elementId, targetValue, duration = 1200) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (window.PondoSyncPerf && window.PondoSyncPerf.isEnabled()) {
    if (typeof formatPeso === 'function') {
      el.textContent = formatPeso(targetValue);
    } else {
      el.textContent = '₱' + Math.abs(parseFloat(targetValue) || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    return;
  }

  const start = performance.now();
  const target = parseFloat(targetValue) || 0;
  const isNegative = target < 0;
  const absTarget = Math.abs(target);

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);
    const current = absTarget * easedProgress;

    const formatted = '₱' + current.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    el.textContent = (isNegative ? '-' : '') + formatted;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      if (typeof formatPeso === 'function') {
        el.textContent = formatPeso(targetValue);
      }
    }
  }

  requestAnimationFrame(update);
}


function initDashboard() {
  // Load data on first load
  loadDashboardData();
  
  // Fetch members asynchronously without blocking
  fetchMembers();

  // Chart Options Dropdown Logic (legacy — kept for compatibility)
  const optionsDropdown = document.getElementById('chart-options-dropdown');
  const optionsTrigger = document.getElementById('options-trigger');
  const pills = document.querySelectorAll('#chart-filters .pill');

  if (optionsTrigger && optionsDropdown) {
    optionsTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      optionsDropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      optionsDropdown.classList.remove('open');
    });
  }

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      
      if (optionsTrigger) {
        const periodText = pill.textContent.trim();
        optionsTrigger.querySelector('span').textContent = `This ${periodText}`;
      }
      
      if (optionsDropdown) optionsDropdown.classList.remove('open');
      
      loadChartData(pill.dataset.period);
    });
  });

  // Start Live Update Polling (every 15 seconds)
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(pollForUpdates, 15000);

  // Initialize analytics system
  initAnalytics();

  // Sync member list scroll height whenever the left column or date filter changes size
  window.addEventListener('resize', requestSyncMemberListHeight);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      requestSyncMemberListHeight();
    });
    const mainCol = document.querySelector('.dashboard-main-content');
    if (mainCol) ro.observe(mainCol);
    const filterCard = document.querySelector('.date-filter-card');
    if (filterCard) ro.observe(filterCard);
    const breakdownRow = document.getElementById('analytics-breakdown-row');
    if (breakdownRow) ro.observe(breakdownRow);
    const chartContent = document.querySelector('.analytics-content');
    if (chartContent) ro.observe(chartContent);
    const reportsContent = document.getElementById('analytics-reports-content');
    if (reportsContent) ro.observe(reportsContent);
  }
}

/**
 * Replaces a skeleton placeholder with real content using a smooth transition
 */
function revealContent(elementId, skeletonSelector) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const parent = element.parentElement;
  if (parent) {
    const skeletons = parent.querySelectorAll(skeletonSelector || '.skeleton');
    skeletons.forEach(s => {
      s.classList.add('content-fade-out');
      setTimeout(() => s.remove(), 400);
    });

    const container = element.closest('.loading-state');
    if (container) {
      setTimeout(() => container.classList.remove('loading-state'), 300);
    }
  }

  element.style.display = '';
  element.classList.add('content-fade-in');
}

async function loadDashboardData() {
  try {
    const data = await apiGet('/transactions/dashboard/stats');
    if (!data || !data.success) return;

    currentDashboardDataStr = JSON.stringify(data.data);

    const { balance, monthly, recent, categories } = data.data;

    revealContent('stat-income');
    revealContent('stat-expenses');
    revealContent('stat-balance');
    revealContent('main-chart');
    
    animateCounter('stat-income', balance.total_income);
    animateCounter('stat-expenses', balance.total_expenses);
    animateCounter('stat-balance', balance.remaining_balance);
    
    const chartSkeleton = document.querySelector('#main-chart-container .skeleton');
    if (chartSkeleton) {
      chartSkeleton.classList.add('content-fade-out');
      setTimeout(() => chartSkeleton.remove(), 400);
    }

    renderRecentActivity(recent);
    renderCategoryBreakdown(categories);
    renderCategoryPieChart(categories);
    loadChartData('week');
    fetchMembers();

    window.dispatchEvent(new Event('dashboard-data-loaded'));
  } catch (error) {
    console.error('Dashboard load error:', error);
    window.dispatchEvent(new Event('dashboard-data-loaded'));
  }
}

async function pollForUpdates() {
  try {
    const data = await apiGet('/transactions/dashboard/stats');
    if (!data || !data.success) return;
    
    const newDataStr = JSON.stringify(data.data);
    
    if (currentDashboardDataStr && currentDashboardDataStr !== newDataStr) {
      const toast = document.getElementById('live-update-toast');
      if (toast && toast.classList.contains('hidden')) {
        toast.classList.remove('hidden');
      }
    }
  } catch (err) {
    // Ignore polling errors
  }
}

function renderRecentActivity(items) {
  const container = document.getElementById('recent-activity');
  if (!container) return;

  const panel = container.closest('.loading-state');
  if (panel) panel.classList.remove('loading-state');

  container.classList.add('content-fade-in');

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No recent activity</div>';
    return;
  }

  container.innerHTML = items.slice(0, 2).map(item => {
    const isIncome = item.type === 'income';
    const icon = isIncome ? 'trending-up' : 'trending-down';
    const detail = isIncome ? (item.source || 'Income') : (item.category || 'Expense');
    const sign = isIncome ? '+' : '-';

    return `
      <div class="activity-item">
        <div class="activity-icon ${item.type}">
          <i data-lucide="${icon}"></i>
        </div>
        <div class="activity-info">
          <div class="activity-title">${detail}</div>
          <div class="activity-date">${formatDate(item.date)}</div>
        </div>
        <span class="activity-amount ${item.type}">${sign}${formatPeso(item.amount)}</span>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCategoryBreakdown(categories) {
  const container = document.getElementById('category-breakdown');
  if (!container) return;

  const panel = container.closest('.loading-state');
  if (panel) panel.classList.remove('loading-state');

  container.classList.add('content-fade-in');

  if (!categories || categories.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No data yet</div>';
    return;
  }

  const maxTotal = Math.max(...categories.map(c => parseFloat(c.total)));

  container.innerHTML = categories.slice(0, 2).map(cat => {
    const pct = (parseFloat(cat.total) / maxTotal * 100).toFixed(0);
    return `
      <div class="category-item">
        <div class="category-bar-wrapper">
          <div class="category-name">
            ${cat.category}
            <span>${formatPeso(cat.total)}</span>
          </div>
          <div class="category-bar">
            <div class="category-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderCategoryPieChart(categories) {
  const canvas = document.getElementById('category-pie-chart');
  if (!canvas) return;

  const container = document.getElementById('pie-chart-container');
  if (container) {
    const skeleton = container.querySelector('.skeleton');
    if (skeleton) {
      skeleton.classList.add('content-fade-out');
      setTimeout(() => skeleton.remove(), 400);
    }
    const panel = container.closest('.loading-state');
    if (panel) panel.classList.remove('loading-state');
  }

  canvas.style.display = 'block';
  canvas.classList.add('content-fade-in');

  const ctx = canvas.getContext('2d');

  if (pieChart) {
    pieChart.destroy();
  }

  if (!categories || categories.length === 0) {
    pieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No Data'],
        datasets: [{
          data: [1],
          backgroundColor: ['rgba(211, 172, 119, 0.1)'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
    return;
  }

  const labels = categories.map(c => c.category);
  const data = categories.map(c => parseFloat(c.total));
  
  const bgColors = [
    'rgba(211, 172, 119, 1)',
    'rgba(211, 172, 119, 0.7)',
    'rgba(211, 172, 119, 0.4)',
    'rgba(211, 172, 119, 0.2)',
    'rgba(210, 132, 71, 1)'
  ];

  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors.slice(0, data.length),
        borderWidth: 1,
        borderColor: '#111'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: '#A0A0A0',
            font: { family: "'Inter', sans-serif", size: 11 },
            boxWidth: 10,
            usePointStyle: true,
            padding: 15
          }
        },
        tooltip: {
          backgroundColor: '#1E1E1E',
          titleColor: '#E0E0E0',
          bodyColor: '#d3ac77',
          borderColor: 'rgba(211, 172, 119, 0.2)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return ' ₱' + context.parsed.toLocaleString('en-PH', { minimumFractionDigits: 2 });
            }
          }
        }
      }
    }
  });
}

async function fetchMembers() {
  try {
    const data = await apiGet('/auth/users');
    if (!data || !data.success) {
      renderMembers([]);
      return;
    }
    let members = data.data;
    
    if (typeof sortUsersByHierarchy === 'function' && Array.isArray(members)) {
      members = sortUsersByHierarchy(members);
    }
    
    renderMembers(members);
  } catch (error) {
    console.error('Members fetch error:', error);
    renderMembers([]);
  }
}

function renderMembers(members) {
  const container = document.getElementById('members-list');
  if (!container) return;

  const panel = container.closest('.loading-state') || document.querySelector('.member-card');
  if (panel) {
    panel.classList.remove('loading-state');
  }

  const skeletons = container.querySelectorAll('.skeleton-flex-row, .skeleton');
  skeletons.forEach(s => s.remove());

  container.classList.add('content-fade-in');

  if (!members || !Array.isArray(members) || members.length === 0) {
    container.innerHTML = `
      <div class="empty-state-small" style="text-align: center; padding: 24px var(--space-sm); color: var(--text-secondary); font-size: 0.8rem;">
        <i data-lucide="users" style="width: 24px; height: 24px; margin-bottom: 6px; opacity: 0.4;"></i>
        <div>No organization members found</div>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const base = (window.API_BASE || window.API_URL || (typeof API_BASE !== 'undefined' ? API_BASE : '/api')).replace(/\/+$/, '');

  container.innerHTML = members.map(member => {
    const memberId = member.id || 0;
    const memberName = member.name || 'Member';
    const memberRole = member.role || 'viewer';
    const memberPosition = member.position || '—';
    const initial = (memberName.trim().charAt(0) || 'M').toUpperCase();

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="#221e1a"/><text x="18" y="18" text-anchor="middle" dominant-baseline="central" fill="#d4af37" font-family="sans-serif" font-weight="bold" font-size="14">${initial}</text></svg>`;
    const fallbackSvg = 'data:image/svg+xml;base64,' + btoa(svgContent);

    const avatarHtml = `<img src="${base}/auth/avatar/${memberId}?t=${Date.now()}" class="user-avatar-${memberId}" alt="${memberName}" style="display:block;width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.onerror=null;this.src='${fallbackSvg}';">`;
      
    const roleClass = memberRole === 'admin' ? 'badge-primary' : 'badge-secondary';

    return `
      <div class="member-item">
        <div class="member-avatar">
          ${avatarHtml}
        </div>
        <div class="member-info">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span class="member-name">${memberName}</span>
            <span class="badge ${roleClass}" style="font-size: 0.6rem; padding: 2px 6px;">${memberRole}</span>
          </div>
          <span class="member-role" style="color: var(--text-secondary); font-size: 0.75rem;">${memberPosition}</span>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
  requestSyncMemberListHeight();
}

let syncHeightPending = false;
function requestSyncMemberListHeight() {
  if (syncHeightPending) return;
  syncHeightPending = true;
  // Double rAF: first frame lets layout settle, second frame reads stable values
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncHeightPending = false;
      syncMemberListHeight();
    });
  });
}

function getActiveAnalyticsTargetEl() {
  const tab = analyticsState.tab;
  if (tab === 'reports') {
    const reportsContent = document.getElementById('analytics-reports-content');
    if (reportsContent && reportsContent.style.display !== 'none' && reportsContent.offsetHeight > 20) {
      return reportsContent;
    }
  } else if (tab === 'expenses' || tab === 'income') {
    const breakdownRow = document.getElementById('analytics-breakdown-row');
    if (breakdownRow && breakdownRow.style.display !== 'none' && breakdownRow.offsetHeight > 20) {
      return breakdownRow;
    }
  }
  return document.querySelector('.analytics-content');
}

function syncMemberListHeight() {
  const mainCol        = document.querySelector('.dashboard-main-content');
  const sideCol        = document.querySelector('.dashboard-side-content');
  const memberCard     = document.querySelector('.member-card');
  const memberList     = document.getElementById('members-list');
  const dateFilterCard = document.querySelector('.date-filter-card');

  if (!memberList || !memberCard) return;

  // Mobile / tablet screen (<= 1200px) where columns stack vertically:
  // Reset inline height and apply safe scroll cap
  if (window.innerWidth <= 1200 || !mainCol || !sideCol || !dateFilterCard) {
    memberCard.style.height = '';
    memberList.style.maxHeight = '280px';
    return;
  }

  // 1. Identify active target element in the left column
  const targetEl = getActiveAnalyticsTargetEl();
  let totalSideH;

  if (targetEl) {
    const targetRect = targetEl.getBoundingClientRect();
    const sideRect = sideCol.getBoundingClientRect();
    totalSideH = Math.round(targetRect.bottom - sideRect.top);
  } else {
    totalSideH = mainCol.offsetHeight || Math.round(mainCol.getBoundingClientRect().height);
  }

  if (totalSideH <= 0) return;

  // 2. Measure actual height of the Date Filter card
  let filterH = dateFilterCard.offsetHeight || Math.round(dateFilterCard.getBoundingClientRect().height);
  if (filterH <= 0) filterH = 420;

  // 3. Gap between member-card and date-filter-card in the right column
  const sideStyle = window.getComputedStyle(sideCol);
  const gap = parseFloat(sideStyle.rowGap || sideStyle.gap) || 24;

  // 4. Target member-card height so that:
  // memberCardHeight + gap + filterH === totalSideH
  // On Expenses & Income, this expands the member list so Date Filter matches the bottom of Row 2!
  const minMemberCardH = 140;
  const targetMemberH = Math.max(minMemberCardH, Math.round(totalSideH - filterH - gap));

  memberCard.style.height = `${targetMemberH}px`;

  // 5. Calculate available scrollable height for the member list inside the card
  const header = memberCard.querySelector('.side-card-header');
  const headerH = header ? (header.offsetHeight || Math.round(header.getBoundingClientRect().height)) : 38;
  const cardStyle = window.getComputedStyle(memberCard);
  const paddingTop = parseFloat(cardStyle.paddingTop) || 24;
  const paddingBottom = parseFloat(cardStyle.paddingBottom) || 24;
  const contentEl = memberCard.querySelector('.glass-card-content');
  const contentStyle = contentEl ? window.getComputedStyle(contentEl) : null;
  const contentGap = contentStyle ? (parseFloat(contentStyle.rowGap || contentStyle.gap) || 12) : 12;

  const listMaxH = Math.max(80, Math.floor(targetMemberH - headerH - paddingTop - paddingBottom - contentGap));
  memberList.style.maxHeight = `${listMaxH}px`;
}
window.syncMemberListHeight = requestSyncMemberListHeight;

async function loadChartData(period) {
  try {
    const data = await apiGet(`/transactions/dashboard/chart?period=${period}`);
    if (!data || !data.success) return;

    renderChart(data.data, period);
  } catch (error) {
    console.error('Chart load error:', error);
  }
}

function renderChart(chartData, period) {
  const canvas = document.getElementById('main-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (mainChart) {
    mainChart.destroy();
  }

  const labels = chartData.map(d => {
    if (period === 'year') {
      const [y, m] = d.label.split('-');
      return new Date(y, m - 1).toLocaleString('en', { month: 'short' });
    }
    return formatDate(d.label);
  });

  const incomeData = chartData.map(d => parseFloat(d.income) || 0);
  const expenseData = chartData.map(d => parseFloat(d.expenses) || 0);

  const gridColor = 'rgba(255,255,255,0.02)';
  const textColor = '#6B6B6B';

  const gradientIncome = ctx.createLinearGradient(0, 0, 0, 300);
  gradientIncome.addColorStop(0, 'rgba(211, 172, 119, 0.4)');
  gradientIncome.addColorStop(1, 'rgba(211, 172, 119, 0.0)');

  mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#d3ac77',
          backgroundColor: gradientIncome,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#d3ac77',
          pointBorderColor: '#0F0F0F',
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#d3ac77',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        },
        {
          label: 'Expenses',
          data: expenseData,
          borderColor: '#6B6B6B',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          fill: false,
          pointBackgroundColor: '#6B6B6B',
          pointBorderColor: '#0F0F0F',
          pointRadius: 3,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#6B6B6B',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: textColor,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { family: "'Inter', sans-serif", size: 12 }
          }
        },
        tooltip: {
          backgroundColor: '#1A1A1A',
          titleColor: '#FFFFFF',
          bodyColor: '#9A9A9A',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function(ctx) {
              return `${ctx.dataset.label}: ${formatPeso(ctx.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: textColor, font: { size: 11 } }
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: value => '₱' + value.toLocaleString()
          }
        }
      }
    }
  });
}


// =============================================
// FINANCIAL ANALYTICS SYSTEM
// =============================================

function dateToYMD(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCalDisplayDate(ymdStr) {
  if (!ymdStr) return '';
  const parts = ymdStr.split('-');
  if (parts.length < 3) return ymdStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  const monthShort = date.toLocaleString('en-US', { month: 'short' });
  return `${monthShort} ${d}, ${y}`;
}

function initAnalytics() {
  // Default to All-Time so user immediately sees financial data
  analyticsState.startDate = '';
  analyticsState.endDate = '';

  const initialQuickSelect = document.getElementById('filter-quick-select');
  if (initialQuickSelect) initialQuickSelect.value = 'all';

  // Initialize interactive financial date range calendar state
  calSelectedStart = null;
  calSelectedEnd = null;
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();
  initFinancialCalendar();

  // Tab buttons — instant switching from cached data
  document.querySelectorAll('.analytics-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const newTab = btn.dataset.tab;
      if (newTab === analyticsState.tab) return; // already on this tab

      document.querySelectorAll('.analytics-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      analyticsState.tab = newTab;

      // Toggle visibility: reports vs chart+analysis
      const chartContent = document.querySelector('.analytics-content');
      const reportsContent = document.getElementById('analytics-reports-content');
      const controlsRight = document.querySelector('.analytics-controls-right');
      const heatmapsOuterCard = document.getElementById('heatmaps-outer-card');
      const breakdownRow = document.getElementById('analytics-breakdown-row');

      const isBreakdownTab = newTab === 'expenses' || newTab === 'income';

      if (newTab === 'reports') {
        if (chartContent) chartContent.style.display = 'none';
        if (breakdownRow) breakdownRow.style.display = 'none';
        if (heatmapsOuterCard) heatmapsOuterCard.style.display = 'none';
        if (reportsContent) reportsContent.style.display = 'block';
        if (controlsRight) controlsRight.style.display = 'none';
      } else {
        if (chartContent) chartContent.style.display = '';
        if (reportsContent) reportsContent.style.display = 'none';
        if (controlsRight) controlsRight.style.display = '';
        if (breakdownRow) breakdownRow.style.display = isBreakdownTab ? '' : 'none';
        if (heatmapsOuterCard) heatmapsOuterCard.style.display = newTab === 'cashflow' ? '' : 'none';
      }

      // ── Instant tab switch: re-render from cached data without API call ──
      if (analyticsState.data) {
        // Update insight text for the new tab
        const data = analyticsState.data;
        if (data.insights) {
          data.insight = data.insights[analyticsState.tab] || data.insights.cashflow;
        }

        if (analyticsState.tab !== 'reports') {
          renderAnalyticsChart(data);
          renderAnalysisPanel(data);
          renderTabDependentSections(data);
        } else {
          if (breakdownRow) breakdownRow.style.display = 'none';
          if (heatmapsOuterCard) heatmapsOuterCard.style.display = 'none';
          renderReportsContent(data);
        }
        requestSyncMemberListHeight();
        return; // ← no network call
      }

      // Fallback: no cached data yet, fetch
      loadAnalyticsData();
    });
  });

  // Recent transactions "View All" link
  const recentViewAll = document.getElementById('analysis-recent-view-all');
  if (recentViewAll) {
    recentViewAll.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof navigateTo === 'function') navigateTo('records');
    });
  }

  // Chart type buttons
  document.querySelectorAll('.chart-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      analyticsState.chartType = btn.dataset.chartType;
      // Re-render without API call
      if (analyticsState.data) {
        renderAnalyticsChart(analyticsState.data);
      }
    });
  });

  // Quick select dropdown
  const quickSelect = document.getElementById('filter-quick-select');
  if (quickSelect) {
    quickSelect.addEventListener('change', () => {
      const val = quickSelect.value;
      const today = new Date();
      let start, end;

      switch (val) {
        case 'this-month':
          start = new Date(today.getFullYear(), today.getMonth(), 1);
          end = today;
          break;
        case 'last-month':
          start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          end = new Date(today.getFullYear(), today.getMonth(), 0);
          break;
        case 'this-year':
          start = new Date(today.getFullYear(), 0, 1);
          end = today;
          break;
        case 'last-7':
          start = new Date(today.getTime() - 6 * 86400000);
          end = today;
          break;
        case 'last-30':
          start = new Date(today.getTime() - 29 * 86400000);
          end = today;
          break;
        case 'last-90':
          start = new Date(today.getTime() - 89 * 86400000);
          end = today;
          break;
        case 'all':
          start = new Date(2020, 0, 1);
          end = today;
          break;
        case 'custom':
          return; // Let user pick manually
      }

      if (start && end) {
        const sStr = dateToYMD(start);
        const eStr = dateToYMD(end);
        if (startInput) startInput.value = sStr;
        if (endInput) endInput.value = eStr;
        calSelectedStart = sStr;
        calSelectedEnd = eStr;
        const [eY, eM] = eStr.split('-').map(Number);
        calViewYear = eY;
        calViewMonth = eM - 1;
        analyticsState.startDate = sStr;
        analyticsState.endDate = eStr;
        renderFinancialCalendar();
        loadAnalyticsData();
      }
    });
  }

  // Date inputs change → set quick select to custom
  if (startInput) {
    startInput.addEventListener('change', () => {
      if (quickSelect) quickSelect.value = 'custom';
      if (startInput.value) {
        calSelectedStart = startInput.value;
        if (calSelectedStart > calSelectedEnd) calSelectedEnd = calSelectedStart;
        analyticsState.startDate = calSelectedStart;
        analyticsState.endDate = calSelectedEnd;
        renderFinancialCalendar();
      }
    });
  }
  if (endInput) {
    endInput.addEventListener('change', () => {
      if (quickSelect) quickSelect.value = 'custom';
      if (endInput.value) {
        calSelectedEnd = endInput.value;
        if (calSelectedStart > calSelectedEnd) calSelectedStart = calSelectedEnd;
        analyticsState.startDate = calSelectedStart;
        analyticsState.endDate = calSelectedEnd;
        renderFinancialCalendar();
      }
    });
  }

  // Reset to All Time button
  const resetBtn = document.getElementById('filter-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const start = analyticsState.allTimeStart || '2020-01-01';
      const end = analyticsState.allTimeEnd || dateToYMD(new Date());

      analyticsState.startDate = start;
      analyticsState.endDate = end;
      calSelectedStart = start;
      calSelectedEnd = end;

      const startInput = document.getElementById('filter-start-date');
      const endInput = document.getElementById('filter-end-date');
      if (startInput) startInput.value = start;
      if (endInput) endInput.value = end;

      const startDisplay = document.getElementById('fin-cal-start-display');
      const endDisplay = document.getElementById('fin-cal-end-display');
      if (startDisplay) startDisplay.textContent = formatCalDisplayDate(start);
      if (endDisplay) endDisplay.textContent = formatCalDisplayDate(end);

      const [eY, eM] = end.split('-').map(Number);
      calViewYear = eY;
      calViewMonth = eM - 1;

      const quickSelect = document.getElementById('filter-quick-select');
      if (quickSelect) quickSelect.value = 'all';

      renderFinancialCalendar();
      loadAnalyticsData();
    });
  }

  // Apply filter button
  const applyBtn = document.getElementById('filter-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      if (calSelectedStart) analyticsState.startDate = calSelectedStart;
      else if (startInput && startInput.value) analyticsState.startDate = startInput.value;

      if (calSelectedEnd) analyticsState.endDate = calSelectedEnd;
      else if (endInput && endInput.value) analyticsState.endDate = endInput.value;

      const groupBySelect = document.getElementById('filter-group-by');
      if (groupBySelect) analyticsState.groupBy = groupBySelect.value;
      loadAnalyticsData();
    });
  }

  // View By select change
  const groupBySelect = document.getElementById('filter-group-by');
  if (groupBySelect) {
    groupBySelect.addEventListener('change', () => {
      analyticsState.groupBy = groupBySelect.value;
      loadAnalyticsData();
    });
  }

  // Load initial data
  loadAnalyticsData();
}

// =============================================
// INTERACTIVE FINANCIAL DATE RANGE CALENDAR
// =============================================

function initFinancialCalendar() {
  const prevMonthBtn = document.getElementById('fin-cal-prev-month');
  const nextMonthBtn = document.getElementById('fin-cal-next-month');

  const startBtn = document.getElementById('fin-cal-start-btn');
  const endBtn = document.getElementById('fin-cal-end-btn');

  // Endpoint selector click handlers: switch active endpoint
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      calActiveEndpoint = 'start';
      renderFinancialCalendar();
    });
  }

  if (endBtn) {
    endBtn.addEventListener('click', () => {
      calActiveEndpoint = 'end';
      renderFinancialCalendar();
    });
  }

  // Month navigation (automatically updates year when crossing December / January)
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      calViewMonth--;
      if (calViewMonth < 0) {
        calViewMonth = 11;
        calViewYear--;
      }
      renderFinancialCalendar();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      calViewMonth++;
      if (calViewMonth > 11) {
        calViewMonth = 0;
        calViewYear++;
      }
      renderFinancialCalendar();
    });
  }

  // Hide tooltip on scroll or clicking elsewhere
  window.addEventListener('scroll', hideCalendarTooltip, true);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.fin-cal-day-cell')) {
      hideCalendarTooltip();
    }
  });

  renderFinancialCalendar();
}

function updateCalendarActivityMap(transactions) {
  calendarActivityMap.clear();
  if (!Array.isArray(transactions)) return;

  transactions.forEach(tx => {
    if (!tx || !tx.date) return;
    const dateStr = String(tx.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

    let entry = calendarActivityMap.get(dateStr);
    if (!entry) {
      entry = { incomeCount: 0, expenseCount: 0 };
      calendarActivityMap.set(dateStr, entry);
    }

    if (tx.type === 'income') {
      entry.incomeCount++;
    } else if (tx.type === 'expense') {
      entry.expenseCount++;
    }
  });
}

function renderFinancialCalendar() {
  const monthYearDisplay = document.getElementById('fin-cal-month-year-display');
  const monthDisplay = document.getElementById('fin-cal-month-display');
  const yearDisplay = document.getElementById('fin-cal-year-display');
  const startValEl = document.getElementById('fin-cal-start-display');
  const endValEl = document.getElementById('fin-cal-end-display');
  const startBtn = document.getElementById('fin-cal-start-btn');
  const endBtn = document.getElementById('fin-cal-end-btn');
  const gridEl = document.getElementById('fin-cal-grid');

  if (!gridEl) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (monthYearDisplay) monthYearDisplay.textContent = `${monthNames[calViewMonth]} ${calViewYear}`;
  if (monthDisplay) monthDisplay.textContent = monthNames[calViewMonth] || '';
  if (yearDisplay) yearDisplay.textContent = String(calViewYear);

  // Update Start Date / End Date selector displays
  if (startValEl && calSelectedStart) {
    startValEl.textContent = formatCalDisplayDate(calSelectedStart);
  }
  if (endValEl && calSelectedEnd) {
    endValEl.textContent = formatCalDisplayDate(calSelectedEnd);
  }

  // Update active state on endpoint buttons
  if (startBtn) startBtn.classList.toggle('active', calActiveEndpoint === 'start');
  if (endBtn) endBtn.classList.toggle('active', calActiveEndpoint === 'end');

  gridEl.innerHTML = '';

  const firstDayIndex = new Date(calViewYear, calViewMonth, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calViewYear, calViewMonth, 0).getDate();

  const todayStr = dateToYMD(new Date());

  // Leading days from previous month
  const prevMonthIdx = calViewMonth === 0 ? 11 : calViewMonth - 1;
  const prevYear = calViewMonth === 0 ? calViewYear - 1 : calViewYear;
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const dateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const cell = createCalendarDayCell(dayNum, dateStr, true, todayStr);
    gridEl.appendChild(cell);
  }

  // Days in current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = createCalendarDayCell(d, dateStr, false, todayStr);
    gridEl.appendChild(cell);
  }

  // Trailing days from next month to complete the row
  const totalRendered = firstDayIndex + daysInMonth;
  const remaining = (7 - (totalRendered % 7)) % 7;
  const nextMonthIdx = calViewMonth === 11 ? 0 : calViewMonth + 1;
  const nextYear = calViewMonth === 11 ? calViewYear + 1 : calViewYear;
  for (let d = 1; d <= remaining; d++) {
    const dateStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = createCalendarDayCell(d, dateStr, true, todayStr);
    gridEl.appendChild(cell);
  }
}

function createCalendarDayCell(dayNum, dateStr, isOtherMonth, todayStr) {
  const cell = document.createElement('div');
  cell.className = 'fin-cal-day-cell';
  cell.dataset.date = dateStr;

  if (isOtherMonth) {
    cell.classList.add('other-month');
  }

  if (dateStr === todayStr) {
    cell.classList.add('today');
  }

  // Selection styling & active endpoint indicator
  if (calSelectedStart && calSelectedEnd) {
    if (calSelectedStart === calSelectedEnd && dateStr === calSelectedStart) {
      cell.classList.add('selected-single');
      cell.classList.add('endpoint-active');
    } else if (dateStr === calSelectedStart) {
      cell.classList.add('selected-start');
      if (calActiveEndpoint === 'start') {
        cell.classList.add('endpoint-active');
      }
    } else if (dateStr === calSelectedEnd) {
      cell.classList.add('selected-end');
      if (calActiveEndpoint === 'end') {
        cell.classList.add('endpoint-active');
      }
    } else if (dateStr > calSelectedStart && dateStr < calSelectedEnd) {
      cell.classList.add('in-range');
    }
  }

  // Day number
  const numSpan = document.createElement('span');
  numSpan.className = 'fin-cal-day-num';
  numSpan.textContent = String(dayNum);
  cell.appendChild(numSpan);

  // Activity indicator dots
  const act = calendarActivityMap.get(dateStr);
  const hasIncome = act && act.incomeCount > 0;
  const hasExpense = act && act.expenseCount > 0;

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'fin-cal-dots-wrap';

  if (hasIncome) {
    const dotInc = document.createElement('span');
    dotInc.className = 'fin-cal-dot fin-cal-dot-income';
    dotsWrap.appendChild(dotInc);
  }
  if (hasExpense) {
    const dotExp = document.createElement('span');
    dotExp.className = 'fin-cal-dot fin-cal-dot-expense';
    dotsWrap.appendChild(dotExp);
  }
  cell.appendChild(dotsWrap);

  // Event listeners
  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    handleCalendarDateClick(dateStr);
  });

  cell.addEventListener('mouseenter', (e) => {
    showCalendarTooltip(e, dateStr);
  });

  cell.addEventListener('mousemove', (e) => {
    positionCalendarTooltip(e);
  });

  cell.addEventListener('mouseleave', () => {
    hideCalendarTooltip();
  });

  return cell;
}

function handleCalendarDateClick(clickedDateStr) {
  // If clicked date belongs to another month/year, automatically navigate there
  const parts = clickedDateStr.split('-');
  const clickedY = parseInt(parts[0], 10);
  const clickedM = parseInt(parts[1], 10);
  if (clickedY !== calViewYear || clickedM - 1 !== calViewMonth) {
    calViewYear = clickedY;
    calViewMonth = clickedM - 1;
  }

  if (!calSelectedStart || !calSelectedEnd) {
    calSelectedStart = clickedDateStr;
    calSelectedEnd = clickedDateStr;
  } else {
    // Explicit Endpoint Editing Behavior
    if (calActiveEndpoint === 'start') {
      if (clickedDateStr <= calSelectedEnd) {
        // Case A & B: selected date is on or before End Date -> End Date unchanged
        calSelectedStart = clickedDateStr;
      } else {
        // Case C: selected date is after End Date -> reorder chronologically
        // Previous End Date becomes new Start Date, clicked date becomes new End Date
        calSelectedStart = calSelectedEnd;
        calSelectedEnd = clickedDateStr;
      }
    } else { // calActiveEndpoint === 'end'
      if (clickedDateStr >= calSelectedStart) {
        // Case A & B: selected date is on or after Start Date -> Start Date unchanged
        calSelectedEnd = clickedDateStr;
      } else {
        // Case C: selected date is before Start Date -> reorder chronologically
        // Previous Start Date becomes new End Date, clicked date becomes new Start Date
        calSelectedEnd = calSelectedStart;
        calSelectedStart = clickedDateStr;
      }
    }
  }

  // Update hidden inputs for backward compatibility
  const startInput = document.getElementById('filter-start-date');
  const endInput = document.getElementById('filter-end-date');
  if (startInput) startInput.value = calSelectedStart;
  if (endInput) endInput.value = calSelectedEnd;

  // Set quick select dropdown to 'custom'
  const quickSelect = document.getElementById('filter-quick-select');
  if (quickSelect) quickSelect.value = 'custom';

  // Update analyticsState dates
  analyticsState.startDate = calSelectedStart;
  analyticsState.endDate = calSelectedEnd;

  // Re-render calendar UI immediately (user clicks Apply Filter when ready)
  renderFinancialCalendar();
}

function showCalendarTooltip(e, dateStr) {
  const act = calendarActivityMap.get(dateStr);
  const tooltipEl = document.getElementById('fin-cal-tooltip');
  if (!tooltipEl) return;

  if (!act || (act.incomeCount === 0 && act.expenseCount === 0)) {
    tooltipEl.style.display = 'none';
    return;
  }

  let lines = [];
  if (act.incomeCount > 0) {
    const pl = act.incomeCount === 1 ? 'transaction' : 'transactions';
    lines.push(`<div class="fin-cal-tt-line income"><span class="fin-cal-dot fin-cal-dot-income"></span>Income: ${act.incomeCount} ${pl}</div>`);
  }
  if (act.expenseCount > 0) {
    const pl = act.expenseCount === 1 ? 'transaction' : 'transactions';
    lines.push(`<div class="fin-cal-tt-line expense"><span class="fin-cal-dot fin-cal-dot-expense"></span>Expenses: ${act.expenseCount} ${pl}</div>`);
  }

  tooltipEl.innerHTML = lines.join('');
  tooltipEl.style.display = 'block';
  positionCalendarTooltip(e);
}

function positionCalendarTooltip(e) {
  const tooltipEl = document.getElementById('fin-cal-tooltip');
  if (!tooltipEl || tooltipEl.style.display === 'none') return;
  tooltipEl.style.left = `${e.clientX}px`;
  tooltipEl.style.top = `${e.clientY - 12}px`;
}

function hideCalendarTooltip() {
  const tooltipEl = document.getElementById('fin-cal-tooltip');
  if (tooltipEl) tooltipEl.style.display = 'none';
}

async function loadAnalyticsData() {
  try {
    const cacheKey = `${analyticsState.startDate}_${analyticsState.endDate}_${analyticsState.groupBy}`;

    // Check cache first
    if (analyticsCache.has(cacheKey)) {
      const cached = analyticsCache.get(cacheKey);
      analyticsState.data = cached;

      // Update calendar activity dots with actual database records
      if (cached.calendarActivity) {
        updateCalendarActivityMap(cached.calendarActivity);
        renderFinancialCalendar();
      }

      // Update insight for the current tab
      if (cached.insights) {
        cached.insight = cached.insights[analyticsState.tab] || cached.insights.cashflow;
      }

      updateSummaryCards(cached.summary);
      if (analyticsState.tab !== 'reports') {
        renderAnalyticsChart(cached);
        renderAnalysisPanel(cached);
        renderTabDependentSections(cached);
      } else {
        const breakdownRow = document.getElementById('analytics-breakdown-row');
        const heatmapsOuterCard = document.getElementById('heatmaps-outer-card');
        if (breakdownRow) breakdownRow.style.display = 'none';
        if (heatmapsOuterCard) heatmapsOuterCard.style.display = 'none';
        renderReportsContent(cached);
      }
      return;
    }

    const params = new URLSearchParams({
      startDate: analyticsState.startDate || 'all',
      endDate: analyticsState.endDate || 'all',
      groupBy: analyticsState.groupBy,
      tab: analyticsState.tab
    });
    const data = await apiGet(`/transactions/dashboard/analytics?${params}`);
    if (!data || !data.success) return;
    analyticsState.data = data.data;

    // Store in cache
    analyticsCache.set(cacheKey, data.data);

    // Save allTimeRange from server response
    if (data.data.allTimeRange) {
      analyticsState.allTimeStart = data.data.allTimeRange.startDate;
      analyticsState.allTimeEnd = data.data.allTimeRange.endDate;
    }

    // Populate dates if default all-time
    if ((!analyticsState.startDate || !analyticsState.endDate) && data.data.allTimeRange) {
      analyticsState.startDate = data.data.allTimeRange.startDate;
      analyticsState.endDate = data.data.allTimeRange.endDate;
      calSelectedStart = analyticsState.startDate;
      calSelectedEnd = analyticsState.endDate;

      const startInput = document.getElementById('filter-start-date');
      const endInput = document.getElementById('filter-end-date');
      if (startInput) startInput.value = analyticsState.startDate;
      if (endInput) endInput.value = analyticsState.endDate;

      const startDisplay = document.getElementById('fin-cal-start-display');
      const endDisplay = document.getElementById('fin-cal-end-display');
      if (startDisplay) startDisplay.textContent = formatCalDisplayDate(analyticsState.startDate);
      if (endDisplay) endDisplay.textContent = formatCalDisplayDate(analyticsState.endDate);

      if (analyticsState.endDate) {
        const [eY, eM] = analyticsState.endDate.split('-').map(Number);
        calViewYear = eY;
        calViewMonth = eM - 1;
      }
    }

    // Update calendar activity dots with actual database records
    if (data.data.calendarActivity) {
      updateCalendarActivityMap(data.data.calendarActivity);
      renderFinancialCalendar();
    }

    // Sync heatmap year with the end date
    if (analyticsState.endDate) {
      const parsedYear = parseInt(analyticsState.endDate.slice(0, 4), 10);
      if (parsedYear && !isNaN(parsedYear)) {
        heatmapSelectedYear = parsedYear;
      }
    }

    // Update insight for the current tab
    if (data.data.insights) {
      data.data.insight = data.data.insights[analyticsState.tab] || data.data.insights.cashflow;
    }

    // Update top summary cards with filtered data
    updateSummaryCards(data.data.summary);

    // Render analytics chart
    if (analyticsState.tab !== 'reports') {
      renderAnalyticsChart(data.data);
      renderAnalysisPanel(data.data);
      renderTabDependentSections(data.data);
    } else {
      const breakdownRow = document.getElementById('analytics-breakdown-row');
      const heatmapsOuterCard = document.getElementById('heatmaps-outer-card');
      if (breakdownRow) breakdownRow.style.display = 'none';
      if (heatmapsOuterCard) heatmapsOuterCard.style.display = 'none';
      renderReportsContent(data.data);
    }
  } catch (err) {
    console.error('Analytics load error:', err);
  }
}

function updateSummaryCards(summary) {
  if (!summary) return;
  animateCounter('stat-income', summary.totalIncome);
  animateCounter('stat-expenses', summary.totalExpenses);
  animateCounter('stat-balance', summary.remainingBalance);
}

function formatChangePercent(change) {
  if (change === null || change === undefined) {
    return { text: 'N/A', cls: 'neutral' };
  }
  if (change === 0) {
    return { text: '0%', cls: 'neutral' };
  }
  const arrow = change > 0 ? '▲' : '▼';
  const sign = change > 0 ? '+' : '';
  return {
    text: `${arrow} ${sign}${change.toFixed(1)}% vs prev`,
    cls: change > 0 ? 'positive' : 'negative'
  };
}

function renderAnalyticsChart(data) {
  if (!data || !data.chart) return;

  const canvas = document.getElementById('analytics-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (analyticsChart) {
    analyticsChart.destroy();
    analyticsChart = null;
  }

  // Update chart title
  const titleEl = document.getElementById('analytics-chart-title');
  const legendEl = document.getElementById('analytics-chart-legend');
  const titles = {
    cashflow: 'Income vs Expenses',
    expenses: 'Expense Trends',
    income: 'Income Trends',
    reports: 'Financial Overview'
  };
  if (titleEl) titleEl.textContent = titles[analyticsState.tab] || 'Financial Chart';

  const labels = data.chart.map(d => {
    if (analyticsState.groupBy === 'month') {
      const [y, m] = d.label.split('-');
      return new Date(y, m - 1).toLocaleString('en', { month: 'short', year: '2-digit' });
    }
    if (analyticsState.groupBy === 'year') {
      return d.label;
    }
    return formatDate(d.label);
  });

  const gridColor = 'rgba(255,255,255,0.02)';
  const textColor = '#6B6B6B';
  const isBar = analyticsState.chartType === 'bar';
  const datasets = [];

  if (analyticsState.tab === 'cashflow') {
    // Income dataset
    if (isBar) {
      datasets.push({
        label: 'Income',
        data: data.chart.map(d => d.income),
        backgroundColor: 'rgba(52, 199, 89, 0.6)',
        borderColor: '#34C759',
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.7,
        categoryPercentage: 0.8
      });
      datasets.push({
        label: 'Expenses',
        data: data.chart.map(d => d.expenses),
        backgroundColor: 'rgba(255, 59, 92, 0.5)',
        borderColor: '#FF3B5C',
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.7,
        categoryPercentage: 0.8
      });
    } else {
      const gradIncome = ctx.createLinearGradient(0, 0, 0, 300);
      gradIncome.addColorStop(0, 'rgba(52, 199, 89, 0.3)');
      gradIncome.addColorStop(1, 'rgba(52, 199, 89, 0.0)');
      datasets.push({
        label: 'Income',
        data: data.chart.map(d => d.income),
        borderColor: '#34C759',
        backgroundColor: gradIncome,
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#34C759',
        pointBorderColor: '#0F0F0F',
        pointRadius: 3,
        pointHoverRadius: 5
      });
      datasets.push({
        label: 'Expenses',
        data: data.chart.map(d => d.expenses),
        borderColor: '#FF3B5C',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 5],
        tension: 0.4,
        fill: false,
        pointBackgroundColor: '#FF3B5C',
        pointBorderColor: '#0F0F0F',
        pointRadius: 3,
        pointHoverRadius: 5
      });
    }
    if (legendEl) {
      legendEl.innerHTML = `
        <div class="legend-item"><div class="legend-dot" style="background:#34C759;"></div>Income</div>
        <div class="legend-item"><div class="legend-dot" style="background:#FF3B5C;"></div>Expenses</div>
      `;
    }
  } else if (analyticsState.tab === 'expenses') {
    const chartData = data.chart.map(d => d.expenses);
    if (isBar) {
      datasets.push({
        label: 'Expenses',
        data: chartData,
        backgroundColor: 'rgba(255, 59, 92, 0.5)',
        borderColor: '#FF3B5C',
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.6
      });
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 300);
      grad.addColorStop(0, 'rgba(255, 59, 92, 0.25)');
      grad.addColorStop(1, 'rgba(255, 59, 92, 0.0)');
      datasets.push({
        label: 'Expenses',
        data: chartData,
        borderColor: '#FF3B5C',
        backgroundColor: grad,
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#FF3B5C',
        pointBorderColor: '#0F0F0F',
        pointRadius: 3,
        pointHoverRadius: 5
      });
    }
    if (legendEl) {
      legendEl.innerHTML = `<div class="legend-item"><div class="legend-dot" style="background:#FF3B5C;"></div>Expenses</div>`;
    }
  } else if (analyticsState.tab === 'income') {
    const chartData = data.chart.map(d => d.income);
    if (isBar) {
      datasets.push({
        label: 'Income',
        data: chartData,
        backgroundColor: 'rgba(52, 199, 89, 0.6)',
        borderColor: '#34C759',
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.6
      });
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 300);
      grad.addColorStop(0, 'rgba(52, 199, 89, 0.3)');
      grad.addColorStop(1, 'rgba(52, 199, 89, 0.0)');
      datasets.push({
        label: 'Income',
        data: chartData,
        borderColor: '#34C759',
        backgroundColor: grad,
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#34C759',
        pointBorderColor: '#0F0F0F',
        pointRadius: 3,
        pointHoverRadius: 5
      });
    }
    if (legendEl) {
      legendEl.innerHTML = `<div class="legend-item"><div class="legend-dot" style="background:#34C759;"></div>Income</div>`;
    }
  }

  analyticsChart = new Chart(ctx, {
    type: isBar ? 'bar' : 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: (window.PondoSyncPerf && window.PondoSyncPerf.isEnabled()) ? false : { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A1A1A',
          titleColor: '#FFFFFF',
          bodyColor: '#9A9A9A',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function(ctx) {
              return `${ctx.dataset.label}: ${formatPeso(ctx.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: textColor, font: { size: 11 }, maxRotation: 45 }
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: value => '₱' + value.toLocaleString()
          }
        }
      }
    }
  });

  // Sync member panel height now that the chart has rendered
  requestSyncMemberListHeight();

  // Handle breakdown chart (expenses/income tabs)
  if ((analyticsState.tab === 'expenses' || analyticsState.tab === 'income') && data.breakdown) {
    renderBreakdownChart(data.breakdown);
  }
}

function renderBreakdownChart(breakdown) {
  const canvas = document.getElementById('analytics-breakdown-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (breakdownChart) {
    breakdownChart.destroy();
    breakdownChart = null;
  }

  const titleEl = document.getElementById('analytics-breakdown-title');
  let items = [];
  if (analyticsState.tab === 'income' && breakdown.sources) {
    items = breakdown.sources;
    if (titleEl) titleEl.textContent = 'Income Source Breakdown';
  } else if (breakdown.categories) {
    items = breakdown.categories;
    if (titleEl) titleEl.textContent = 'Expense Category Breakdown';
  }

  if (items.length === 0) {
    breakdownChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No Data'],
        datasets: [{
          data: [1],
          backgroundColor: ['rgba(211, 172, 119, 0.08)'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
    return;
  }

  const labels = items.map(i => i.name);
  const data = items.map(i => i.total);
  const bgColors = [
    '#d3ac77', '#d28447', 'rgba(211, 172, 119, 0.6)',
    'rgba(210, 132, 71, 0.6)', 'rgba(211, 172, 119, 0.35)',
    '#5AC8FA', '#34C759', '#FF3B5C', '#FFB800', '#9b59b6'
  ];

  breakdownChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors.slice(0, data.length),
        borderWidth: 1,
        borderColor: '#111'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      animation: (window.PondoSyncPerf && window.PondoSyncPerf.isEnabled()) ? false : { duration: 600 },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: '#A0A0A0',
            font: { family: "'Inter', sans-serif", size: 11 },
            boxWidth: 10,
            usePointStyle: true,
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: '#1E1E1E',
          titleColor: '#E0E0E0',
          bodyColor: '#d3ac77',
          borderColor: 'rgba(211, 172, 119, 0.2)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return ' ₱' + context.parsed.toLocaleString('en-PH', { minimumFractionDigits: 2 });
            }
          }
        }
      }
    }
  });
}

function renderAnalysisPanel(data) {
  const metricsEl = document.getElementById('analysis-metrics');
  const insightEl = document.getElementById('analysis-insight-text');
  if (!metricsEl) return;

  let metricsHtml = '';

  if (analyticsState.tab === 'cashflow') {
    metricsHtml = buildMetricRow('trending-up', 'income', 'Total Income', formatPeso(data.summary.totalIncome), data.comparison.incomeChange);
    metricsHtml += buildMetricRow('trending-down', 'expense', 'Total Expenses', formatPeso(data.summary.totalExpenses), data.comparison.expensesChange);
    metricsHtml += buildMetricRow('wallet', 'balance', 'Net Balance', formatPeso(data.summary.netBalance), data.comparison.netBalanceChange);
  } else if (analyticsState.tab === 'expenses') {
    metricsHtml = buildMetricRow('trending-down', 'expense', 'Total Expenses', formatPeso(data.summary.totalExpenses), data.comparison.expensesChange);
    
    if (data.breakdown && data.breakdown.categories && data.breakdown.categories.length > 0) {
      const top = data.breakdown.categories[0];
      metricsHtml += buildMetricRow('tag', 'category', 'Highest Category', top.name, null);
    }
    if (data.topRecord) {
      metricsHtml += buildMetricRow('arrow-up-right', 'expense', 'Largest Expense', formatPeso(data.topRecord.amount), null, data.topRecord.label);
    }
  } else if (analyticsState.tab === 'income') {
    metricsHtml = buildMetricRow('trending-up', 'income', 'Total Income', formatPeso(data.summary.totalIncome), data.comparison.incomeChange);
    
    if (data.breakdown && data.breakdown.sources && data.breakdown.sources.length > 0) {
      const top = data.breakdown.sources[0];
      metricsHtml += buildMetricRow('star', 'source', 'Highest Source', top.name, null);
    }
    if (data.topRecord) {
      metricsHtml += buildMetricRow('arrow-up-right', 'income', 'Largest Income', formatPeso(data.topRecord.amount), null, data.topRecord.label);
    }
  }

  metricsEl.innerHTML = metricsHtml;

  // Update insight
  if (insightEl) {
    insightEl.textContent = data.insight || 'No data available.';
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function buildMetricRow(icon, iconClass, label, value, change, subtitle) {
  let changeHtml = '';
  if (change !== undefined && change !== null) {
    const chg = formatChangePercent(change);
    changeHtml = `<span class="analysis-metric-change ${chg.cls}">${chg.text}</span>`;
  } else if (change === null) {
    // explicitly null from API
  }

  const subtitleHtml = subtitle ? `<span style="font-size:0.7rem;color:var(--text-muted);">${subtitle}</span>` : '';

  return `
    <div class="analysis-metric">
      <div class="analysis-metric-left">
        <div class="analysis-metric-icon ${iconClass}">
          <i data-lucide="${icon}"></i>
        </div>
        <span class="analysis-metric-label">${label}</span>
      </div>
      <div class="analysis-metric-right">
        <span class="analysis-metric-value">${value}</span>
        ${subtitleHtml}
        ${changeHtml}
      </div>
    </div>
  `;
}

function renderReportsContent(data) {
  const bodyEl = document.getElementById('reports-body');
  const periodEl = document.getElementById('reports-period');
  if (!bodyEl) return;

  // Update period label
  if (periodEl) {
    periodEl.textContent = `${analyticsState.startDate} — ${analyticsState.endDate}`;
  }

  const summary = data.summary;
  const comparison = data.comparison;

  // Build observations
  const observations = [];
  if (summary.totalIncome > 0 || summary.totalExpenses > 0) {
    if (summary.netBalance >= 0) {
      observations.push(`Net surplus of ${formatPeso(summary.netBalance)} recorded this period.`);
    } else {
      observations.push(`Net deficit of ${formatPeso(Math.abs(summary.netBalance))} recorded this period.`);
    }

    if (comparison.incomeChange !== null && comparison.incomeChange !== 0) {
      const dir = comparison.incomeChange > 0 ? 'increased' : 'decreased';
      observations.push(`Income ${dir} by ${Math.abs(comparison.incomeChange).toFixed(1)}% compared to the previous period.`);
    }
    if (comparison.expensesChange !== null && comparison.expensesChange !== 0) {
      const dir = comparison.expensesChange > 0 ? 'increased' : 'decreased';
      observations.push(`Expenses ${dir} by ${Math.abs(comparison.expensesChange).toFixed(1)}% compared to the previous period.`);
    }

    observations.push(`Cumulative remaining balance as of ${analyticsState.endDate}: ${formatPeso(summary.remainingBalance)}.`);
  } else {
    observations.push('No transactions recorded in this period.');
  }

  bodyEl.innerHTML = `
    <div class="reports-summary-grid">
      <div class="reports-summary-item">
        <div class="reports-summary-label">Total Income</div>
        <div class="reports-summary-value income">${formatPeso(summary.totalIncome)}</div>
      </div>
      <div class="reports-summary-item">
        <div class="reports-summary-label">Total Expenses</div>
        <div class="reports-summary-value expense">${formatPeso(summary.totalExpenses)}</div>
      </div>
      <div class="reports-summary-item">
        <div class="reports-summary-label">Net Balance</div>
        <div class="reports-summary-value balance">${formatPeso(summary.netBalance)}</div>
      </div>
    </div>
    <div class="reports-observations">
      <h4>Key Observations</h4>
      <ul>
        ${observations.map(o => `<li>${o}</li>`).join('')}
      </ul>
    </div>
    <div class="analysis-insight">
      <div class="analysis-insight-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <span>Summary</span>
      </div>
      <p class="analysis-insight-text">${data.insight || 'No data available.'}</p>
    </div>
  `;

  requestSyncMemberListHeight();
}


// ============================================
// Tab-Dependent Sections: Heatmaps, Breakdown, Recent
// ============================================

function renderTabDependentSections(data) {
  const heatmapsOuterCard = document.getElementById('heatmaps-outer-card');
  const heatmapsSection = document.getElementById('financial-heatmaps-section');
  const breakdownRow = document.getElementById('analytics-breakdown-row');

  const isCashflow = analyticsState.tab === 'cashflow';
  const isBreakdownTab = analyticsState.tab === 'expenses' || analyticsState.tab === 'income';

  // Heatmaps: only on cashflow tab
  if (heatmapsOuterCard) heatmapsOuterCard.style.display = isCashflow ? '' : 'none';
  if (heatmapsSection) heatmapsSection.style.display = isCashflow ? '' : 'none';

  // Breakdown & Recent row: only on expenses/income tabs
  if (breakdownRow) breakdownRow.style.display = isBreakdownTab ? '' : 'none';

  if (isBreakdownTab) {
    if (data && data.breakdown) {
      renderBreakdownChart(data.breakdown);
    }
    if (data) {
      renderRecentTransactions(data);
    }
  }

  // Render heatmaps if on cashflow tab
  if (isCashflow && data && data.calendarActivity) {
    renderFinancialHeatmaps(data);
  }

  requestSyncMemberListHeight();
}

// ============================================
// GitHub-Style Yearly Financial Activity Heatmaps
// ============================================

// Dynamic extraction of unique years that have actual financial transaction data
function getAvailableHeatmapYears(calendarActivity) {
  const yearsSet = new Set();
  if (Array.isArray(calendarActivity)) {
    calendarActivity.forEach(tx => {
      if (tx && tx.date) {
        const yr = parseInt(String(tx.date).slice(0, 4), 10);
        if (!isNaN(yr) && yr > 1900 && yr < 2100) {
          yearsSet.add(yr);
        }
      }
    });
  }
  // If database contains no transactions, fallback to current year
  if (yearsSet.size === 0) {
    yearsSet.add(new Date().getFullYear());
  }
  // Sort descending: e.g. [2026, 2025, 2024, 2022] (GitHub contribution style)
  return Array.from(yearsSet).sort((a, b) => b - a);
}

function renderHeatmapYearSelector(availableYears, selectedYear) {
  const listEl = document.getElementById('heatmap-years-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  availableYears.forEach(year => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `heatmap-year-btn ${year === selectedYear ? 'active' : ''}`;
    btn.dataset.year = year;
    btn.textContent = year;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', year === selectedYear ? 'true' : 'false');
    btn.setAttribute('aria-label', `Year ${year}`);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (heatmapSelectedYear === year) return;
      heatmapSelectedYear = year;

      // Update active states
      listEl.querySelectorAll('.heatmap-year-btn').forEach(b => {
        const isActive = parseInt(b.dataset.year, 10) === heatmapSelectedYear;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Keep selected year visible within scroll container
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      // Re-render both Income Activity and Expense Activity heatmaps for selected year
      if (analyticsState.data && analyticsState.data.calendarActivity) {
        renderYearlyHeatmap('income', analyticsState.data.calendarActivity, 'heatmap-income-wrap', heatmapSelectedYear);
        renderYearlyHeatmap('expense', analyticsState.data.calendarActivity, 'heatmap-expense-wrap', heatmapSelectedYear);
      }
    });

    listEl.appendChild(btn);
  });

  // Ensure active year button is scrolled into view
  const activeBtn = listEl.querySelector('.heatmap-year-btn.active');
  if (activeBtn) {
    activeBtn.scrollIntoView({ block: 'nearest' });
  }
}

function updateHeatmapYearDisplay() {
  const yearEl = document.getElementById('heatmap-year-display');
  if (yearEl) yearEl.textContent = heatmapSelectedYear;

  const listEl = document.getElementById('heatmap-years-list');
  if (listEl) {
    listEl.querySelectorAll('.heatmap-year-btn').forEach(b => {
      const isActive = parseInt(b.dataset.year, 10) === heatmapSelectedYear;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }
}

function renderFinancialHeatmaps(data) {
  const activity = (data && data.calendarActivity) || [];
  const availableYears = getAvailableHeatmapYears(activity);

  // If current heatmapSelectedYear is not in available years, pick matching end date or latest available
  if (!availableYears.includes(heatmapSelectedYear)) {
    if (analyticsState.endDate) {
      const parsedYear = parseInt(analyticsState.endDate.slice(0, 4), 10);
      if (availableYears.includes(parsedYear)) {
        heatmapSelectedYear = parsedYear;
      } else {
        heatmapSelectedYear = availableYears[0];
      }
    } else {
      heatmapSelectedYear = availableYears[0];
    }
  }

  updateHeatmapYearDisplay();
  renderHeatmapYearSelector(availableYears, heatmapSelectedYear);

  renderYearlyHeatmap('income', activity, 'heatmap-income-wrap', heatmapSelectedYear);
  renderYearlyHeatmap('expense', activity, 'heatmap-expense-wrap', heatmapSelectedYear);
}

function renderYearlyHeatmap(type, allActivity, containerId, year) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const summaryEl = document.getElementById(`heatmap-${type}-summary`);

  // Build daily aggregate map for this year
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDaysInYear = isLeap ? 366 : 365;
  const jan1 = new Date(year, 0, 1);
  const startDay = jan1.getDay(); // 0 = Sunday

  const dateMap = {};
  let yearTotal = 0;
  let yearCount = 0;

  // Initialize all days of the year
  for (let offset = 0; offset < totalDaysInYear; offset++) {
    const curDate = new Date(year, 0, 1 + offset);
    const dateStr = `${year}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${String(curDate.getDate()).padStart(2, '0')}`;
    dateMap[dateStr] = { count: 0, total: 0 };
  }

  // Filter transactions for this type and year
  const yearPrefix = `${year}-`;
  allActivity.forEach(tx => {
    if (tx.type !== type) return;
    const txDate = (tx.date || '').slice(0, 10);
    if (!txDate.startsWith(yearPrefix)) return;

    const amt = parseFloat(tx.amount) || 0;
    if (dateMap[txDate]) {
      dateMap[txDate].count++;
      dateMap[txDate].total += amt;
    } else {
      dateMap[txDate] = { count: 1, total: amt };
    }
    yearTotal += amt;
    yearCount++;
  });

  // Update summary badge: e.g. "29 income transactions (₱83,582.09)"
  if (summaryEl) {
    const word = yearCount === 1 ? 'transaction' : 'transactions';
    summaryEl.textContent = `${yearCount} ${type} ${word} (${formatPeso(yearTotal)})`;
  }

  // Find max daily amount for consistent intensity scaling across the year
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

  // 1. Build Month Row Header (53 columns)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthCols = {};
  for (let m = 0; m < 12; m++) {
    const firstDate = new Date(year, m, 1);
    const diffDays = Math.round((firstDate - jan1) / 86400000);
    const weekCol = Math.floor((diffDays + startDay) / 7);
    monthCols[weekCol] = monthNames[m];
  }

  let monthsHtml = `
    <div class="heatmap-months-row">
      <div class="heatmap-months-track">`;
  for (let col = 0; col < 53; col++) {
    if (monthCols[col]) {
      monthsHtml += `<span class="heatmap-month-label" style="grid-column: ${col + 1};">${monthCols[col]}</span>`;
    }
  }
  monthsHtml += `
      </div>
    </div>`;

  // Weekday labels removed per design requirement

  // 3. Build Cells Grid (53 columns x 7 rows)
  let cellsHtml = `<div class="heatmap-cells-grid">`;
  for (let col = 0; col < 53; col++) {
    for (let row = 0; row < 7; row++) {
      const offset = col * 7 + row - startDay;
      if (offset < 0 || offset >= totalDaysInYear) {
        cellsHtml += `<div class="heatmap-cell empty"></div>`;
      } else {
        const curDate = new Date(year, 0, 1 + offset);
        const curDateStr = `${year}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${String(curDate.getDate()).padStart(2, '0')}`;
        const dayData = dateMap[curDateStr] || { count: 0, total: 0 };
        const levelClass = getIntensityLevel(dayData.total);

        // Only dim dates if the selected year is the one currently active in the dashboard filter range
        let isOutOfFilter = false;
        const filterStartYear = analyticsState.startDate ? parseInt(analyticsState.startDate.slice(0, 4), 10) : null;
        const filterEndYear = analyticsState.endDate ? parseInt(analyticsState.endDate.slice(0, 4), 10) : null;
        if (year === filterStartYear || year === filterEndYear) {
          if (analyticsState.startDate && curDateStr < analyticsState.startDate) isOutOfFilter = true;
          if (analyticsState.endDate && curDateStr > analyticsState.endDate) isOutOfFilter = true;
        }
        const filterClass = isOutOfFilter ? 'out-of-filter' : '';

        cellsHtml += `<div class="heatmap-cell ${levelClass} ${filterClass}" data-date="${curDateStr}" data-type="${type}" data-count="${dayData.count}" data-total="${dayData.total.toFixed(2)}" tabindex="0" role="button" aria-label="${curDateStr}"></div>`;
      }
    }
  }
  cellsHtml += `</div>`;

  // Assemble full heatmap HTML
  container.innerHTML = `
    ${monthsHtml}
    <div class="heatmap-main-row">
      ${cellsHtml}
    </div>
  `;

  // Attach hover & keyboard focus tooltip listeners to all valid cells
  container.querySelectorAll('.heatmap-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('mouseenter', e => showHeatmapTooltip(e, cell));
    cell.addEventListener('mousemove', e => positionHeatmapTooltip(cell));
    cell.addEventListener('mouseleave', hideHeatmapTooltip);
    cell.addEventListener('focus', e => showHeatmapTooltip(e, cell));
    cell.addEventListener('blur', hideHeatmapTooltip);
  });
}

// Tooltip helpers
function showHeatmapTooltip(e, cell) {
  const tooltip = document.getElementById('heatmap-tooltip');
  if (!tooltip) return;

  const dateStr = cell.dataset.date;
  const type = cell.dataset.type;
  const count = parseInt(cell.dataset.count, 10) || 0;
  const total = parseFloat(cell.dataset.total) || 0;

  // Format date: e.g. "November 16, 2026"
  const [yr, mo, da] = dateStr.split('-');
  const d = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, parseInt(da, 10));
  const fullDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  let bodyHtml = '';
  if (count > 0) {
    const txWord = count === 1 ? 'transaction' : 'transactions';
    if (type === 'income') {
      bodyHtml = `
        <div class="heatmap-tt-date">${fullDate}</div>
        <div class="heatmap-tt-count">${count} income ${txWord}</div>
        <div class="heatmap-tt-amount income">${formatPeso(total)} total income</div>
      `;
    } else {
      bodyHtml = `
        <div class="heatmap-tt-date">${fullDate}</div>
        <div class="heatmap-tt-count">${count} expense ${txWord}</div>
        <div class="heatmap-tt-amount expense">${formatPeso(total)} total expenses</div>
      `;
    }
  } else {
    if (type === 'income') {
      bodyHtml = `
        <div class="heatmap-tt-date">${fullDate}</div>
        <div class="heatmap-tt-empty">No income transactions</div>
      `;
    } else {
      bodyHtml = `
        <div class="heatmap-tt-date">${fullDate}</div>
        <div class="heatmap-tt-empty">No expense transactions</div>
      `;
    }
  }

  tooltip.innerHTML = bodyHtml;
  tooltip.style.display = 'block';
  tooltip.classList.add('visible');

  positionHeatmapTooltip(cell);
}

function positionHeatmapTooltip(cell) {
  const tooltip = document.getElementById('heatmap-tooltip');
  if (!tooltip || !tooltip.classList.contains('visible')) return;

  const rect = cell.getBoundingClientRect();
  const ttRect = tooltip.getBoundingClientRect();

  let left = rect.left + (rect.width / 2) - (ttRect.width / 2);
  let top = rect.top - ttRect.height - 8;

  // If clipped at top of viewport, flip below cell
  if (top < 10) {
    top = rect.bottom + 8;
  }
  // Keep horizontally within viewport bounds
  left = Math.max(10, Math.min(left, window.innerWidth - ttRect.width - 10));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideHeatmapTooltip() {
  const tooltip = document.getElementById('heatmap-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('visible');
  tooltip.style.display = 'none';
}

// ============================================
// Recent Transactions (Income/Expenses tabs)
// ============================================

function renderRecentTransactions(data) {
  const titleEl = document.getElementById('analysis-recent-title');
  const listEl = document.getElementById('analysis-recent-list');
  if (!listEl) return;

  let items = [];
  let title = 'Recent Transactions';

  if (analyticsState.tab === 'income') {
    title = 'Recent Income';
    items = (data.recentTransactions && data.recentTransactions.income) || [];
  } else if (analyticsState.tab === 'expenses') {
    title = 'Recent Expenses';
    items = (data.recentTransactions && data.recentTransactions.expenses) || [];
  }

  if (titleEl) titleEl.textContent = title;

  if (items.length === 0) {
    listEl.innerHTML = '<div class="analysis-recent-empty" style="color:var(--text-muted);font-size:0.8rem;padding:8px 0;">No recent transactions</div>';
    return;
  }

  let html = '';
  items.forEach(tx => {
    const label = escapeHtml(tx.label || tx.source || tx.category || tx.description || 'Transaction');
    const amount = parseFloat(tx.amount || 0);
    const dateStr = tx.date ? formatDate(tx.date) : '';
    const colorClass = analyticsState.tab === 'income' ? 'recent-income' : 'recent-expense';

    html += `
      <div class="analysis-recent-item">
        <div class="analysis-recent-left">
          <span class="analysis-recent-label">${label}</span>
          <span class="analysis-recent-date">${dateStr}</span>
        </div>
        <span class="analysis-recent-amount ${colorClass}">${formatPeso(amount)}</span>
      </div>
    `;
  });

  listEl.innerHTML = html;
}
