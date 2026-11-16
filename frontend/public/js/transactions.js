// ============================================
// Transactions.js — CRUD UI + Records Table
// ============================================

let currentEditId = null;

// =============================================
// TRANSACTION FORM (Add / Edit)
// =============================================
function initTransactionForm() {
  // Initialize the custom single date picker
  if (typeof initSingleDatePicker !== 'undefined') {
    initSingleDatePicker();
  }

  // Type selector buttons & sliding segmented switch
  const switchWrap = document.getElementById('tx-type-switch');
  const typeBtns = document.querySelectorAll('.type-btn');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (switchWrap) switchWrap.dataset.active = type;
      toggleTypeFields(type);
    });
  });

  // Source custom dropdown selection logic
  const sourceItems = document.querySelectorAll('#tx-source-dropdown .dropdown-item');
  const sourceHidden = document.getElementById('tx-source');
  const sourceDisplay = document.getElementById('tx-source-display');
  const sourceCustomWrap = document.getElementById('tx-source-custom-wrap');
  const sourceCustomInput = document.getElementById('tx-source-custom');

  sourceItems.forEach(item => {
    item.addEventListener('click', () => {
      const val = item.dataset.value;
      if (val === '__custom__') {
        if (sourceCustomWrap) sourceCustomWrap.classList.remove('hidden');
        if (sourceCustomInput) {
          sourceCustomInput.focus();
          if (sourceHidden) sourceHidden.value = sourceCustomInput.value.trim();
        }
        if (sourceDisplay) sourceDisplay.textContent = 'Custom Source';
      } else {
        if (sourceCustomWrap) sourceCustomWrap.classList.add('hidden');
        if (sourceHidden) sourceHidden.value = val;
        if (sourceDisplay) sourceDisplay.textContent = item.textContent.trim();
      }
    });
  });

  if (sourceCustomInput) {
    sourceCustomInput.addEventListener('input', (e) => {
      if (sourceHidden) sourceHidden.value = e.target.value.trim();
    });
  }

  // Category custom dropdown selection logic
  const catItems = document.querySelectorAll('#tx-category-dropdown .dropdown-item');
  const catHidden = document.getElementById('tx-category');
  const catDisplay = document.getElementById('tx-category-display');
  catItems.forEach(item => {
    item.addEventListener('click', () => {
      const val = item.dataset.value;
      if (catHidden) catHidden.value = val;
      if (catDisplay) catDisplay.textContent = item.textContent.trim();
    });
  });

  // Amount card click focus helper
  const amountCard = document.getElementById('prominent-amount-card');
  const amountInput = document.getElementById('tx-amount');
  if (amountCard && amountInput) {
    amountCard.addEventListener('click', () => {
      amountInput.focus();
    });
  }

  // Set default date to today
  const dateInput = document.getElementById('tx-date');
  if (dateInput) {
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (typeof setTxDate !== 'undefined') setTxDate(dateStr);
    else dateInput.value = dateStr;
  }

  // Form submit
  const form = document.getElementById('transaction-form');
  if (form) {
    form.addEventListener('submit', handleTransactionSubmit);
  }

  // Reset button
  const resetBtn = document.getElementById('btn-reset-form');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetTransactionForm);
  }

  // Cancel edit
  const cancelEditBtn = document.getElementById('btn-cancel-edit');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', resetTransactionForm);
  }

  // Receipt upload
  initReceiptUpload();
}

function toggleTypeFields(type) {
  const switchWrap = document.getElementById('tx-type-switch');
  if (switchWrap) switchWrap.dataset.active = type;

  const incomeBtn = document.getElementById('switch-income-btn');
  const expenseBtn = document.getElementById('switch-expense-btn');
  const label = document.getElementById('tx-cat-src-label');
  const srcDropdown = document.getElementById('tx-source-dropdown');
  const catDropdown = document.getElementById('tx-category-dropdown');
  const customSrcWrap = document.getElementById('tx-source-custom-wrap');
  const expenseOnly = document.getElementById('expense-only-fields');

  if (type === 'income') {
    if (incomeBtn) incomeBtn.classList.add('active');
    if (expenseBtn) expenseBtn.classList.remove('active');
    if (label) label.textContent = 'Source';
    if (srcDropdown) srcDropdown.classList.remove('hidden');
    if (catDropdown) catDropdown.classList.add('hidden');
    if (expenseOnly) expenseOnly.classList.add('collapsed');
  } else {
    if (expenseBtn) expenseBtn.classList.add('active');
    if (incomeBtn) incomeBtn.classList.remove('active');
    if (label) label.textContent = 'Category';
    if (catDropdown) catDropdown.classList.remove('hidden');
    if (srcDropdown) srcDropdown.classList.add('hidden');
    if (customSrcWrap) customSrcWrap.classList.add('hidden');
    if (expenseOnly) expenseOnly.classList.remove('collapsed');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function handleTransactionSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-transaction');
  if (btn && btn.disabled) return;

  const switchWrap = document.getElementById('tx-type-switch');
  const activeType = document.querySelector('.type-btn.active');
  const type = switchWrap ? (switchWrap.dataset.active || 'income') : (activeType ? activeType.dataset.type : 'income');

  const amountVal = parseFloat(document.getElementById('tx-amount').value);
  if (isNaN(amountVal) || amountVal <= 0) {
    showToast('Please enter a valid amount greater than ₱0.00', 'error');
    const amtInput = document.getElementById('tx-amount');
    if (amtInput) amtInput.focus();
    return;
  }

  const dateVal = document.getElementById('tx-date').value;
  if (!dateVal) {
    showToast('Please select a transaction date', 'error');
    return;
  }

  const payload = {
    type,
    amount: amountVal,
    date: dateVal
  };

  if (type === 'income') {
    const sourceHidden = document.getElementById('tx-source');
    const customInput = document.getElementById('tx-source-custom');
    const srcVal = (sourceHidden && sourceHidden.value) ? sourceHidden.value.trim() : (customInput ? customInput.value.trim() : '');
    if (!srcVal) {
      showToast('Please select or enter the income source', 'error');
      return;
    }
    payload.source = srcVal;
  } else {
    const catHidden = document.getElementById('tx-category');
    const catVal = catHidden ? catHidden.value.trim() : '';
    if (!catVal) {
      showToast('Please select an expense category', 'error');
      return;
    }
    payload.category = catVal;
    const descEl = document.getElementById('tx-description');
    payload.description = descEl ? descEl.value.trim() : null;
  }

  const origBtnContent = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Saving...</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  try {
    const receiptFile = document.getElementById('receipt-file');
    const hasReceipt = type === 'expense' && receiptFile && receiptFile.files.length > 0;

    if (currentEditId) {
      await apiPut(`/transactions/${currentEditId}`, payload);
      showToast('Transaction updated successfully');
      // Upload receipt in background (non-blocking)
      if (hasReceipt) {
        uploadReceiptForExpense(currentEditId, receiptFile.files[0]);
      }
    } else {
      const result = await apiPost('/transactions', payload);
      showToast('Transaction saved successfully');
      // Upload receipt in background (non-blocking)
      if (hasReceipt && result && result.data) {
        uploadReceiptForExpense(result.data.id, receiptFile.files[0]);
      }
    }

    resetTransactionForm();
    if (typeof loadDashboardData === 'function') loadDashboardData();
    if (typeof loadRecords === 'function') loadRecords(1);
  } catch (error) {
    showToast(error.message || 'Error saving transaction', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnContent || '<i data-lucide="save"></i><span>Save Transaction</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

async function uploadReceiptForExpense(transactionId, file) {
  try {
    const formData = new FormData();
    formData.append('transaction_id', transactionId);
    formData.append('receipt', file);
    
    const result = await apiUpload('/receipts/upload', formData);
    if (!result || !result.success) {
      console.error('Receipt upload failed:', result);
      showToast('Transaction saved. Receipt upload failed — try again.', 'warning');
    }
  } catch (err) {
    console.error('Receipt upload error:', err);
    showToast('Transaction saved. Receipt could not be uploaded.', 'warning');
  }
}

function resetTransactionForm() {
  currentEditId = null;
  const form = document.getElementById('transaction-form');
  if (form) form.reset();

  // Reset type to income
  toggleTypeFields('income');

  // Reset date to today
  const dateInput = document.getElementById('tx-date');
  if (dateInput) {
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (typeof setTxDate !== 'undefined') setTxDate(dateStr);
    else dateInput.value = dateStr;
  }

  // Reset custom category dropdown
  setCustomDropdownValue('tx-category-dropdown', '');
  const catDisplay = document.getElementById('tx-category-display');
  if (catDisplay) catDisplay.textContent = 'Select Category';
  const catHidden = document.getElementById('tx-category');
  if (catHidden) catHidden.value = '';

  // Reset custom source dropdown
  setCustomDropdownValue('tx-source-dropdown', '');
  const srcDisplay = document.getElementById('tx-source-display');
  if (srcDisplay) srcDisplay.textContent = 'Select Source';
  const srcHidden = document.getElementById('tx-source');
  if (srcHidden) srcHidden.value = '';
  const customSrcWrap = document.getElementById('tx-source-custom-wrap');
  if (customSrcWrap) customSrcWrap.classList.add('hidden');
  const customSrcInput = document.getElementById('tx-source-custom');
  if (customSrcInput) customSrcInput.value = '';

  // Reset receipt attachment bar
  const fileInput = document.getElementById('receipt-file');
  if (fileInput) fileInput.value = '';
  const titleEl = document.getElementById('receipt-attach-title');
  if (titleEl) titleEl.textContent = 'Attach Receipt (Optional)';
  const subEl = document.getElementById('receipt-attach-sub');
  if (subEl) subEl.textContent = 'JPG, PNG — Max 5MB';
  const uploadIcon = document.getElementById('receipt-upload-icon');
  if (uploadIcon) uploadIcon.classList.remove('hidden');
  const removeBtn = document.getElementById('btn-remove-receipt');
  if (removeBtn) removeBtn.classList.add('hidden');

  // Hide edit banner
  const banner = document.getElementById('edit-mode-banner');
  if (banner) banner.classList.add('hidden');
}

function editTransaction(id) {
  // Navigate to add transaction page and populate form
  navigateTo('add-transaction');

  apiGet(`/transactions/${id}`).then(data => {
    if (!data || !data.success) return;

    const tx = data.data;
    currentEditId = id;

    // Set type and activate correct segmented tab
    toggleTypeFields(tx.type);

    // Set amount
    const amountInput = document.getElementById('tx-amount');
    if (amountInput) amountInput.value = tx.amount;
    
    const dateStr = tx.date ? tx.date.split('T')[0] : '';
    if (typeof setTxDate !== 'undefined') setTxDate(dateStr);
    else {
      const dateInput = document.getElementById('tx-date');
      if (dateInput) dateInput.value = dateStr;
    }

    if (tx.type === 'income') {
      const srcHidden = document.getElementById('tx-source');
      if (srcHidden) srcHidden.value = tx.source || '';
      const srcDisplay = document.getElementById('tx-source-display');
      
      let matched = false;
      document.querySelectorAll('#tx-source-dropdown .dropdown-item').forEach(item => {
        if (item.dataset.value === tx.source) {
          matched = true;
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });

      if (matched) {
        if (srcDisplay) srcDisplay.textContent = tx.source;
        const customWrap = document.getElementById('tx-source-custom-wrap');
        if (customWrap) customWrap.classList.add('hidden');
      } else if (tx.source) {
        if (srcDisplay) srcDisplay.textContent = 'Custom Source';
        const customWrap = document.getElementById('tx-source-custom-wrap');
        if (customWrap) customWrap.classList.remove('hidden');
        const customInput = document.getElementById('tx-source-custom');
        if (customInput) customInput.value = tx.source;
      }
    } else {
      setCustomDropdownValue('tx-category-dropdown', tx.category || '');
      const catDisplay = document.getElementById('tx-category-display');
      if (catDisplay && tx.category) catDisplay.textContent = tx.category;
      const descInput = document.getElementById('tx-description');
      if (descInput) descInput.value = tx.description || '';
    }

    // Show edit banner
    const banner = document.getElementById('edit-mode-banner');
    const editIdEl = document.getElementById('edit-tx-id');
    if (banner) banner.classList.remove('hidden');
    if (editIdEl) editIdEl.textContent = id;

    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}

async function deleteTransaction(id) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;

  try {
    await apiDelete(`/transactions/${id}`);
    showToast('Transaction deleted');
    loadRecords();
    loadDashboardData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// =============================================
// RECEIPT UPLOAD (inline bar on form)
// =============================================
function initReceiptUpload() {
  const area = document.getElementById('receipt-upload-area');
  const fileInput = document.getElementById('receipt-file');
  const removeBtn = document.getElementById('btn-remove-receipt');
  const uploadIcon = document.getElementById('receipt-upload-icon');
  const titleEl = document.getElementById('receipt-attach-title');
  const subEl = document.getElementById('receipt-attach-sub');

  if (!area || !fileInput) return;

  area.addEventListener('click', (e) => {
    if (e.target.closest('#btn-remove-receipt')) return;
    fileInput.click();
  });

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.style.borderColor = 'var(--gold)';
    area.style.background = 'rgba(211, 172, 119, 0.1)';
  });

  area.addEventListener('dragleave', () => {
    area.style.borderColor = '';
    area.style.background = '';
  });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.style.borderColor = '';
    area.style.background = '';
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleReceiptFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleReceiptFile(fileInput.files[0]);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.value = '';
      if (titleEl) titleEl.textContent = 'Attach Receipt (Optional)';
      if (subEl) subEl.textContent = 'JPG, PNG — Max 5MB';
      if (uploadIcon) uploadIcon.classList.remove('hidden');
      removeBtn.classList.add('hidden');
    });
  }

  function handleReceiptFile(file) {
    if (file.size > 5242880) {
      showToast('File size must be under 5MB.', 'error');
      fileInput.value = '';
      return;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    if (titleEl) titleEl.textContent = file.name;
    if (subEl) subEl.textContent = `${sizeMb} MB • Click to change`;
    if (uploadIcon) uploadIcon.classList.add('hidden');
    if (removeBtn) removeBtn.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}


// =============================================
// RECORDS TABLE
// =============================================
function initRecords() {
  // Initialize Custom Date Range Picker dropdown
  initDateRangePicker();

  // Apply filters button
  const applyBtn = document.getElementById('btn-apply-filters');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => loadRecords(1));
  }

  // Sortable headers
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const sort = th.dataset.sort;
      const currentOrder = th.dataset.order || 'desc';
      const newOrder = currentOrder === 'desc' ? 'asc' : 'desc';
      th.dataset.order = newOrder;
      loadRecords(1, sort, newOrder);
    });
  });

  // Load initial data
  loadRecords();
}

async function loadRecords(page = 1, sort = 'date', order = 'desc') {
  const tbody = document.getElementById('records-tbody');
  if (!tbody) return;

  // Get filter values
  const type = document.getElementById('filter-type')?.value || '';
  const startDate = document.getElementById('filter-start')?.value || '';
  const endDate = document.getElementById('filter-end')?.value || '';
  const search = document.getElementById('filter-search')?.value || '';

  let url = `/transactions?page=${page}&sort=${sort}&order=${order}&limit=7`;
  if (type) url += `&type=${type}`;
  if (startDate) url += `&startDate=${startDate}`;
  if (endDate) url += `&endDate=${endDate}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  // Show skeletons
  tbody.innerHTML = Array(7).fill(0).map(() => `
    <tr>
      <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width: 70px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width: 90px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width: 30px;"></div></td>
      <td><div class="skeleton skeleton-text" style="width: 50px;"></div></td>
    </tr>
  `).join('');

  try {
    const data = await apiGet(url);
    if (!data || !data.success) return;

    const { data: records, pagination } = data;

    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No records found</td></tr>';
    } else {
      tbody.innerHTML = records.map(r => {
        tbody.classList.add('content-fade-in');
        const detail = r.type === 'income' ? (r.source || '—') : (r.category || '—');
        const desc = r.description || '—';
        const officerActions = isAdmin() ? `
          <div class="action-buttons">
            <button class="btn-icon" onclick="editTransaction(${r.id})" title="Edit">
              <i data-lucide="edit-2"></i>
            </button>
            <button class="btn-icon danger" onclick="deleteTransaction(${r.id})" title="Delete">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        ` : '—';

        const receiptBtn = r.receipt_id
          ? `<button class="btn btn-sm btn-secondary" onclick="viewReceipt(${r.receipt_id})"><i data-lucide="image"></i></button>`
          : '<span class="text-muted">—</span>';

        return `
          <tr>
            <td>${formatDate(r.date)}</td>
            <td><span class="type-badge ${r.type}">${r.type}</span></td>
            <td style="font-weight:600">${formatPeso(r.amount)}</td>
            <td>${detail}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${desc}</td>
            <td>${r.user_name || '—'}</td>
            <td>${receiptBtn}</td>
            <td class="col-actions">${officerActions}</td>
          </tr>
        `;
      }).join('');
    }

    // Pagination
    renderPagination(pagination, sort, order);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Error loading records</td></tr>';
  }
}

function renderPagination(pagination, sort, order) {
  const container = document.getElementById('records-pagination');
  if (!container || !pagination) return;

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const currentPage = pagination.page;

  let html = `
    <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="loadRecords(${currentPage - 1}, '${sort}', '${order}')">
      <i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i> Previous
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    const isActive = i === currentPage;
    html += `
      <button class="pagination-number ${isActive ? 'active' : ''}" onclick="loadRecords(${i}, '${sort}', '${order}')">
        ${i}
      </button>
    `;
  }

  html += `
    <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="loadRecords(${currentPage + 1}, '${sort}', '${order}')">
      Next <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
    </button>
  `;

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================================================
// DUAL-CALENDAR DATE RANGE PICKER CONTROLLER
// ============================================================================
let calStartYear, calStartMonth;
let calEndYear, calEndMonth;
let tempStartDate = null;
let tempEndDate = null;

function initDateRangePicker() {
  const trigger = document.getElementById('date-range-trigger');
  const panel = document.getElementById('date-range-panel');
  const cancelBtn = document.getElementById('cal-btn-cancel');
  const saveBtn = document.getElementById('cal-btn-save');
  const clearBtn = document.getElementById('cal-btn-clear');
  
  if (!trigger || !panel) return;

  // Toggle panel display
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    if (isHidden) {
      // Close all other dropdowns cleanly
      document.querySelectorAll('.dropdown-menu').forEach(d => {
        // Only clear inline display if it was set to none by something else, but generally we rely on the .active class
        if (d.id !== 'date-range-panel') d.style.display = ''; 
      });
      document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
      
      // Initialize temp values from hidden inputs
      const startVal = document.getElementById('filter-start').value;
      const endVal = document.getElementById('filter-end').value;
      
      tempStartDate = startVal ? new Date(startVal) : null;
      tempEndDate = endVal ? new Date(endVal) : null;
      
      const now = new Date();
      calStartYear = tempStartDate ? tempStartDate.getFullYear() : now.getFullYear();
      calStartMonth = tempStartDate ? tempStartDate.getMonth() : now.getMonth();
      
      // Default end calendar to start calendar month, or next month if not set
      if (tempEndDate) {
        calEndYear = tempEndDate.getFullYear();
        calEndMonth = tempEndDate.getMonth();
      } else {
        calEndYear = calStartYear;
        calEndMonth = calStartMonth;
      }
      
      panel.style.display = 'flex';
      renderBothCalendars();
      updateCalFooter();
    } else {
      panel.style.display = 'none';
    }
  });

  // Prevent clicking inside panel from closing it
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Close panel on clicking outside
  document.addEventListener('click', () => {
    panel.style.display = 'none';
  });

  // Prev / Next month buttons
  document.getElementById('cal-start-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    if (calStartMonth === 0) {
      calStartMonth = 11;
      calStartYear--;
    } else {
      calStartMonth--;
    }
    renderBothCalendars();
  });

  document.getElementById('cal-start-next').addEventListener('click', (e) => {
    e.stopPropagation();
    if (calStartMonth === 11) {
      calStartMonth = 0;
      calStartYear++;
    } else {
      calStartMonth++;
    }
    renderBothCalendars();
  });

  document.getElementById('cal-end-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    if (calEndMonth === 0) {
      calEndMonth = 11;
      calEndYear--;
    } else {
      calEndMonth--;
    }
    renderBothCalendars();
  });

  document.getElementById('cal-end-next').addEventListener('click', (e) => {
    e.stopPropagation();
    if (calEndMonth === 11) {
      calEndMonth = 0;
      calEndYear++;
    } else {
      calEndMonth++;
    }
    renderBothCalendars();
  });

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tempStartDate = null;
      tempEndDate = null;
      renderBothCalendars();
      updateCalFooter();
    });
  }

  // Cancel button
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.style.display = 'none';
  });

  // Save button
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Save selections to hidden inputs
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');
    const displaySpan = document.getElementById('date-range-display');
    
    if (tempStartDate && tempEndDate) {
      // Format to YYYY-MM-DD for backend
      const startFmtBackend = tempStartDate.getFullYear() + '-' + String(tempStartDate.getMonth() + 1).padStart(2, '0') + '-' + String(tempStartDate.getDate()).padStart(2, '0');
      const endFmtBackend = tempEndDate.getFullYear() + '-' + String(tempEndDate.getMonth() + 1).padStart(2, '0') + '-' + String(tempEndDate.getDate()).padStart(2, '0');
      
      startInput.value = startFmtBackend;
      endInput.value = endFmtBackend;
      
      // Format to DD/MM/YYYY - DD/MM/YYYY for UI display
      const startFmt = formatDateDMY(tempStartDate);
      const endFmt = formatDateDMY(tempEndDate);
      displaySpan.textContent = `${startFmt} - ${endFmt}`;
      displaySpan.style.color = 'var(--text-primary)';
    } else {
      startInput.value = '';
      endInput.value = '';
      displaySpan.textContent = 'Select Date Range';
      displaySpan.style.color = 'var(--text-secondary)';
    }
    
    panel.style.display = 'none';
    // User must click 'Filter' to apply, removed loadRecords(1) here
  });
}

// Date formatter helpers
function formatDateDMY(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function renderBothCalendars() {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Left calendar (Start)
  document.getElementById('cal-start-month-year').textContent = `${months[calStartMonth]} ${calStartYear}`;
  renderCalendar('cal-start-grid', calStartYear, calStartMonth, 'start');
  
  // Right calendar (End)
  document.getElementById('cal-end-month-year').textContent = `${months[calEndMonth]} ${calEndYear}`;
  renderCalendar('cal-end-grid', calEndYear, calEndMonth, 'end');
}

function renderCalendar(gridId, year, month, type) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  
  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  let html = daysOfWeek.map(d => `<div class="calendar-header-day">${d}</div>`).join('');
  
  const firstDayIndex = new Date(year, month, 1).getDay();
  const numDays = new Date(year, month + 1, 0).getDate();
  
  // Empty slots before month start
  for (let i = 0; i < firstDayIndex; i++) {
    html += `<div class="calendar-day-btn empty"></div>`;
  }
  
  // Render day buttons
  for (let d = 1; d <= numDays; d++) {
    const curDate = new Date(year, month, d);
    let classes = 'calendar-day-btn';
    
    // Check range highlight
    if (tempStartDate && isSameDay(curDate, tempStartDate)) {
      classes += ' selected';
    } else if (tempEndDate && isSameDay(curDate, tempEndDate)) {
      classes += ' selected';
    } else if (tempStartDate && tempEndDate && curDate > tempStartDate && curDate < tempEndDate) {
      classes += ' in-range';
    }
    
    html += `<button type="button" class="${classes}" onclick="handleCalDayClick('${type}', ${year}, ${month}, ${d})">${d}</button>`;
  }
  
  grid.innerHTML = html;
}

function handleCalDayClick(type, year, month, day) {
  const clickedDate = new Date(year, month, day);
  
  if (type === 'start') {
    tempStartDate = clickedDate;
    // If start date is now more advanced than end date, reset/swap them
    if (tempEndDate && tempStartDate > tempEndDate) {
      tempEndDate = new Date(tempStartDate);
    }
  } else {
    tempEndDate = clickedDate;
    // If end date is earlier than start date, make start date equal to end date
    if (tempStartDate && tempEndDate < tempStartDate) {
      tempStartDate = new Date(tempEndDate);
    }
  }
  
  renderBothCalendars();
  updateCalFooter();
}

function updateCalFooter() {
  const countSpan = document.getElementById('date-range-days-count');
  const detailsSpan = document.getElementById('date-range-details');
  
  if (tempStartDate && tempEndDate) {
    const diffTime = Math.abs(tempEndDate - tempStartDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
    
    countSpan.textContent = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} selected`;
    detailsSpan.textContent = `${formatDateDMY(tempStartDate)} - ${formatDateDMY(tempEndDate)}`;
  } else if (tempStartDate) {
    countSpan.textContent = 'Selecting end date...';
    detailsSpan.textContent = `Start: ${formatDateDMY(tempStartDate)}`;
  } else {
    countSpan.textContent = 'No range selected';
    detailsSpan.textContent = 'Click dates on calendars above';
  }
}

// Attach event handler to global window scope so it can be called via inline onclick
window.handleCalDayClick = handleCalDayClick;

// --- SINGLE DATE PICKER FOR TRANSACTION FORM ---
let txCalYear = new Date().getFullYear();
let txCalMonth = new Date().getMonth();

function setTxDate(dateStr) {
  const hiddenInput = document.getElementById('tx-date');
  if (hiddenInput) hiddenInput.value = dateStr;

  const display = document.getElementById('tx-date-display');
  if (!display) return;

  if (dateStr) {
    // Expected dateStr is YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      // Format as MM/DD/YYYY matching reference design
      display.textContent = `${parts[1]}/${parts[2]}/${parts[0]}`;
      display.style.color = 'var(--text-primary)';
    }
  } else {
    display.textContent = 'Select Date';
    display.style.color = 'var(--text-secondary)';
  }
}

function initSingleDatePicker() {
  const trigger = document.getElementById('tx-date-trigger');
  const panel = document.getElementById('tx-date-panel');
  if (!trigger || !panel) return;

  // Toggle panel
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = panel.style.display === 'flex';
    
    // Close standard custom dropdowns properly without overriding inline styles
    document.querySelectorAll('.custom-dropdown').forEach(d => {
      d.classList.remove('active');
    });

    if (isVisible) {
      panel.style.display = 'none';
      trigger.style.border = '1px solid var(--border-color)';
      trigger.style.boxShadow = 'none';
    } else {
      panel.style.display = 'flex';
      trigger.style.border = '1px solid var(--gold)';
      trigger.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.1)';
      
      const hiddenVal = document.getElementById('tx-date').value;
      if (hiddenVal) {
        const parts = hiddenVal.split('-');
        if (parts.length === 3) {
          txCalYear = parseInt(parts[0]);
          txCalMonth = parseInt(parts[1]) - 1;
        }
      } else {
        const now = new Date();
        txCalYear = now.getFullYear();
        txCalMonth = now.getMonth();
      }
      renderTxCalendar();
    }
  });

  // Close panel on outside click
  document.addEventListener('click', (e) => {
    if (!trigger.contains(e.target) && !panel.contains(e.target)) {
      panel.style.display = 'none';
      trigger.style.border = '1px solid var(--border-color)';
      trigger.style.boxShadow = 'none';
    }
  });

  // Calendar Navigation
  const prevBtn = document.getElementById('tx-cal-prev');
  if(prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      txCalMonth--;
      if (txCalMonth < 0) { txCalMonth = 11; txCalYear--; }
      renderTxCalendar();
    });
  }

  const nextBtn = document.getElementById('tx-cal-next');
  if(nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      txCalMonth++;
      if (txCalMonth > 11) { txCalMonth = 0; txCalYear++; }
      renderTxCalendar();
    });
  }

  // Footer Buttons
  const cancelBtn = document.getElementById('tx-cal-btn-cancel');
  if(cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = 'none';
      trigger.style.border = '1px solid var(--border-color)';
      trigger.style.boxShadow = 'none';
    });
  }

  const todayBtn = document.getElementById('tx-cal-btn-today');
  if(todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      setTxDate(dateStr);
      panel.style.display = 'none';
      trigger.style.border = '1px solid var(--border-color)';
      trigger.style.boxShadow = 'none';
    });
  }
}

function renderTxCalendar() {
  const grid = document.getElementById('tx-cal-grid');
  const monthYearSpan = document.getElementById('tx-cal-month-year');
  if (!grid) return;

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  monthYearSpan.textContent = `${months[txCalMonth]} ${txCalYear}`;

  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  let html = daysOfWeek.map(d => `<div class="calendar-header-day">${d}</div>`).join('');
  
  const firstDayIndex = new Date(txCalYear, txCalMonth, 1).getDay();
  const numDays = new Date(txCalYear, txCalMonth + 1, 0).getDate();
  
  for (let i = 0; i < firstDayIndex; i++) {
    html += `<div class="calendar-day-btn empty"></div>`;
  }

  const today = new Date();
  const hiddenVal = document.getElementById('tx-date').value;
  let selectedDate = null;
  if (hiddenVal) {
    const parts = hiddenVal.split('-');
    if (parts.length === 3) {
      selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }

  for (let d = 1; d <= numDays; d++) {
    const curDate = new Date(txCalYear, txCalMonth, d);
    let classes = 'calendar-day-btn';
    
    if (isSameDay(curDate, today)) classes += ' today';
    if (selectedDate && isSameDay(curDate, selectedDate)) classes += ' selected';
    
    html += `<button type="button" class="${classes}" onclick="handleTxDayClick(${txCalYear}, ${txCalMonth}, ${d})">${d}</button>`;
  }
  
  grid.innerHTML = html;
}

function handleTxDayClick(year, month, day) {
  const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  setTxDate(dateStr);
  const panel = document.getElementById('tx-date-panel');
  const trigger = document.getElementById('tx-date-trigger');
  if(panel) panel.style.display = 'none';
  if(trigger) {
    trigger.style.border = '1px solid var(--border-color)';
    trigger.style.boxShadow = 'none';
  }
}

window.handleTxDayClick = handleTxDayClick;
