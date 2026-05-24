// ============================================
// Admin Panel JS
// User Management & Access Control
// ============================================

let currentUsers = [];
let adminSearchQuery = '';
let adminStatusFilter = 'active';
let adminCurrentPage = 1;
const adminPageSize = 7;
let adminSortColumn = 'name'; // default sort column
let adminSortOrder = 'asc'; // default sort order

// Attach to global scope immediately
window.openAddMemberModal = openAddMemberModal;
window.openEditMemberModal = openEditMemberModal;
window.closeAdminUserModal = closeAdminUserModal;
window.closeAdminPasswordModal = closeAdminPasswordModal;
window.resetUserPassword = resetUserPassword;
window.toggleUserStatus = toggleUserStatus;
window.deleteUserAccount = deleteUserAccount;
window.renderAdminUsers = renderAdminUsers;
window.changeAdminPage = changeAdminPage;

/**
 * Custom Confirmation Dialog
 * Returns a Promise that resolves to true if confirmed, false otherwise
 */
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const proceedBtn = document.getElementById('confirm-proceed-btn');

    if (!modal || !titleEl || !messageEl || !cancelBtn || !proceedBtn) {
      console.warn('⚠️ Confirm modal elements missing, falling back to window.confirm');
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.add('active');
    
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const handleCancel = () => {
      modal.classList.remove('active');
      cleanup();
      resolve(false);
    };

    const handleProceed = () => {
      modal.classList.remove('active');
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      cancelBtn.removeEventListener('click', handleCancel);
      proceedBtn.removeEventListener('click', handleProceed);
    };

    cancelBtn.addEventListener('click', handleCancel);
    proceedBtn.addEventListener('click', handleProceed);
  });
}

function initAdmin() {
  console.log('🛡️ Admin Panel Initializing...');
  if (!isAdmin()) return;

  // Load members initially when on the admin page
  loadAdminUsers();

  const adminForm = document.getElementById('admin-user-form');
  if (adminForm) {
    adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('💾 Saving admin user...');
      await saveAdminUser();
    });
  }

  // Bind new Status Dropdown filter
  const statusFilterInput = document.getElementById('admin-filter-status');
  if (statusFilterInput) {
    statusFilterInput.addEventListener('change', (e) => {
      adminStatusFilter = e.target.value;
      adminCurrentPage = 1; // Reset page on filter change
      renderAdminUsers();
    });
  }

  // Bind sortable headers for User Management
  const sortHeaders = document.querySelectorAll('#admin-users-table th.sortable');
  sortHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const sort = th.dataset.sort;
      if (adminSortColumn === sort) {
        // Toggle order
        adminSortOrder = adminSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        // Change column, default to asc
        adminSortColumn = sort;
        adminSortOrder = 'asc';
      }
      renderAdminUsers();
    });
  });

  // Bind real-time Search input
  const searchInput = document.getElementById('admin-search-name');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      adminSearchQuery = e.target.value;
      adminCurrentPage = 1; // Reset page on search change
      renderAdminUsers();
    });
  }

  // Global click listener for kebab menus
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.kebab-trigger');
    const allContainers = document.querySelectorAll('.kebab-menu-container');

    if (trigger) {
      const container = trigger.closest('.kebab-menu-container');
      const wasActive = container.classList.contains('active');
      allContainers.forEach(c => c.classList.remove('active'));
      if (!wasActive) {
        container.classList.add('active');
      }
      e.stopPropagation();
    } else {
      allContainers.forEach(c => c.classList.remove('active'));
    }
  });
}

async function loadAdminUsers() {
  try {
    console.log('📥 Loading admin users...');
    
    // Show skeletons
    const tbody = document.getElementById('admin-users-tbody');
    if (tbody) {
      tbody.innerHTML = Array(4).fill(0).map(() => `
        <tr>
          <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
          <td><div class="skeleton skeleton-text" style="width: 180px;"></div></td>
          <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
          <td><div class="skeleton skeleton-text" style="width: 70px;"></div></td>
          <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
          <td><div class="skeleton skeleton-text" style="width: 120px;"></div></td>
        </tr>
      `).join('');
    }

    const data = await apiGet('/auth/users');
    if (data && data.success) {
      currentUsers = data.data;
      renderAdminUsers(data.data);
    }
  } catch (error) {
    console.error('Failed to load admin users:', error);
    showToast('Failed to load users', 'error');
  }
}

function renderAdminUsers(users = currentUsers) {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  tbody.classList.add('content-fade-in');

  // Filter users based on search query and status filter
  let filteredUsers = users.filter(user => {
    // 1. Status Filter
    if (adminStatusFilter === 'active' && !user.is_active) return false;
    if (adminStatusFilter === 'inactive' && user.is_active) return false;
    
    // 2. Search Query Filter
    if (adminSearchQuery.trim() !== '') {
      const query = adminSearchQuery.toLowerCase();
      const matchesName = (user.name || '').toLowerCase().includes(query);
      const matchesEmail = (user.email || '').toLowerCase().includes(query);
      if (!matchesName && !matchesEmail) return false;
    }
    
    return true;
  });

  // Apply Sorting
  filteredUsers.sort((a, b) => {
    let comparison = 0;
    
    if (adminSortColumn === 'name') {
      comparison = (a.name || '').localeCompare(b.name || '');
    } else if (adminSortColumn === 'position') {
      const rankA = window.POSITION_HIERARCHY ? (window.POSITION_HIERARCHY[a.position] || 99) : 99;
      const rankB = window.POSITION_HIERARCHY ? (window.POSITION_HIERARCHY[b.position] || 99) : 99;
      
      if (rankA !== rankB) {
        comparison = rankA - rankB;
      } else {
        comparison = (a.name || '').localeCompare(b.name || '');
      }
    }
    
    return adminSortOrder === 'asc' ? comparison : -comparison;
  });

  const totalRecords = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / adminPageSize));
  
  // Guard page index bounds
  if (adminCurrentPage > totalPages) {
    adminCurrentPage = totalPages;
  }
  if (adminCurrentPage < 1) {
    adminCurrentPage = 1;
  }

  const startIdx = (adminCurrentPage - 1) * adminPageSize;
  const paginatedUsers = filteredUsers.slice(startIdx, startIdx + adminPageSize);

  if (!paginatedUsers || paginatedUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 40px; color: var(--text-secondary);">No users found</td></tr>';
    renderAdminPagination(0);
    return;
  }

  tbody.innerHTML = paginatedUsers.map(user => {
    const statusClass = user.is_active ? 'status-active' : 'status-inactive';
    const statusText = user.is_active ? 'Active' : 'Inactive';
    
    // Muted/gray styling class for inactive users
    const rowClass = user.is_active ? '' : 'inactive-user-row';
    
    // For must_change_password display if needed
    const passStatus = user.must_change_password 
      ? '<span class="type-badge status-new" style="margin-left: 6px; font-size: 0.68rem; padding: 2px 6px;" title="Must change password">New</span>' 
      : '';

    // Action button setup for Kebab dropdown
    const statusActionText = user.is_active ? 'Deactivate User' : 'Activate User';
    const statusActionClass = user.is_active ? 'btn-deactivate' : 'btn-activate';
    const statusActionIcon = user.is_active ? 'user-x' : 'user-check';
    const toggleStatusCall = user.is_active ? `toggleUserStatus(${user.id}, false)` : `toggleUserStatus(${user.id}, true)`;
    
    const deleteBtnHtml = !user.is_active 
      ? `<button class="btn-deactivate" onclick="deleteUserAccount(${user.id})">
           <i data-lucide="trash-2" style="color: var(--danger);"></i> 
           <span style="color: var(--danger);">Delete Account</span>
         </button>`
      : '';

    return `
      <tr class="${rowClass}">
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="topbar-avatar" style="width: 32px; height: 32px; font-size: 0.8rem;">
              <img src="${API_BASE}/auth/avatar/${user.id}?t=${Date.now()}" class="user-avatar-${user.id}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
            </div>
            <strong>${user.name}</strong>
          </div>
        </td>
        <td>${user.email}</td>
        <td>${user.position || '—'}</td>
        <td><span class="type-badge role-${user.role === 'admin' ? 'admin' : 'viewer'}">${user.role}</span>${passStatus}</td>
        <td><span class="type-badge ${statusClass}">${statusText}</span></td>
        <td style="text-align: center;">
          <div class="kebab-menu-container">
            <button class="kebab-trigger" title="More Actions">
              <i data-lucide="more-vertical" style="width: 18px; height: 18px;"></i>
            </button>
            <div class="kebab-dropdown">
              <button onclick="openEditMemberModal(${user.id})">
                <i data-lucide="edit-2"></i> Edit User
              </button>
              <button onclick="resetUserPassword(${user.id})">
                <i data-lucide="key"></i> Reset Password
              </button>
              <button class="${statusActionClass}" onclick="${toggleStatusCall}">
                <i data-lucide="${statusActionIcon}"></i> ${statusActionText}
              </button>
              ${deleteBtnHtml}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  // Render centered bottom pagination bar
  renderAdminPagination(totalPages);
}

function renderAdminPagination(totalPages) {
  const container = document.getElementById('admin-users-pagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button class="pagination-btn" ${adminCurrentPage === 1 ? 'disabled' : ''} onclick="changeAdminPage(${adminCurrentPage - 1})">
      <i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i> Previous
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    const isActive = i === adminCurrentPage;
    html += `
      <button class="pagination-number ${isActive ? 'active' : ''}" onclick="changeAdminPage(${i})">
        ${i}
      </button>
    `;
  }

  html += `
    <button class="pagination-btn" ${adminCurrentPage === totalPages ? 'disabled' : ''} onclick="changeAdminPage(${adminCurrentPage + 1})">
      Next <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
    </button>
  `;

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function changeAdminPage(pageNumber) {
  adminCurrentPage = pageNumber;
  renderAdminUsers();
}

function openAddMemberModal() {
  const form = document.getElementById('admin-user-form');
  if (form) form.reset();
  
  document.getElementById('admin-user-id').value = '';
  document.getElementById('admin-modal-title').textContent = 'Add New User';
  
  // Enable email for new users
  document.getElementById('admin-user-email').disabled = false;
  
  document.getElementById('admin-user-modal').classList.add('active');
}

function openEditMemberModal(userId) {
  const user = currentUsers.find(u => u.id === userId);
  if (!user) return;

  const form = document.getElementById('admin-user-form');
  if (form) form.reset();

  document.getElementById('admin-user-id').value = user.id;
  document.getElementById('admin-user-name').value = user.name;
  document.getElementById('admin-user-email').value = user.email;
  
  // Use custom dropdown setter
  setCustomDropdownValue('admin-user-position-dropdown', user.position || '');
  setCustomDropdownValue('admin-user-role-dropdown', user.role || 'user');
  
  // Email is non-editable in this flow for existing users to avoid conflicts,
  // or it can be left editable depending on requirements. Let's leave it editable.
  // document.getElementById('admin-user-email').disabled = true;

  document.getElementById('admin-modal-title').textContent = 'Edit User';
  document.getElementById('admin-user-modal').classList.add('active');
}

function closeAdminUserModal() {
  document.getElementById('admin-user-modal').classList.remove('active');
}

async function saveAdminUser() {
  const id = document.getElementById('admin-user-id').value;
  const payload = {
    name: document.getElementById('admin-user-name').value,
    email: document.getElementById('admin-user-email').value,
    position: document.getElementById('admin-user-position').value,
    role: document.getElementById('admin-user-role').value
  };

  try {
    if (id) {
      // Update
      const res = await apiPut(`/users/${id}`, payload);
      if (res && res.success) {
        showToast('User updated successfully');
        closeAdminUserModal();
        loadAdminUsers();
      }
    } else {
      // Create
      const res = await apiPost('/users', payload);
      if (res && res.success) {
        showToast('User created successfully');
        closeAdminUserModal();
        loadAdminUsers();
        
        // Show generated password
        showGeneratedPassword(res.generatedPassword);
      }
    }
  } catch (error) {
    showToast(error.message || 'Error saving user', 'error');
  }
}

async function resetUserPassword(userId) {
  try {
    console.log(`🔑 resetUserPassword called for user: ${userId}`);
    
    const confirmed = await showConfirm(
      "Reset Password", 
      "Are you sure you want to reset this user's password? They will be forced to create a new one on next login."
    );

    if (!confirmed) {
      console.log('❌ Reset password cancelled by user.');
      return;
    }

    console.log('📡 Sending reset password request...');
    const res = await apiRequest(`/users/${userId}/password`, { 
      method: 'PATCH',
      body: JSON.stringify({}) 
    });
    
    if (res && res.success) {
      console.log('✅ Password reset successful!');
      showToast('Password reset successfully');
      loadAdminUsers();
      showGeneratedPassword(res.generatedPassword);
    }
  } catch (error) {
    console.error('‼️ CRITICAL ERROR [resetUserPassword]:', error);
    showToast(error.message || 'Error resetting password', 'error');
  }
}

async function toggleUserStatus(userId, makeActive) {
  try {
    console.log(`👤 toggleUserStatus called for user: ${userId}, makeActive: ${makeActive}`);
    const actionText = makeActive ? 'activate' : 'deactivate';
    
    const confirmed = await showConfirm(
      `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} User`, 
      `Are you sure you want to ${actionText} this user's access?`
    );

    if (!confirmed) {
      console.log(`❌ ${actionText} cancelled by user.`);
      return;
    }

    console.log(`📡 Sending ${actionText} request...`);
    const res = await apiRequest(`/users/${userId}/status`, { 
      method: 'PATCH',
      body: JSON.stringify({ is_active: makeActive })
    });
    
    if (res && res.success) {
      console.log(`✅ User ${actionText} successful!`);
      showToast(res.message);
      loadAdminUsers();
    }
  } catch (error) {
    console.error('‼️ CRITICAL ERROR [toggleUserStatus]:', error);
    showToast(error.message || `Error ${actionText}ing user`, 'error');
  }
}

async function deleteUserAccount(userId) {
  try {
    console.log(`🗑️ deleteUserAccount called for user: ${userId}`);
    
    const confirmed = await showConfirm(
      "Permanently Delete Account", 
      "Are you sure you want to delete this account? Their email will be freed up for re-registration, but their name will remain on past transactions to preserve the financial records."
    );

    if (!confirmed) {
      console.log('❌ Delete cancelled by user.');
      return;
    }

    console.log('📡 Sending delete request...');
    // Add an apiDelete call directly or use apiRequest
    const res = await apiRequest(`/users/${userId}`, { method: 'DELETE' });
    
    if (res && res.success) {
      console.log('✅ User deleted and email freed!');
      showToast('User permanently removed. Email has been freed.', 'success');
      loadAdminUsers();
    }
  } catch (error) {
    console.error('‼️ CRITICAL ERROR [deleteUserAccount]:', error);
    showToast(error.message || 'Error deleting user', 'error');
  }
}

function showGeneratedPassword(password) {
  const modal = document.getElementById('admin-password-modal');
  const display = document.getElementById('generated-password-display');
  
  if (modal && display) {
    display.textContent = password;
    modal.classList.add('active');
  }
}

function closeAdminPasswordModal() {
  document.getElementById('admin-password-modal').classList.remove('active');
  // Clear the password from DOM for security
  document.getElementById('generated-password-display').textContent = '';
}

