// ============================================
// Theme Toggle — Dark / Light Mode
// ============================================

(function() {
  const savedTheme = localStorage.getItem('bb_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  const settingsToggle = document.getElementById('settings-theme-toggle');

  if (toggle) {
    toggle.addEventListener('click', toggleTheme);
  }

  if (settingsToggle) {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    settingsToggle.checked = currentTheme === 'dark';
    settingsToggle.addEventListener('change', (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      setTheme(theme);
    });
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bb_theme', theme);

  // Update settings toggle if present
  const settingsToggle = document.getElementById('settings-theme-toggle');
  if (settingsToggle) {
    settingsToggle.checked = theme === 'dark';
  }
}
