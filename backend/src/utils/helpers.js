// ============================================
// Helpers — Shared utility functions
// ============================================

/**
 * Format number to Philippine Peso string
 */
function formatPeso(amount) {
  return '₱' + parseFloat(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format date to readable string
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Sanitize string input
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

module.exports = { formatPeso, formatDate, sanitize };
