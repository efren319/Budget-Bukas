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

  // Source & Category custom dropdown selection logic (both support "Other")
  bindCustomSelectWithOther({
    dropdownId: 'tx-source-dropdown',
    hiddenId: 'tx-source',
    displayId: 'tx-source-display',
    customWrapId: 'tx-source-custom-wrap',
    customInputId: 'tx-source-custom',
    customLabel: 'Custom Source'
  });

  bindCustomSelectWithOther({
    dropdownId: 'tx-category-dropdown',
    hiddenId: 'tx-category',
    displayId: 'tx-category-display',
    customWrapId: 'tx-category-custom-wrap',
    customInputId: 'tx-category-custom',
    customLabel: 'Custom Category'
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

function bindCustomSelectWithOther({ dropdownId, hiddenId, displayId, customWrapId, customInputId, customLabel }) {
  const items = document.querySelectorAll(`#${dropdownId} .dropdown-item`);
  const hiddenInput = document.getElementById(hiddenId);
  const displayEl = document.getElementById(displayId);
  const customWrap = document.getElementById(customWrapId);
  const customInput = document.getElementById(customInputId);

  items.forEach(item => {
    item.addEventListener('click', () => {
      const val = item.dataset.value;
      if (val === '__custom__') {
        if (customWrap) customWrap.classList.remove('hidden');
        if (customInput) {
          customInput.focus();
          if (hiddenInput) hiddenInput.value = customInput.value.trim();
        }
        if (displayEl) displayEl.textContent = customLabel;
      } else {
        if (customWrap) customWrap.classList.add('hidden');
        if (hiddenInput) hiddenInput.value = val;
        if (displayEl) displayEl.textContent = item.textContent.trim();
      }
    });
  });

  if (customInput) {
    customInput.addEventListener('input', (e) => {
      if (hiddenInput) hiddenInput.value = e.target.value.trim();
    });
  }
}

function setCustomSelectWithOtherValue({ dropdownId, hiddenId, displayId, customWrapId, customInputId, customLabel, defaultDisplay, value }) {
  const hiddenInput = document.getElementById(hiddenId);
  const displayEl = document.getElementById(displayId);
  const customWrap = document.getElementById(customWrapId);
  const customInput = document.getElementById(customInputId);
  const items = document.querySelectorAll(`#${dropdownId} .dropdown-item`);

  if (!value) {
    items.forEach(item => item.classList.remove('selected'));
    if (hiddenInput) hiddenInput.value = '';
    if (displayEl) displayEl.textContent = defaultDisplay;
    if (customWrap) customWrap.classList.add('hidden');
    if (customInput) customInput.value = '';
    return;
  }

  let matched = false;
  items.forEach(item => {
    if (item.dataset.value === value && value !== '__custom__') {
      matched = true;
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  if (hiddenInput) hiddenInput.value = value;

  if (matched) {
    if (displayEl) displayEl.textContent = value;
    if (customWrap) customWrap.classList.add('hidden');
    if (customInput) customInput.value = '';
  } else {
    const customOption = document.querySelector(`#${dropdownId} .dropdown-item[data-value="__custom__"]`);
    if (customOption) customOption.classList.add('selected');
    if (displayEl) displayEl.textContent = customLabel;
    if (customWrap) customWrap.classList.remove('hidden');
    if (customInput) customInput.value = value;
  }
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
  const customCatWrap = document.getElementById('tx-category-custom-wrap');
  const expenseOnly = document.getElementById('expense-only-fields');

  if (type === 'income') {
    if (incomeBtn) incomeBtn.classList.add('active');
    if (expenseBtn) expenseBtn.classList.remove('active');
    if (label) label.textContent = 'Source';
    if (srcDropdown) srcDropdown.classList.remove('hidden');
    if (catDropdown) catDropdown.classList.add('hidden');
    if (customCatWrap) customCatWrap.classList.add('hidden');
    if (customSrcWrap && srcDropdown?.querySelector('.dropdown-item[data-value="__custom__"]')?.classList.contains('selected')) {
      customSrcWrap.classList.remove('hidden');
    }
    if (expenseOnly) expenseOnly.classList.add('collapsed');
  } else {
    if (expenseBtn) expenseBtn.classList.add('active');
    if (incomeBtn) incomeBtn.classList.remove('active');
    if (label) label.textContent = 'Category';
    if (catDropdown) catDropdown.classList.remove('hidden');
    if (srcDropdown) srcDropdown.classList.add('hidden');
    if (customSrcWrap) customSrcWrap.classList.add('hidden');
    if (customCatWrap && catDropdown?.querySelector('.dropdown-item[data-value="__custom__"]')?.classList.contains('selected')) {
      customCatWrap.classList.remove('hidden');
    }
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
    const srcVal = (sourceHidden && sourceHidden.value && sourceHidden.value !== '__custom__')
      ? sourceHidden.value.trim()
      : (customInput ? customInput.value.trim() : '');
    if (!srcVal) {
      showToast('Please select or enter the income source', 'error');
      return;
    }
    payload.source = srcVal;
  } else {
    const catHidden = document.getElementById('tx-category');
    const customCatInput = document.getElementById('tx-category-custom');
    const catVal = (catHidden && catHidden.value && catHidden.value !== '__custom__')
      ? catHidden.value.trim()
      : (customCatInput ? customCatInput.value.trim() : '');
    if (!catVal) {
      showToast('Please select or enter an expense category', 'error');
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
  setCustomSelectWithOtherValue({
    dropdownId: 'tx-category-dropdown',
    hiddenId: 'tx-category',
    displayId: 'tx-category-display',
    customWrapId: 'tx-category-custom-wrap',
    customInputId: 'tx-category-custom',
    customLabel: 'Custom Category',
    defaultDisplay: 'Select Category',
    value: ''
  });

  // Reset custom source dropdown
  setCustomSelectWithOtherValue({
    dropdownId: 'tx-source-dropdown',
    hiddenId: 'tx-source',
    displayId: 'tx-source-display',
    customWrapId: 'tx-source-custom-wrap',
    customInputId: 'tx-source-custom',
    customLabel: 'Custom Source',
    defaultDisplay: 'Select Source',
    value: ''
  });

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
      setCustomSelectWithOtherValue({
        dropdownId: 'tx-source-dropdown',
        hiddenId: 'tx-source',
        displayId: 'tx-source-display',
        customWrapId: 'tx-source-custom-wrap',
        customInputId: 'tx-source-custom',
        customLabel: 'Custom Source',
        defaultDisplay: 'Select Source',
        value: tx.source || ''
      });
    } else {
      setCustomSelectWithOtherValue({
        dropdownId: 'tx-category-dropdown',
        hiddenId: 'tx-category',
        displayId: 'tx-category-display',
        customWrapId: 'tx-category-custom-wrap',
        customInputId: 'tx-category-custom',
        customLabel: 'Custom Category',
        defaultDisplay: 'Select Category',
        value: tx.category || ''
      });
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
let currentRecordsSort = 'date';
let currentRecordsOrder = 'desc';
let recordsRequestSeq = 0;

function initRecords() {
  // Initialize Custom Date Range Picker dropdown
  initDateRangePicker();

  // Instant filter on Type dropdown change
  const typeFilterInput = document.getElementById('filter-type');
  if (typeFilterInput) {
    typeFilterInput.addEventListener('change', () => loadRecords(1));
  }

  // Live debounced search + immediate Enter search
  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => loadRecords(1), 300);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchDebounce);
        loadRecords(1);
      }
    });
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

async function loadRecords(page = 1, sort = currentRecordsSort, order = currentRecordsOrder) {
  const tbody = document.getElementById('records-tbody');
  if (!tbody) return;

  currentRecordsSort = sort;
  currentRecordsOrder = order;
  const reqId = ++recordsRequestSeq;

  // Get filter values
  const type = document.getElementById('filter-type')?.value || '';
  const startDate = document.getElementById('filter-start')?.value || '';
  const endDate = document.getElementById('filter-end')?.value || '';
  const search = (document.getElementById('filter-search')?.value || '').trim();

  let url = `/transactions?page=${page}&sort=${sort}&order=${order}&limit=7`;
  if (type) url += `&type=${encodeURIComponent(type)}`;
  if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
  if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
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
    if (reqId !== recordsRequestSeq) return;
    if (!data || !data.success) return;

    const { data: records, pagination } = data;

    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No records found</td></tr>';
    } else {
      tbody.classList.add('content-fade-in');
      tbody.innerHTML = records.map(r => {
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
    if (reqId !== recordsRequestSeq) return;
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
// RECORDS DATE RANGE PICKER (Financial Date Filter Layout & Auto-Apply)
// ============================================================================
let recCalViewYear = new Date().getFullYear();
let recCalViewMonth = new Date().getMonth();
let recSelectedStart = null;
let recSelectedEnd = null;
let recActiveEndpoint = 'start';

function formatRecCalDisplayDate(ymdStr) {
  if (!ymdStr) return '';
  if (typeof formatCalDisplayDate === 'function') {
    return formatCalDisplayDate(ymdStr);
  }
  const parts = ymdStr.split('-');
  if (parts.length < 3) return ymdStr;
  const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}, ${date.getFullYear()}`;
}

function getTodayYMD() {
  if (typeof dateToYMD === 'function') {
    return dateToYMD(new Date());
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function syncRecDateFilterInputs(startStr, endStr) {
  const startInput = document.getElementById('filter-start');
  const endInput = document.getElementById('filter-end');
  const displaySpan = document.getElementById('date-range-display');
  const startBtnDisplay = document.getElementById('rec-cal-start-display');
  const endBtnDisplay = document.getElementById('rec-cal-end-display');
  const statusEl = document.getElementById('rec-date-range-status');

  if (startStr && endStr) {
    if (startInput) startInput.value = startStr;
    if (endInput) endInput.value = endStr;

    const startLabel = formatRecCalDisplayDate(startStr);
    const endLabel = formatRecCalDisplayDate(endStr);

    if (displaySpan) {
      displaySpan.textContent = startStr === endStr ? startLabel : `${startLabel} → ${endLabel}`;
      displaySpan.style.color = 'var(--text-primary)';
    }
    if (startBtnDisplay) startBtnDisplay.textContent = startLabel;
    if (endBtnDisplay) endBtnDisplay.textContent = endLabel;

    if (statusEl) {
      const sParts = startStr.split('-').map(Number);
      const eParts = endStr.split('-').map(Number);
      const sDate = new Date(sParts[0], sParts[1] - 1, sParts[2]);
      const eDate = new Date(eParts[0], eParts[1] - 1, eParts[2]);
      const diffDays = Math.round(Math.abs(eDate - sDate) / 86400000) + 1;
      statusEl.textContent = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} selected`;
    }
  } else {
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    if (displaySpan) {
      displaySpan.textContent = 'Select Date Range';
      displaySpan.style.color = 'var(--text-secondary)';
    }
    if (startBtnDisplay) startBtnDisplay.textContent = 'Select date';
    if (endBtnDisplay) endBtnDisplay.textContent = 'Select date';
    if (statusEl) statusEl.textContent = 'All dates';
  }
}

function initDateRangePicker() {
  const dropdown = document.getElementById('date-range-picker-dropdown');
  const trigger = document.getElementById('date-range-trigger');
  const panel = document.getElementById('date-range-panel');
  const startBtn = document.getElementById('rec-cal-start-btn');
  const endBtn = document.getElementById('rec-cal-end-btn');
  const prevMonthBtn = document.getElementById('rec-cal-prev-month');
  const nextMonthBtn = document.getElementById('rec-cal-next-month');
  const resetBtn = document.getElementById('rec-cal-reset-btn');

  if (!trigger || !panel || !dropdown) return;

  function closePanel() {
    panel.style.display = 'none';
    dropdown.classList.remove('active');
    if (typeof hideCalendarTooltip === 'function') hideCalendarTooltip();
  }

  // Toggle panel display
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    if (isHidden) {
      document.querySelectorAll('.dropdown-menu').forEach(d => {
        if (d.id !== 'date-range-panel') d.style.display = '';
      });
      document.querySelectorAll('.custom-dropdown').forEach(d => {
        if (d.id !== 'date-range-picker-dropdown') d.classList.remove('active');
      });

      const startVal = document.getElementById('filter-start')?.value || '';
      const endVal = document.getElementById('filter-end')?.value || '';
      recSelectedStart = startVal || null;
      recSelectedEnd = endVal || null;

      if (recSelectedEnd) {
        const [eY, eM] = recSelectedEnd.split('-').map(Number);
        recCalViewYear = eY;
        recCalViewMonth = eM - 1;
      } else if (recSelectedStart) {
        const [sY, sM] = recSelectedStart.split('-').map(Number);
        recCalViewYear = sY;
        recCalViewMonth = sM - 1;
      } else {
        const now = new Date();
        recCalViewYear = now.getFullYear();
        recCalViewMonth = now.getMonth();
      }

      syncRecDateFilterInputs(recSelectedStart, recSelectedEnd);
      dropdown.classList.add('active');
      panel.style.display = 'flex';
      renderRecCalendar();
    } else {
      closePanel();
    }
  });

  // Prevent clicking inside panel from closing it
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Close panel on outside click or Escape
  document.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.style.display === 'flex') closePanel();
  });

  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recActiveEndpoint = 'start';
      renderRecCalendar();
    });
  }

  if (endBtn) {
    endBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recActiveEndpoint = 'end';
      renderRecCalendar();
    });
  }

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recCalViewMonth--;
      if (recCalViewMonth < 0) {
        recCalViewMonth = 11;
        recCalViewYear--;
      }
      renderRecCalendar();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      recCalViewMonth++;
      if (recCalViewMonth > 11) {
        recCalViewMonth = 0;
        recCalViewYear++;
      }
      renderRecCalendar();
    });
  }

  // Reset button — clears date filter and applies immediately
  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hadActiveRange = Boolean(
        document.getElementById('filter-start')?.value ||
        document.getElementById('filter-end')?.value
      );
      recSelectedStart = null;
      recSelectedEnd = null;
      recActiveEndpoint = 'start';

      const now = new Date();
      recCalViewYear = now.getFullYear();
      recCalViewMonth = now.getMonth();

      syncRecDateFilterInputs('', '');
      renderRecCalendar();
      if (hadActiveRange) {
        loadRecords(1);
      }
    });
  }
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function renderRecCalendar() {
  const monthYearDisplay = document.getElementById('rec-cal-month-year');
  const startBtn = document.getElementById('rec-cal-start-btn');
  const endBtn = document.getElementById('rec-cal-end-btn');
  const gridEl = document.getElementById('rec-cal-grid');
  if (!gridEl) return;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (monthYearDisplay) {
    monthYearDisplay.textContent = `${months[recCalViewMonth]} ${recCalViewYear}`;
  }
  if (startBtn) startBtn.classList.toggle('active', recActiveEndpoint === 'start');
  if (endBtn) endBtn.classList.toggle('active', recActiveEndpoint === 'end');

  gridEl.innerHTML = '';

  const firstDayIndex = new Date(recCalViewYear, recCalViewMonth, 1).getDay();
  const daysInMonth = new Date(recCalViewYear, recCalViewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(recCalViewYear, recCalViewMonth, 0).getDate();
  const todayStr = getTodayYMD();

  // Leading days from previous month
  const prevMonthIdx = recCalViewMonth === 0 ? 11 : recCalViewMonth - 1;
  const prevYear = recCalViewMonth === 0 ? recCalViewYear - 1 : recCalViewYear;
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const dateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    gridEl.appendChild(createRecCalendarDayCell(dayNum, dateStr, true, todayStr));
  }

  // Days in current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${recCalViewYear}-${String(recCalViewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    gridEl.appendChild(createRecCalendarDayCell(d, dateStr, false, todayStr));
  }

  // Trailing days from next month to fill row
  const totalRendered = firstDayIndex + daysInMonth;
  const remaining = (7 - (totalRendered % 7)) % 7;
  const nextMonthIdx = recCalViewMonth === 11 ? 0 : recCalViewMonth + 1;
  const nextYear = recCalViewMonth === 11 ? recCalViewYear + 1 : recCalViewYear;
  for (let d = 1; d <= remaining; d++) {
    const dateStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    gridEl.appendChild(createRecCalendarDayCell(d, dateStr, true, todayStr));
  }
}

function createRecCalendarDayCell(dayNum, dateStr, isOtherMonth, todayStr) {
  const cell = document.createElement('div');
  cell.className = 'fin-cal-day-cell';
  cell.dataset.date = dateStr;

  if (isOtherMonth) cell.classList.add('other-month');
  if (dateStr === todayStr) cell.classList.add('today');

  if (recSelectedStart && recSelectedEnd) {
    if (recSelectedStart === recSelectedEnd && dateStr === recSelectedStart) {
      cell.classList.add('selected-single', 'endpoint-active');
    } else if (dateStr === recSelectedStart) {
      cell.classList.add('selected-start');
      if (recActiveEndpoint === 'start') cell.classList.add('endpoint-active');
    } else if (dateStr === recSelectedEnd) {
      cell.classList.add('selected-end');
      if (recActiveEndpoint === 'end') cell.classList.add('endpoint-active');
    } else if (dateStr > recSelectedStart && dateStr < recSelectedEnd) {
      cell.classList.add('in-range');
    }
  }

  const numSpan = document.createElement('span');
  numSpan.className = 'fin-cal-day-num';
  numSpan.textContent = String(dayNum);
  cell.appendChild(numSpan);

  // Reuse Financial Date Filter activity dots when available
  const act = typeof calendarActivityMap !== 'undefined' ? calendarActivityMap.get(dateStr) : null;
  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'fin-cal-dots-wrap';
  if (act && act.incomeCount > 0) {
    const dotInc = document.createElement('span');
    dotInc.className = 'fin-cal-dot fin-cal-dot-income';
    dotsWrap.appendChild(dotInc);
  }
  if (act && act.expenseCount > 0) {
    const dotExp = document.createElement('span');
    dotExp.className = 'fin-cal-dot fin-cal-dot-expense';
    dotsWrap.appendChild(dotExp);
  }
  cell.appendChild(dotsWrap);

  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    handleRecCalendarDateClick(dateStr);
  });

  if (typeof showCalendarTooltip === 'function') {
    cell.addEventListener('mouseenter', (e) => showCalendarTooltip(e, dateStr));
    cell.addEventListener('mousemove', (e) => positionCalendarTooltip(e));
    cell.addEventListener('mouseleave', () => hideCalendarTooltip());
  }

  return cell;
}

function handleRecCalendarDateClick(clickedDateStr) {
  const parts = clickedDateStr.split('-');
  const clickedY = parseInt(parts[0], 10);
  const clickedM = parseInt(parts[1], 10);
  if (clickedY !== recCalViewYear || clickedM - 1 !== recCalViewMonth) {
    recCalViewYear = clickedY;
    recCalViewMonth = clickedM - 1;
  }

  if (!recSelectedStart || !recSelectedEnd) {
    recSelectedStart = clickedDateStr;
    recSelectedEnd = clickedDateStr;
    if (recActiveEndpoint === 'start') {
      recActiveEndpoint = 'end';
    }
  } else if (recActiveEndpoint === 'start') {
    if (clickedDateStr <= recSelectedEnd) {
      recSelectedStart = clickedDateStr;
    } else {
      recSelectedStart = recSelectedEnd;
      recSelectedEnd = clickedDateStr;
    }
  } else {
    if (clickedDateStr >= recSelectedStart) {
      recSelectedEnd = clickedDateStr;
    } else {
      recSelectedEnd = recSelectedStart;
      recSelectedStart = clickedDateStr;
    }
  }

  syncRecDateFilterInputs(recSelectedStart, recSelectedEnd);
  renderRecCalendar();
  loadRecords(1);
}

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
