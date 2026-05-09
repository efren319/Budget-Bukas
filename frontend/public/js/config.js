// ============================================
// Global Config — Environment and URIs
// ============================================

// Detect environment to pick the correct API base
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isRender = window.location.hostname.includes('onrender.com');

// Local dev → localhost backend
// Render → same-origin /api (backend serves frontend)
// Vercel/other → full Render backend URL
let API_URL;
if (isLocal) {
  API_URL = "http://localhost:10000/api";
} else if (isRender) {
  API_URL = "/api";
} else {
  API_URL = "https://budgetbukas-api.onrender.com/api";
}

// Attach to window for global access
window.API_URL = API_URL;
