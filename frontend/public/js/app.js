// ============================================
// App.js — SPA Router + Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  if (!localStorage.getItem('bb_token')) {
    window.location.href = '/';
    return;
  }

  await initApp();
});

async function initApp() {
  let user = getCurrentUser();
  
  // Refresh user data from server to ensure flags like must_change_password are up to date
  try {
    const res = await apiGet('/auth/me');
    if (res && res.success) {
      user = res.user;
      localStorage.setItem('bb_user', JSON.stringify(user));
    }
  } catch (err) {
    console.error('Failed to refresh user profile:', err);
  }

  if (user) {
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = user.name || 'User';
    if (roleEl) roleEl.textContent = user.role || 'Member';
    if (avatarEl && user.id) {
      avatarEl.innerHTML = `<img src="${API_BASE}/auth/avatar/${user.id}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }
  }

  // Check if force password change is required
  if (user && user.must_change_password) {
    document.getElementById('force-password-modal').classList.add('active');
    initForcePassword();
  }

  // Handle admin-only elements visibility
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    el.style.display = isAdmin() ? 'flex' : 'none';
  });

  // Initialize modules
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
  initGlassmorphism();
  if (typeof initAdmin === 'function') initAdmin();

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
  const targetPage = document.getElementById(`page-${page}`);
  if (!targetPage) return;

  // Prevent flicker/re-navigation if already active
  if (targetPage.classList.contains('active')) return;

  // Update sidebar active state
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`[data-page="${page}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Show target page, hide others
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  targetPage.classList.add('active');
  targetPage.classList.add('page-enter');
  setTimeout(() => targetPage.classList.remove('page-enter'), 300);

  // Update breadcrumb
  const breadcrumbEl = document.getElementById('breadcrumb-current');
  if (breadcrumbEl) {
    breadcrumbEl.textContent = page.charAt(0).toUpperCase() + page.slice(1).replace('-', ' ');
  }

  // Close mobile sidebar
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.remove('active');
  overlay?.classList.remove('active');

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
// LOADING SCREEN MANAGER
// =============================================
let d3dLoaded = false;
let dataLoaded = false;

function checkLoadingFinished() {
  if (d3dLoaded && dataLoaded) {
    setTimeout(() => {
      const overlay = document.getElementById('dashboard-loading-overlay');
      if (overlay) overlay.classList.add('hidden');
    }, 400);
  }
}

window.addEventListener('dashboard-3d-loaded', () => {
  d3dLoaded = true;
  checkLoadingFinished();
});

window.addEventListener('dashboard-data-loaded', () => {
  dataLoaded = true;
  checkLoadingFinished();
});

// Safety fallback
setTimeout(() => {
  d3dLoaded = true;
  dataLoaded = true;
  checkLoadingFinished();
}, 8000);


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

  const settingsPanel = document.getElementById('settings-panel');
  const closeBtn = document.getElementById('settings-close-btn');

  function openSettings(e) {
    if (e) e.stopPropagation();
    // Add bounce to avatar
    avatar.classList.add('btn-clicked');
    setTimeout(() => avatar.classList.remove('btn-clicked'), 150);
    
    if (settingsPanel) settingsPanel.classList.remove('panel-hidden');
  }

  function closeSettings() {
    if (settingsPanel && !settingsPanel.classList.contains('panel-hidden')) {
      settingsPanel.classList.add('panel-hidden');
    }
  }

  avatar.addEventListener('click', openSettings);

  avatar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSettings(e);
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSettings);
  }

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (settingsPanel && !settingsPanel.contains(e.target) && !avatar.contains(e.target)) {
      closeSettings();
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
    
    // Add bounce effect to the notification button
    btn.classList.add('btn-clicked');
    setTimeout(() => btn.classList.remove('btn-clicked'), 150);

    const isHidden = panel.classList.contains('panel-hidden');

    if (isHidden) {
      panel.classList.remove('panel-hidden');
      // Mark all as read when opening
      notifications.forEach(n => n.unread = false);
      renderNotifications();
      // Bell ring
      btn.classList.add('ring');
      setTimeout(() => btn.classList.remove('ring'), 600);
    } else {
      panel.classList.add('panel-hidden');
    }
  });

  // Close panel when clicking outside
  const wrapper = document.getElementById('notification-wrapper');
  document.addEventListener('click', (e) => {
    if (wrapper && !wrapper.contains(e.target) && !panel.classList.contains('panel-hidden')) {
      // Add bounce effect on close
      btn.classList.add('btn-clicked');
      setTimeout(() => btn.classList.remove('btn-clicked'), 150);
      panel.classList.add('panel-hidden');
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
  const nameInput    = document.getElementById('settings-name');
  const emailInput   = document.getElementById('settings-email');
  const avatarPreview = document.getElementById('settings-avatar-preview');

  if (nameInput  && user) nameInput.value  = user.name  || '';
  if (emailInput && user) emailInput.value = user.email || '';

  // Always render avatar from user ID (backend always returns photo or initials SVG)
  if (avatarPreview && user && user.id) {
    avatarPreview.innerHTML = `<img src="${API_BASE}/auth/avatar/${user.id}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" alt="${user.name || 'Avatar'}">`;
  }

  // ---- Fullscreen Avatar Lightbox ----
  initAvatarLightbox(user);

  // ---- Cropper-based Avatar Upload ----
  initAvatarCropUpload(user, avatarPreview);

  // ---- Remove Photo ----
  initAvatarRemove(user, avatarPreview);

  // ---- Profile form submit ----
  const profileForm = document.getElementById('settings-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiPut('/auth/profile', {
          name: nameInput.value,
          email: emailInput.value
        });
        const updatedUser = { ...getCurrentUser(), name: nameInput.value, email: emailInput.value };
        localStorage.setItem('bb_user', JSON.stringify(updatedUser));
        document.getElementById('user-name').textContent = updatedUser.name;
        showToast('Profile updated successfully');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // ---- Password form submit ----
  const passwordForm = document.getElementById('settings-password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiPut('/auth/password', {
          currentPassword: document.getElementById('settings-current-pw').value,
          newPassword:     document.getElementById('settings-new-pw').value
        });
        showToast('Password changed successfully');
        passwordForm.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

// ---- Fullscreen Avatar Lightbox ----
function initAvatarLightbox(user) {
  const lightbox    = document.getElementById('avatar-lightbox');
  const lightboxImg = document.getElementById('avatar-lightbox-img');
  const lightboxName = document.getElementById('avatar-lightbox-name');
  const closeBtn    = document.getElementById('avatar-lightbox-close');
  const backdrop    = document.getElementById('avatar-lightbox-backdrop');
  const trigger     = document.getElementById('settings-avatar-preview');

  if (!lightbox || !trigger) return;

  function openLightbox() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.id) return;
    lightboxImg.src  = `${API_BASE}/auth/avatar/${currentUser.id}?t=${Date.now()}`;
    lightboxName.textContent = currentUser.name || '';
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  trigger.addEventListener('click', openLightbox);
  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
  if (backdrop) backdrop.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
  });
}

// ---- Cropper-based Avatar Upload ----
function initAvatarCropUpload(user, avatarPreview) {
  const fileInput    = document.getElementById('settings-avatar-upload');
  const cropModal    = document.getElementById('avatar-crop-modal');
  const cropImg      = document.getElementById('avatar-crop-img');
  const cropConfirm  = document.getElementById('avatar-crop-confirm');
  const cropCancelBtn = document.getElementById('avatar-crop-cancel-btn');
  const cropCancelX  = document.getElementById('avatar-crop-cancel');

  if (!fileInput || !cropModal) return;

  let cropperInstance = null;

  // Open crop modal when file selected
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate type & size client-side
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file (JPG, PNG, WebP)', 'error');
      fileInput.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image too large — max 5MB', 'error');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Set crop img src and open modal
      cropImg.src = ev.target.result;
      cropModal.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Destroy previous cropper if any
      if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }

      // Init Cropper.js after image loads
      cropImg.onload = () => {
        cropperInstance = new Cropper(cropImg, {
          aspectRatio: 1,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.85,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: false,
          cropBoxResizable: false,
          toggleDragModeOnDblclick: false,
          background: false,
          modal: true,
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
      };
    };
    reader.readAsDataURL(file);
    fileInput.value = ''; // reset so same file can be re-selected
  });

  // Close crop modal
  function closeCropModal() {
    cropModal.classList.remove('active');
    document.body.style.overflow = '';
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  }

  if (cropCancelBtn) cropCancelBtn.addEventListener('click', closeCropModal);
  if (cropCancelX)   cropCancelX.addEventListener('click', closeCropModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cropModal.classList.contains('active')) closeCropModal();
  });

  // Confirm crop → compress → upload
  if (cropConfirm) {
    cropConfirm.addEventListener('click', async () => {
      if (!cropperInstance) return;

      cropConfirm.disabled = true;
      cropConfirm.innerHTML = '<i data-lucide="loader"></i> Uploading...';
      if (typeof lucide !== 'undefined') lucide.createIcons();

      try {
        // Get cropped canvas (512×512 max for quality vs size balance)
        const canvas = cropperInstance.getCroppedCanvas({ width: 512, height: 512, imageSmoothingQuality: 'high' });

        // Compress to JPEG blob (~85% quality)
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));

        const formData = new FormData();
        formData.append('avatar', blob, 'avatar.jpg');

        const result = await apiUpload('/auth/avatar', formData);

        if (result && result.success) {
          // Update stored user
          const currentUser = getCurrentUser();
          const updatedUser = { ...currentUser, avatar_url: result.data.avatar_url };
          localStorage.setItem('bb_user', JSON.stringify(updatedUser));
          
          refreshAllAvatars();

          closeCropModal();
          showToast('Profile photo updated! ✨');
        } else {
          throw new Error(result?.message || 'Upload failed');
        }
      } catch (err) {
        showToast(err.message || 'Failed to upload avatar', 'error');
      } finally {
        cropConfirm.disabled = false;
        cropConfirm.innerHTML = '<i data-lucide="check"></i> Apply &amp; Upload';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }
}

// =============================================
// FORCE PASSWORD CHANGE (FIRST LOGIN)
// =============================================
function initForcePassword() {
  const form = document.getElementById('force-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPw = document.getElementById('force-new-pw').value;
    const confirmPw = document.getElementById('force-confirm-pw').value;

    if (newPw !== confirmPw) {
      showToast('Passwords do not match', 'error');
      return;
    }

    try {
      const btn = document.getElementById('btn-force-password');
      btn.disabled = true;
      btn.textContent = 'Updating...';

      const res = await apiPut('/auth/force-change-password', { newPassword: newPw });
      if (res && res.success) {
        showToast('Password updated! Welcome to PondoSync.');
        document.getElementById('force-password-modal').classList.remove('active');
        
        // Update local user object
        const user = getCurrentUser();
        if (user) {
          user.must_change_password = false;
          localStorage.setItem('bb_user', JSON.stringify(user));
        }
      }
    } catch (err) {
      showToast(err.message || 'Failed to update password', 'error');
      document.getElementById('btn-force-password').disabled = false;
      document.getElementById('btn-force-password').textContent = 'Update Password';
    }
  });
}

// ---- Remove Avatar ----
function initAvatarRemove(user, avatarPreview) {
  const removeBtn = document.getElementById('btn-remove-avatar');
  if (!removeBtn) return;

  removeBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to remove your profile photo?')) return;
    
    try {
      await apiDelete('/auth/avatar');
      
      // Update local storage
      const currentUser = getCurrentUser();
      const updatedUser = { ...currentUser, avatar_url: null };
      localStorage.setItem('bb_user', JSON.stringify(updatedUser));
      
      refreshAllAvatars();
      showToast('Profile photo removed');
    } catch (err) {
      showToast(err.message || 'Failed to remove avatar', 'error');
    }
  });
}

// Helper to update all avatar instances on the page immediately
function refreshAllAvatars() {
  const user = getCurrentUser();
  if (!user || !user.id) return;
  
  const ts = Date.now();
  const avatarUrl = `${API_BASE}/auth/avatar/${user.id}?t=${ts}`;
  
  // 1. Topbar avatar
  const topbarAvatar = document.getElementById('user-avatar');
  if (topbarAvatar) {
    topbarAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" alt="${user.name || ''}">`;
  }
  
  // 2. Settings preview
  const settingsPreview = document.getElementById('settings-avatar-preview');
  if (settingsPreview) {
    settingsPreview.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" alt="${user.name || ''}">`;
  }
  
  // 3. Admin panel and dashboard member lists
  document.querySelectorAll(`.user-avatar-${user.id}`).forEach(img => {
    img.src = avatarUrl;
  });

  // Also update the lightbox if it's open
  const lightboxImg = document.getElementById('avatar-lightbox-img');
  if (lightboxImg) lightboxImg.src = avatarUrl;
}

// =============================================
// GLASSMORPHISM MOUSE TRACKING (Proximity Lighting)
// =============================================
function initGlassmorphism() {
  let cards = document.querySelectorAll('.glass-card');
  let isTicking = false;
  let mouseX = 0;
  let mouseY = 0;

  // Refresh the card list periodically in case the DOM changes
  setInterval(() => {
    cards = document.querySelectorAll('.glass-card');
  }, 1000);

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!isTicking) {
      requestAnimationFrame(() => {
        cards.forEach(card => {
          const rect = card.getBoundingClientRect();
          const x = mouseX - rect.left;
          const y = mouseY - rect.top;
          card.style.setProperty('--mouse-x', `${x}px`);
          card.style.setProperty('--mouse-y', `${y}px`);
        });
        isTicking = false;
      });
      isTicking = true;
    }
  });
}

