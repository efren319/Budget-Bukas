// ============================================
// Admin Panel JS
// User Management & Access Control
// ============================================

let currentUsers = [];

// Attach to global scope immediately
window.openAddMemberModal = openAddMemberModal;
window.openEditMemberModal = openEditMemberModal;
window.closeAdminUserModal = closeAdminUserModal;
window.closeAdminPasswordModal = closeAdminPasswordModal;
window.resetUserPassword = resetUserPassword;
window.toggleUserStatus = toggleUserStatus;
window.deleteUserAccount = deleteUserAccount;
window.renderAdminUsers = renderAdminUsers;

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
}

async function loadAdminUsers() {
  try {
    console.log('📥 Loading admin users...');
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

  const showInactive = document.getElementById('toggle-inactive-users')?.checked || false;
  const filteredUsers = users.filter(u => showInactive ? true : u.is_active);

  if (!filteredUsers || filteredUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = filteredUsers.map(user => {
    const statusClass = user.is_active ? 'badge-success' : 'badge-danger';
    const statusText = user.is_active ? 'Active' : 'Inactive';
    
    // For must_change_password display if needed
    const passStatus = user.must_change_password 
      ? '<span class="badge badge-warning" style="margin-left: 5px; font-size: 0.65rem;" title="Must change password">New</span>' 
      : '';

    const actionButtons = user.is_active 
      ? `
        <button class="btn btn-sm btn-outline" onclick="openEditMemberModal(${user.id})" title="Edit User">
          <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
        </button>
        <button class="btn btn-sm btn-outline" onclick="resetUserPassword(${user.id})" title="Reset Password">
          <i data-lucide="key" style="width: 14px; height: 14px;"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="toggleUserStatus(${user.id}, false)" title="Deactivate User">
          <i data-lucide="user-x" style="width: 14px; height: 14px;"></i>
        </button>
      `
      : `
        <button class="btn btn-sm btn-success" onclick="toggleUserStatus(${user.id}, true)" title="Activate User">
          <i data-lucide="user-check" style="width: 14px; height: 14px;"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteUserAccount(${user.id})" title="Permanently Delete (Free up Email)">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      `;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="topbar-avatar" style="width: 32px; height: 32px; font-size: 0.8rem;">
              ${user.avatar_url ? `<img src="/api/auth/avatar/${user.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : '<i data-lucide="user"></i>'}
            </div>
            <strong>${user.name}</strong>
          </div>
        </td>
        <td>${user.email}</td>
        <td>${user.position || '—'}</td>
        <td><span class="badge ${user.role === 'admin' ? 'badge-primary' : 'badge-secondary'}">${user.role}</span>${passStatus}</td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
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
  document.getElementById('admin-user-position').value = user.position || '';
  document.getElementById('admin-user-role').value = user.role;
  
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

