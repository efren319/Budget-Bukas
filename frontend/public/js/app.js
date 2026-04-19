// ============================================
// App.js — SPA Router + Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Auth guard
  if (!localStorage.getItem('bb_token')) {
    window.location.href = '/';
    return;
  }

  initApp();
});

function initApp() {
  // Set user info in topbar
  const user = getCurrentUser();
  if (user) {
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.name || 'User';
    if (roleEl) roleEl.textContent = user.role || 'Member';
    if (avatarEl && user.avatar_url) {
      avatarEl.innerHTML = `<img src="/api/auth/avatar/${user.avatar_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }
  }

  // Hide officer-only elements for members
  if (!isOfficer()) {
    const addTxLink = document.getElementById('nav-add-transaction');
    if (addTxLink) addTxLink.style.display = 'none';
  }

  // Initialize modules
  initTheme();
  initNavigation();
  initSidebar();
  initLogout();
  initGlobalSearch();
  initDashboard();
  initTransactionForm();
  initRecords();
  initReceiptsPage();
  initChatbot();
  initSettings();

  // Refresh Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// =============================================
// NAVIGATION (SPA Router)
// =============================================
function initNavigation() {
  const links = document.querySelectorAll('.sidebar-link[data-page]');

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
    });
  });

  // See-all links
  document.querySelectorAll('[data-goto]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.goto);
    });
  });
}

function navigateTo(page) {
  // Update sidebar active state
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`[data-page="${page}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Show target page, hide others
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) {
    targetPage.classList.add('active');
    targetPage.classList.add('page-enter');
    setTimeout(() => targetPage.classList.remove('page-enter'), 300);
  }

  // Close mobile sidebar
  document.getElementById('sidebar')?.classList.remove('open');

  // Trigger page-specific data loading
  switch (page) {
    case 'dashboard':
      loadDashboardData();
      break;
    case 'records':
      loadRecords();
      break;
    case 'receipts':
      loadReceipts();
      break;
  }

  // Refresh Lucide icons for new content
  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 100);
  }
}

// =============================================
// SIDEBAR
// =============================================
function initSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      }
    });
  }
}

// =============================================
// LOGOUT
// =============================================
function initLogout() {
  const btn = document.getElementById('btn-logout');
  if (btn) {
    btn.addEventListener('click', () => {
      localStorage.removeItem('bb_token');
      localStorage.removeItem('bb_user');
      window.location.href = '/';
    });
  }
}

// =============================================
// GLOBAL SEARCH
// =============================================
function initGlobalSearch() {
  const input = document.getElementById('global-search');
  if (!input) return;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const query = input.value.trim();
      if (query) {
        navigateTo('records');
        const filterSearch = document.getElementById('filter-search');
        if (filterSearch) {
          filterSearch.value = query;
          loadRecords();
        }
      }
    }, 500);
  });
}

// =============================================
// SETTINGS
// =============================================
function initSettings() {
  const user = getCurrentUser();

  // Populate profile form
  const nameInput = document.getElementById('settings-name');
  const emailInput = document.getElementById('settings-email');
  const avatarPreview = document.getElementById('settings-avatar-preview');
  
  if (nameInput && user) nameInput.value = user.name || '';
  if (emailInput && user) emailInput.value = user.email || '';
  if (avatarPreview && user && user.avatar_url) {
    avatarPreview.innerHTML = `<img src="/api/auth/avatar/${user.avatar_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  }

  // Avatar upload via File Input
  const avatarInput = document.getElementById('settings-avatar-upload');
  if (avatarInput) {
    avatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('avatar', file);

      try {
        const result = await apiUpload('/auth/avatar', formData);
        if (result && result.success) {
          const avatarUrl = result.data.avatar_url;
          
          // Update local storage
          const updatedUser = { ...user, avatar_url: avatarUrl };
          localStorage.setItem('bb_user', JSON.stringify(updatedUser));
          
          // Update DOM instances
          const imgMarkup = `<img src="/api/auth/avatar/${avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
          if (avatarPreview) avatarPreview.innerHTML = imgMarkup;
          const topbarAvatar = document.getElementById('user-avatar');
          if (topbarAvatar) topbarAvatar.innerHTML = imgMarkup;
          
          showToast('Profile photo updated successfully');
        }
      } catch (err) {
        showToast(err.message || 'Failed to update avatar', 'error');
      }
    });
  }

  // Profile form submit
  const profileForm = document.getElementById('settings-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiPut('/auth/profile', {
          name: nameInput.value,
          email: emailInput.value
        });
        // Update local storage
        const updatedUser = { ...user, name: nameInput.value, email: emailInput.value };
        localStorage.setItem('bb_user', JSON.stringify(updatedUser));
        document.getElementById('user-name').textContent = updatedUser.name;
        showToast('Profile updated successfully');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Password form submit
  const passwordForm = document.getElementById('settings-password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiPut('/auth/password', {
          currentPassword: document.getElementById('settings-current-pw').value,
          newPassword: document.getElementById('settings-new-pw').value
        });
        showToast('Password changed successfully');
        passwordForm.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}
