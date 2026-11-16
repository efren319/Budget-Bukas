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
let analyticsState = {
  tab: 'cashflow',
  chartType: 'bar',
  startDate: null,
  endDate: null,
  groupBy: 'month',
  data: null
};

/**
 * Smoothly animates a number element from 0 to its target value (Philippine Peso format).
 */
function animateCounter(elementId, targetValue, duration = 1200) {
  const el = document.getElementById(elementId);
  if (!el) return;

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
}

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

function initAnalytics() {
  // Set default dates (current month)
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  analyticsState.startDate = `${y}-${m}-01`;
  analyticsState.endDate = `${y}-${m}-${d}`;

  // Populate date filter inputs
  const startInput = document.getElementById('filter-start-date');
  const endInput = document.getElementById('filter-end-date');
  if (startInput) startInput.value = analyticsState.startDate;
  if (endInput) endInput.value = analyticsState.endDate;

  // Tab buttons
  document.querySelectorAll('.analytics-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.analytics-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      analyticsState.tab = btn.dataset.tab;

      // Toggle visibility: reports vs chart+analysis
      const chartContent = document.querySelector('.analytics-content');
      const reportsContent = document.getElementById('analytics-reports-content');
      const chartTypeSelector = document.querySelector('.chart-type-selector');

      if (analyticsState.tab === 'reports') {
        if (chartContent) chartContent.style.display = 'none';
        if (reportsContent) reportsContent.style.display = 'block';
        if (chartTypeSelector) chartTypeSelector.style.display = 'none';
      } else {
        if (chartContent) chartContent.style.display = '';
        if (reportsContent) reportsContent.style.display = 'none';
        if (chartTypeSelector) chartTypeSelector.style.display = '';
      }

      loadAnalyticsData();
    });
  });

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
        const fmt = d => d.toISOString().slice(0, 10);
        if (startInput) startInput.value = fmt(start);
        if (endInput) endInput.value = fmt(end);
      }
    });
  }

  // Date inputs change → set quick select to custom
  if (startInput) {
    startInput.addEventListener('change', () => {
      if (quickSelect) quickSelect.value = 'custom';
    });
  }
  if (endInput) {
    endInput.addEventListener('change', () => {
      if (quickSelect) quickSelect.value = 'custom';
    });
  }

  // Apply filter button
  const applyBtn = document.getElementById('filter-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      if (startInput) analyticsState.startDate = startInput.value;
      if (endInput) analyticsState.endDate = endInput.value;
      const groupBySelect = document.getElementById('filter-group-by');
      if (groupBySelect) analyticsState.groupBy = groupBySelect.value;
      loadAnalyticsData();
    });
  }

  // Load initial data
  loadAnalyticsData();
}

async function loadAnalyticsData() {
  try {
    const params = new URLSearchParams({
      startDate: analyticsState.startDate,
      endDate: analyticsState.endDate,
      groupBy: analyticsState.groupBy,
      tab: analyticsState.tab
    });
    const data = await apiGet(`/transactions/dashboard/analytics?${params}`);
    if (!data || !data.success) return;
    analyticsState.data = data.data;

    // Update top summary cards with filtered data
    updateSummaryCards(data.data.summary);

    // Render analytics chart
    if (analyticsState.tab !== 'reports') {
      renderAnalyticsChart(data.data);
      renderAnalysisPanel(data.data);
    } else {
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
      animation: { duration: 600, easing: 'easeOutQuart' },
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

  // Handle breakdown chart (expenses/income tabs)
  const breakdownSection = document.getElementById('analytics-breakdown-section');
  if ((analyticsState.tab === 'expenses' || analyticsState.tab === 'income') && data.breakdown) {
    if (breakdownSection) breakdownSection.style.display = 'block';
    renderBreakdownChart(data.breakdown);
  } else {
    if (breakdownSection) breakdownSection.style.display = 'none';
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
  if (breakdown.categories) {
    items = breakdown.categories;
    if (titleEl) titleEl.textContent = 'Expense Category Breakdown';
  } else if (breakdown.sources) {
    items = breakdown.sources;
    if (titleEl) titleEl.textContent = 'Income Source Breakdown';
  }

  if (items.length === 0) return;

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
      animation: { duration: 600 },
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
}
