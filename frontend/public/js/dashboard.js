// ============================================
// Dashboard.js — Stats, Charts, Activity
// ============================================

let mainChart = null;
let pieChart = null;
let currentDashboardDataStr = null;
let pollingInterval = null;

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

async function loadDashboardData() {
  try {
    const data = await apiGet('/transactions/dashboard/stats');
    if (!data || !data.success) return;

    // Save initial state for polling comparison
    currentDashboardDataStr = JSON.stringify(data.data);

    const { balance, monthly, recent, categories } = data.data;

    // Update stat cards
    document.getElementById('stat-income').textContent = formatPeso(balance.total_income);
    document.getElementById('stat-expenses').textContent = formatPeso(balance.total_expenses);
    document.getElementById('stat-balance').textContent = formatPeso(balance.remaining_balance);

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
          backgroundColor: ['rgba(212, 175, 55, 0.1)'],
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
    'rgba(212, 175, 55, 1)',   // Solid Gold
    'rgba(212, 175, 55, 0.7)', // Faded Gold
    'rgba(212, 175, 55, 0.4)', // Dim Gold
    'rgba(212, 175, 55, 0.2)', // Light Gold Trace
    'rgba(168, 137, 36, 1)'    // Darker Gold
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
          bodyColor: '#D4AF37',
          borderColor: 'rgba(212,175,55,0.2)',
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

  if (!members || members.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No members found</div>';
    return;
  }

  container.innerHTML = members.map(member => {
    const avatarHtml = member.avatar_url 
      ? `<img src="/api/auth/avatar/${member.avatar_url}" alt="${member.name}">`
      : `<i data-lucide="user"></i>`;
      
    const roleClass = member.role === 'officer' ? 'officer' : '';

    return `
      <div class="member-item">
        <div class="member-avatar">
          ${avatarHtml}
        </div>
        <div class="member-info">
          <span class="member-name">${member.name}</span>
          <span class="member-role ${roleClass}">${member.role}</span>
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
  gradientIncome.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
  gradientIncome.addColorStop(1, 'rgba(212, 175, 55, 0.0)');

  mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#D4AF37',
          backgroundColor: gradientIncome,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#D4AF37',
          pointBorderColor: '#0F0F0F',
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#D4AF37',
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
