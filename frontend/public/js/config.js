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
  API_URL = "http://localhost:3000/api";
} else if (isRender) {
  API_URL = "/api";
} else {
  API_URL = "https://budgetbukas-api.onrender.com/api";
}

// Attach to window for global access
window.API_URL = API_URL;

// Organizational Hierarchy Definition
const POSITION_HIERARCHY = {
  "Governor": 1,
  "President": 2,
  "Vice President for Internal Affairs": 3,
  "Vice President for External Affairs": 4,
  "General Secretary": 5,
  "Deputy Secretary": 6,
  "Auditor": 7,
  "Treasurer": 8,
  "Business Manager": 9,
  "4th Year Representative": 10,
  "3rd Year Representative": 11,
  "2nd Year Representative": 12,
  "1st Year Representative": 13,
  "Creatives and Branding Head": 14,
  "Creatives and Branding Member": 15,
  "Media Committee Head": 16,
  "Media Committee Member": 17,
  "DRRM Committee Head": 18,
  "DRRM Committee Member": 19,
  "Technical Head Committee": 20,
  "Technical Committee Member": 21,
  "Member": 22
};

window.POSITION_HIERARCHY = POSITION_HIERARCHY;

/**
 * Sorts an array of users by their position hierarchy
 */
window.sortUsersByHierarchy = (users) => {
  return [...users].sort((a, b) => {
    const rankA = POSITION_HIERARCHY[a.position] || 99;
    const rankB = POSITION_HIERARCHY[b.position] || 99;
    
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    
    // Secondary sort by name
    return (a.name || "").localeCompare(b.name || "");
  });
};
