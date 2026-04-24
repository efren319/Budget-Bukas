// ============================================
// Global Config — Environment and URIs
// ============================================

// Vercel handles env injection; fallback for local/direct deploy
const API_URL = "https://pondosync-api.onrender.com";

// Attach to window for global access
window.API_URL = API_URL;
