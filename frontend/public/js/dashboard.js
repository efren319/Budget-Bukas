// ============================================
// Dashboard.js — Stats, Charts, Activity
// ============================================

let mainChart = null;
let pieChart = null;
let currentDashboardDataStr = null;
let pollingInterval = null;

/**
 * Smoothly animates a number element from 0 to its target value (Philippine Peso format).
 * @param {string} elementId - The ID of the element to animate.
 * @param {number} targetValue - The final numeric value to count up to.
 * @param {number} duration - Animation duration in ms (default 1200ms).
 */
function animateCounter(elementId, targetValue, duration = 1200) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const start = performance.now();
  const target = parseFloat(targetValue) || 0;
  const isNegative = target < 0;
  const absTarget = Math.abs(target);

  // Easing: ease-out cubic
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);
    const current = absTarget * easedProgress;

    // Format with Philippine Peso sign
    const formatted = '₱' + current.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    el.textContent = (isNegative ? '-' : '') + formatted;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      // Ensure final value is exactly right using the shared formatter
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

  // Filter pills
  const pills = document.querySelectorAll('#chart-filters .pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      loadChartData(pill.dataset.period);
    });
  });

  // Start Live Update Polling (every 15 seconds)
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(pollForUpdates, 15000);
}

/**
 * Replaces a skeleton placeholder with real content using a smooth transition
 */
function revealContent(elementId, skeletonSelector) {
  const element = document.getElementById(elementId);
  if (!element) return;

  // Find and remove skeletons associated with this element
  const parent = element.parentElement;
  if (parent) {
    const skeletons = parent.querySelectorAll(skeletonSelector || '.skeleton');
    skeletons.forEach(s => {
      s.classList.add('content-fade-out');
      setTimeout(() => s.remove(), 400);
    });

    // Remove loading state from parent/grandparent if exists
    const container = element.closest('.loading-state');
    if (container) {
      setTimeout(() => container.classList.remove('loading-state'), 300);
    }
  }

  // Show the actual element with a fade-in animation
  element.style.display = '';
  element.classList.add('content-fade-in');
}

async function loadDashboardData() {
  try {
    const data = await apiGet('/transactions/dashboard/stats');
    if (!data || !data.success) return;

    // Save initial state for polling comparison
    currentDashboardDataStr = JSON.stringify(data.data);

    const { balance, monthly, recent, categories } = data.data;

    // Reveal stat cards and charts (hiding skeletons)
    revealContent('stat-income');
    revealContent('stat-expenses');
    revealContent('stat-balance');
    revealContent('main-chart');
    
    // Update stat cards with smooth count-up animation
    animateCounter('stat-income', balance.total_income);
    animateCounter('stat-expenses', balance.total_expenses);
    animateCounter('stat-balance', balance.remaining_balance);
    
    const chartSkeleton = document.querySelector('#main-chart-container .skeleton');
    if (chartSkeleton) {
      chartSkeleton.classList.add('content-fade-out');
      setTimeout(() => chartSkeleton.remove(), 400);
    }

    // Render recent activity
    renderRecentActivity(recent);

    // Render category breakdown
    renderCategoryBreakdown(categories);

    // Render pie chart
    renderCategoryPieChart(categories);

    // Load chart
    loadChartData('week');
    
    // Signal that dashboard data is ready
    window.dispatchEvent(new Event('dashboard-data-loaded'));
  } catch (error) {
    console.error('Dashboard load error:', error);
    // Signal anyway to prevent infinite loading
    window.dispatchEvent(new Event('dashboard-data-loaded'));
  }
}

async function pollForUpdates() {
  try {
    const data = await apiGet('/transactions/dashboard/stats');
    if (!data || !data.success) return;
    
    const newDataStr = JSON.stringify(data.data);
    
    // Compare stringified data to detect changes (budget, counts, etc.)
    if (currentDashboardDataStr && currentDashboardDataStr !== newDataStr) {
      const toast = document.getElementById('live-update-toast');
      if (toast && toast.classList.contains('hidden')) {
        toast.classList.remove('hidden');
      }
    }
  } catch (err) {
    // Ignore polling errors to prevent console spam
  }
}

function renderRecentActivity(items) {
  const container = document.getElementById('recent-activity');
  if (!container) return;

  // Reveal panel
  const panel = container.closest('.loading-state');
  if (panel) panel.classList.remove('loading-state');

  // Add fade-in for real content
  container.classList.add('content-fade-in');

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No recent activity</div>';
    return;
  }

  // LIMIT TO LATEST 2 RECORDS
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

  // Reveal panel
  const panel = container.closest('.loading-state');
  if (panel) panel.classList.remove('loading-state');

  container.classList.add('content-fade-in');

  if (!categories || categories.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No data yet</div>';
    return;
  }

  const maxTotal = Math.max(...categories.map(c => parseFloat(c.total)));

  // LIMIT TO TOP 2 CATEGORIES
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

  // Handle skeleton removal
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
    // Render empty state chart
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
  
  // Theme colors derived from CSS variables (Gold & Brown Dark Tones)
  const bgColors = [
    'rgba(211, 172, 119, 1)',   // Solid Gold
    'rgba(211, 172, 119, 0.7)', // Faded Gold
    'rgba(211, 172, 119, 0.4)', // Dim Gold
    'rgba(211, 172, 119, 0.2)', // Light Gold Trace
    'rgba(210, 132, 71, 1)'    // Darker Gold (#d28447)
  ];

  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors.slice(0, data.length),
        borderWidth: 1,
        borderColor: '#111' // Matches dark theme background
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%', // smooth and modern
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: '#A0A0A0', // --text-secondary approx
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
    renderMembers(data.data);
  } catch (error) {
    console.error('Members fetch error:', error);
    renderMembers([]);
  }
}

function renderMembers(members) {
  const container = document.getElementById('members-list');
  if (!container) return;

  // Add fade-in for real content
  container.classList.add('content-fade-in');

  if (!members || members.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No members found</div>';
    return;
  }

  container.innerHTML = members.map(member => {
    // Always use user ID — backend always returns photo or initials SVG
    const avatarHtml = `<img src="${API_BASE}/auth/avatar/${member.id}?t=${Date.now()}" class="user-avatar-${member.id}" alt="${member.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      
    const roleClass = member.role === 'admin' ? 'badge-primary' : 'badge-secondary';

    return `
      <div class="member-item">
        <div class="member-avatar">
          ${avatarHtml}
        </div>
        <div class="member-info">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span class="member-name">${member.name}</span>
            <span class="badge ${roleClass}" style="font-size: 0.6rem; padding: 2px 6px;">${member.role}</span>
          </div>
          <span class="member-role" style="color: var(--text-secondary); font-size: 0.75rem;">${member.position || '—'}</span>
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

  // Destroy existing chart
  if (mainChart) {
    mainChart.destroy();
  }

  const labels = chartData.map(d => {
    if (period === 'year') {
      // Format YYYY-MM to month name
      const [y, m] = d.label.split('-');
      return new Date(y, m - 1).toLocaleString('en', { month: 'short' });
    }
    return formatDate(d.label);
  });

  const incomeData = chartData.map(d => parseFloat(d.income) || 0);
  const expenseData = chartData.map(d => parseFloat(d.expenses) || 0);

  // Dark mode defaults
  const gridColor = 'rgba(255,255,255,0.02)';
  const textColor = '#6B6B6B';

  // Create gradient for Income
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
