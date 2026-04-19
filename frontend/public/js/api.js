// ============================================
// API Wrapper — Centralized fetch utility
// ============================================

// API base URL — uses env-based URL in production, relative in dev
const API_BASE = window.API_URL || 'http://localhost:10000';

/**
 * Make an authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('bb_token');

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  // Add auth token if available
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  // Remove Content-Type for FormData (let browser set it)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);

    // Handle 401 — redirect to login
    if (response.status === 401) {
      localStorage.removeItem('bb_token');
      localStorage.removeItem('bb_user');
      window.location.href = '/';
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.errors?.[0]?.msg || 'Request failed');
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

/**
 * GET request
 */
function apiGet(endpoint) {
  return apiRequest(endpoint, { method: 'GET' });
}

/**
 * POST request with JSON body
 */
function apiPost(endpoint, body) {
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

/**
 * PUT request with JSON body
 */
function apiPut(endpoint, body) {
  return apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

/**
 * DELETE request
 */
function apiDelete(endpoint) {
  return apiRequest(endpoint, { method: 'DELETE' });
}

/**
 * POST with FormData (file uploads)
 */
function apiUpload(endpoint, formData) {
  return apiRequest(endpoint, {
    method: 'POST',
    body: formData
  });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconMap = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${iconMap[type] || ''}
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/**
 * Format number to Philippine Peso
 */
function formatPeso(amount) {
  return '₱' + parseFloat(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format date string
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Get current user from localStorage
 */
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('bb_user'));
  } catch {
    return null;
  }
}

/**
 * Check if current user is an officer
 */
function isOfficer() {
  const user = getCurrentUser();
  return user && user.role === 'officer';
}
