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
  initMobileSidebar();
  initTopbarScroll();
  initNotifications();
  initAvatarSettings();
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
// MOBILE SIDEBAR (Drawer only — no push)
// =============================================
function initMobileSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');

  if (!toggle || !sidebar) return;

  // Mobile toggle — slide drawer
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


// =============================================
// STICKY TOPBAR WITH SCROLL EFFECT
// =============================================
function initTopbarScroll() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      topbar.classList.add('topbar-scrolled');
    } else {
      topbar.classList.remove('topbar-scrolled');
    }
  }, { passive: true });
}

// =============================================
// AVATAR → SETTINGS NAVIGATION
// =============================================
function initAvatarSettings() {
  const avatar = document.getElementById('user-avatar');
  if (!avatar) return;

  avatar.addEventListener('click', () => {
    navigateTo('settings');
  });

  // Also handle keyboard (Enter/Space for accessibility)
  avatar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateTo('settings');
    }
  });
}

// =============================================
// NOTIFICATION SYSTEM
// =============================================
function initNotifications() {
  const btn = document.getElementById('notification-btn');
  const panel = document.getElementById('notification-panel');
  const badge = document.getElementById('notification-badge');
  const clearBtn = document.getElementById('notification-clear-btn');
  const listEl = document.getElementById('notification-list');

  if (!btn || !panel || !listEl) return;

  // Simulated notifications
  let notifications = [
    {
      id: 1,
      type: 'tx',
      icon: 'trending-up',
      title: 'New Income Recorded',
      desc: 'Membership fee of ₱150.00 was added by Admin.',
      time: '2 minutes ago',
      unread: true
    },
    {
      id: 2,
      type: 'member',
      icon: 'user-plus',
      title: 'New Member Registered',
      desc: 'Juan Dela Cruz joined the organization.',
      time: '15 minutes ago',
      unread: true
    },
    {
      id: 3,
      type: 'system',
      icon: 'shield-check',
      title: 'System Update',
      desc: 'PondoSync v1.2 is now live with enhanced security.',
      time: '1 hour ago',
      unread: true
    },
    {
      id: 4,
      type: 'announce',
      icon: 'megaphone',
      title: 'Announcement',
      desc: 'General Assembly scheduled for May 5, 2026.',
      time: '3 hours ago',
      unread: false
    },
    {
      id: 5,
      type: 'tx',
      icon: 'trending-down',
      title: 'Expense Logged',
      desc: 'Printing costs ₱850.00 were recorded for the event.',
      time: '5 hours ago',
      unread: false
    }
  ];

  function renderNotifications() {
    const unreadCount = notifications.filter(n => n.unread).length;

    // Update badge
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Render list
    if (notifications.length === 0) {
      listEl.innerHTML = `
        <div class="notification-empty">
          <i data-lucide="bell-off"></i>
          <p>No notifications</p>
          <span>You're all caught up!</span>
        </div>
      `;
    } else {
      listEl.innerHTML = notifications.map(n => `
        <div class="notification-item" data-id="${n.id}">
          <div class="notification-item-icon ${n.type}">
            <i data-lucide="${n.icon}"></i>
          </div>
          <div class="notification-item-content">
            <div class="notification-item-title">${n.title}</div>
            <div class="notification-item-desc">${n.desc}</div>
            <div class="notification-item-time">${n.time}</div>
          </div>
          ${n.unread ? '<div class="notification-unread-dot"></div>' : ''}
        </div>
      `).join('');
    }

    // Refresh icons inside panel
    if (typeof lucide !== 'undefined') {
      setTimeout(() => lucide.createIcons(), 50);
    }
  }

  // Toggle panel
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = panel.classList.contains('hidden');

    if (isHidden) {
      panel.classList.remove('hidden');
      // Mark all as read when opening
      notifications.forEach(n => n.unread = false);
      renderNotifications();
      // Bell ring
      btn.classList.add('ring');
      setTimeout(() => btn.classList.remove('ring'), 600);
    } else {
      panel.classList.add('hidden');
    }
  });

  // Close panel when clicking outside
  const wrapper = document.getElementById('notification-wrapper');
  document.addEventListener('click', (e) => {
    if (wrapper && !wrapper.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  // Clear all
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      notifications = [];
      renderNotifications();
    });
  }

  // Initial render
  renderNotifications();
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
