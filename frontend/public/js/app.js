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

/**
 * Apply user profile details, role visibility, and forced password prompt to the UI.
 * @param {object|null} currentUser
 * @param {boolean} isInitial
 */
function applyUserToUI(currentUser, isInitial = false) {
  if (currentUser) {
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    const avatarEl = document.getElementById('user-avatar');

    if (isInitial) {
      const nameSkel = document.getElementById('user-name-skeleton');
      const roleSkel = document.getElementById('user-role-skeleton');
      if (nameSkel) nameSkel.remove();
      if (roleSkel) roleSkel.remove();

      const topbarUser = document.getElementById('topbar-user-container');
      if (topbarUser) topbarUser.classList.remove('loading-state');

      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        setTimeout(() => sidebar.classList.remove('loading-state'), 500);
      }
    }

    if (nameEl) {
      nameEl.textContent = currentUser.name || 'User';
      nameEl.style.display = '';
      if (isInitial) nameEl.classList.add('content-fade-in');
    }
    if (roleEl) {
      roleEl.textContent = currentUser.role || 'Member';
      roleEl.style.display = '';
      if (isInitial) roleEl.classList.add('content-fade-in');
    }
    if (avatarEl && currentUser.id) {
      const expectedSrc = `${API_BASE}/auth/avatar/${currentUser.id}`;
      const existingImg = avatarEl.querySelector('img');
      if (!existingImg || !existingImg.getAttribute('src')?.includes(`/auth/avatar/${currentUser.id}`)) {
        avatarEl.innerHTML = `<img src="${expectedSrc}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" class="content-fade-in">`;
      }
    }
  }

  const modal = document.getElementById('force-password-modal');
  if (modal) {
    if (currentUser && currentUser.must_change_password) {
      if (!modal.classList.contains('active')) {
        modal.classList.add('active');
        initForcePassword();
      }
    } else if (modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  }

  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    el.style.display = isAdmin() ? 'flex' : 'none';
  });
}

async function initApp() {
  const cachedUser = getCurrentUser();

  // Render cached user and start all dashboard modules immediately; refresh /auth/me concurrently in background
  applyUserToUI(cachedUser, true);

  const profileRefreshPromise = apiGet('/auth/me')
    .then(res => {
      if (res && res.success && res.user) {
        localStorage.setItem('bb_user', JSON.stringify(res.user));
        applyUserToUI(res.user, false);
      }
    })
    .catch(err => {
      console.error('Failed to refresh user profile:', err);
    });
  void profileRefreshPromise;

  // Initialize modules
  initNavigation();
  initMobileSidebar();
  initTopbarScroll();
  initAvatarProfile();
  initLogout();
  initDashboard();
  initTransactionForm();
  initRecords();
  initReceiptsPage();
  initChatbot();
  initProfile();
  initGlassmorphism();
  initCustomDropdowns();
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

  // Restore last visited page
  const lastPage = localStorage.getItem('bb_last_page') || 'dashboard';
  
  // Remove the inline style that prevented flash, as JS now takes over
  const initialStyle = document.getElementById('initial-page-style');
  if (initialStyle) initialStyle.remove();

  if (document.getElementById(`page-${lastPage}`)) {
    navigateTo(lastPage);
  } else {
    navigateTo('dashboard');
  }
}

function navigateTo(page) {
  const targetPage = document.getElementById(`page-${page}`);
  if (!targetPage) return;

  // Prevent flicker/re-navigation if already active
  if (targetPage.classList.contains('active')) return;

  // Save current page state
  localStorage.setItem('bb_last_page', page);

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
    breadcrumbEl.textContent = page.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
      if (typeof fetchMembers === 'function') fetchMembers();
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
// APP INITIALIZATION
// =============================================


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
// CUSTOM DROPDOWN LOGIC
// =============================================
function initCustomDropdowns() {
  const dropdowns = document.querySelectorAll('.custom-dropdown');
  
  dropdowns.forEach(dropdown => {
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const menu = dropdown.querySelector('.dropdown-menu');
    const searchInput = dropdown.querySelector('.dropdown-search input');
    const options = dropdown.querySelectorAll('.dropdown-item');
    const hiddenInput = dropdown.querySelector('input[type="hidden"]');
    
    // Toggle menu
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close all other dropdowns first
      document.querySelectorAll('.custom-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('active');
      });
      dropdown.classList.toggle('active');
      
      // Auto-focus search if exists
      if (dropdown.classList.contains('active') && searchInput) {
        setTimeout(() => searchInput.focus(), 100);
      }
    });

    // Option selection
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        const text = option.textContent.trim();
        
        // Update selection
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        // Update trigger text
        trigger.querySelector('span').textContent = text;
        
        // Update hidden input
        if (hiddenInput) {
          hiddenInput.value = value;
          // Trigger change event for other JS to catch
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        dropdown.classList.remove('active');
      });
    });

    // Search/Filter logic
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        options.forEach(option => {
          const text = option.textContent.toLowerCase();
          if (text.includes(term)) {
            option.classList.remove('hidden');
          } else {
            option.classList.add('hidden');
          }
        });
      });
      
      // Stop clicks in search from closing menu
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }
  });

  // Global click-to-close
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
  });
}

// Helper to set custom dropdown value programmatically
function setCustomDropdownValue(dropdownId, value) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  
  const options = dropdown.querySelectorAll('.dropdown-item');
  const trigger = dropdown.querySelector('.dropdown-trigger');
  const hiddenInput = dropdown.querySelector('input[type="hidden"]');
  
  options.forEach(option => {
    if (option.dataset.value === value) {
      options.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      trigger.querySelector('span').textContent = option.textContent.trim();
      if (hiddenInput) {
        hiddenInput.value = value;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}
function initAvatarProfile() {
  const avatar = document.getElementById('user-avatar');
  if (!avatar) return;

  const settingsPanel = document.getElementById('settings-panel');
  const closeBtn = document.getElementById('settings-close-btn');
  const backdrop = document.getElementById('settings-backdrop');

  function openSettings(e) {
    if (e) e.stopPropagation();
    // Add bounce to avatar
    avatar.classList.add('btn-clicked');
    setTimeout(() => avatar.classList.remove('btn-clicked'), 150);
    
    if (settingsPanel) settingsPanel.classList.remove('panel-hidden');
    if (backdrop) backdrop.classList.add('active');
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  function closeSettings() {
    if (settingsPanel && !settingsPanel.classList.contains('panel-hidden')) {
      settingsPanel.classList.add('panel-hidden');
    }
    if (backdrop) backdrop.classList.remove('active');
    
    // Restore body scroll
    document.body.style.overflow = '';
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

  if (backdrop) {
    backdrop.addEventListener('click', closeSettings);
  }

  // Click outside to close
  document.addEventListener('click', (e) => {
    const lightbox = document.getElementById('avatar-lightbox');
    const isLightboxClick = lightbox && lightbox.contains(e.target);
    
    if (settingsPanel && !settingsPanel.contains(e.target) && !avatar.contains(e.target) && !isLightboxClick) {
      closeSettings();
    }
  });
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
// PROFILE (Management & Security)
// =============================================
function initProfile() {
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

  // ---- Unified form submit (Profile + Password) ----
  const unifiedForm = document.getElementById('settings-unified-form');
  if (unifiedForm) {
    unifiedForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const newName = document.getElementById('settings-name').value;
      const newEmail = document.getElementById('settings-email').value;
      const currentPw = document.getElementById('settings-current-pw').value;
      const newPw = document.getElementById('settings-new-pw').value;
      
      let profileChanged = (newName !== user.name || newEmail !== user.email);
      let passwordAttempt = (currentPw || newPw);
      
      if (!profileChanged && !passwordAttempt) {
        showToast('No changes detected');
        return;
      }
      
      try {
        const submitBtn = unifiedForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="spin" data-lucide="loader-2"></i> Saving...';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // 1. Update Profile if changed
        if (profileChanged) {
          await apiPut('/auth/profile', { name: newName, email: newEmail });
          const updatedUser = { ...getCurrentUser(), name: newName, email: newEmail };
          localStorage.setItem('bb_user', JSON.stringify(updatedUser));
          document.getElementById('user-name').textContent = updatedUser.name;
        }
        
        // 2. Update Password if fields filled
        if (passwordAttempt) {
          if (!currentPw || !newPw) {
            throw new Error('Please fill both current and new password fields to update password');
          }
          await apiPut('/auth/password', { currentPassword: currentPw, newPassword: newPw });
          document.getElementById('settings-current-pw').value = '';
          document.getElementById('settings-new-pw').value = '';
        }
        
        showToast('Profile updated successfully');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
      } catch (err) {
        showToast(err.message, 'error');
        const submitBtn = unifiedForm.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="save"></i> Save Profile Changes';
        if (typeof lucide !== 'undefined') lucide.createIcons();
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

  function clearCardGlows() {
    cards.forEach(card => {
      card.style.removeProperty('--mouse-x');
      card.style.removeProperty('--mouse-y');
    });
  }

  // Refresh the card list periodically in case the DOM changes
  setInterval(() => {
    cards = document.querySelectorAll('.glass-card');
    if (window.PondoSyncPerf && window.PondoSyncPerf.isEnabled()) {
      clearCardGlows();
    }
  }, 1000);

  if (window.PondoSyncPerf && window.PondoSyncPerf.isEnabled()) {
    clearCardGlows();
  }

  window.addEventListener('pondosync-perf-change', (e) => {
    if (e.detail.enabled) {
      clearCardGlows();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (window.PondoSyncPerf && window.PondoSyncPerf.isEnabled()) return;
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

