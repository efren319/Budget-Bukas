// ============================================
// Global Config — Environment and URIs
// ============================================

// Since the backend serves the frontend as static files,
// the API is always at '/api' relative to the current origin.
// Only use localhost for local development.
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal ? "http://localhost:10000/api" : "/api";

// Attach to window for global access
window.API_URL = API_URL;
