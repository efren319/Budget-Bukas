// ============================================
// Dashboard.js — Stats, Charts, Activity
// ============================================

let mainChart = null;

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
}

async function loadDashboardData() {
  try {
    const data = await apiGet('/transactions/dashboard/stats');
    if (!data || !data.success) return;

    const { balance, monthly, recent, categories } = data.data;

    // Update stat cards
    document.getElementById('stat-income').textContent = formatPeso(balance.total_income);
    document.getElementById('stat-expenses').textContent = formatPeso(balance.total_expenses);
    document.getElementById('stat-balance').textContent = formatPeso(balance.remaining_balance);

    // Render recent activity
    renderRecentActivity(recent);

    // Render category breakdown
    renderCategoryBreakdown(categories);

    // Load chart
    loadChartData('week');
  } catch (error) {
    console.error('Dashboard load error:', error);
  }
}

function renderRecentActivity(items) {
  const container = document.getElementById('recent-activity');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state-small">No recent activity</div>';
    return;
  }

  container.innerHTML = items.map(item => {
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

  container.innerHTML = categories.map(cat => {
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

  // Get theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.04)';
  const textColor = isDark ? '#6B6B6B' : '#555555';

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
          backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
          titleColor: isDark ? '#FFFFFF' : '#1A1A1A',
          bodyColor: isDark ? '#9A9A9A' : '#555555',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
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
