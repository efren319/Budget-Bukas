// ============================================
// Global Config — Environment and URIs
// ============================================

// Vercel handles env injection; fallback for local/direct deploy
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? "http://localhost:3000/api" : "https://budgetbukas-api.onrender.com/api";

// Attach to window for global access
window.API_URL = API_URL;
