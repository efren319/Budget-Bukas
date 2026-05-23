// ============================================
// Transactions.js — CRUD UI + Records Table
// ============================================

let currentEditId = null;

// =============================================
// TRANSACTION FORM (Add / Edit)
// =============================================
function initTransactionForm() {
  // Type selector buttons
  const typeBtns = document.querySelectorAll('.type-btn');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      toggleTypeFields(btn.dataset.type);
    });
  });

  // Set default date to today
  const dateInput = document.getElementById('tx-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
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
  const incomeFields = document.querySelectorAll('.income-fields');
  const expenseFields = document.querySelectorAll('.expense-fields');

  if (type === 'income') {
    incomeFields.forEach(f => f.classList.remove('hidden'));
    expenseFields.forEach(f => f.classList.add('hidden'));
  } else {
    incomeFields.forEach(f => f.classList.add('hidden'));
    expenseFields.forEach(f => f.classList.remove('hidden'));
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function handleTransactionSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-transaction');

  const activeType = document.querySelector('.type-btn.active');
  const type = activeType ? activeType.dataset.type : 'income';

  const payload = {
    type,
    amount: parseFloat(document.getElementById('tx-amount').value),
    date: document.getElementById('tx-date').value
  };

  if (type === 'income') {
    payload.source = document.getElementById('tx-source').value;
    if (!payload.source) {
      showToast('Please enter the income source', 'error');
      return;
    }
  } else {
    payload.category = document.getElementById('tx-category').value;
    payload.description = document.getElementById('tx-description').value;
    if (!payload.category) {
      showToast('Please select a category', 'error');
      return;
    }
  }

  btn.disabled = true;

  try {
    const receiptFile = document.getElementById('receipt-file');
    const hasReceipt = type === 'expense' && receiptFile && receiptFile.files.length > 0;

    if (currentEditId) {
      await apiPut(`/transactions/${currentEditId}`, payload);
      // Also upload receipt if a new one was selected during edit
      if (hasReceipt) {
        await uploadReceiptForExpense(currentEditId, receiptFile.files[0]);
      }
      showToast('Transaction updated successfully');
    } else {
      const result = await apiPost('/transactions', payload);
      if (hasReceipt && result && result.data) {
        await uploadReceiptForExpense(result.data.id, receiptFile.files[0]);
      }
      showToast('Transaction saved successfully');
    }

    resetTransactionForm();
    loadDashboardData();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.disabled = false;
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
    }
  } catch (err) {
    console.error('Receipt upload error:', err);
    // Non-blocking — transaction is already saved, just log the receipt failure
  }
}

function resetTransactionForm() {
  currentEditId = null;
  const form = document.getElementById('transaction-form');
  if (form) form.reset();

  // Reset type to income
  const typeBtns = document.querySelectorAll('.type-btn');
  typeBtns.forEach(b => b.classList.remove('active'));
  const incomeBtn = document.querySelector('.type-btn[data-type="income"]');
  if (incomeBtn) incomeBtn.classList.add('active');
  toggleTypeFields('income');

  // Reset date to today
  const dateInput = document.getElementById('tx-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  // Reset custom category dropdown
  setCustomDropdownValue('tx-category-dropdown', '');

  // Hide edit banner
  const banner = document.getElementById('edit-mode-banner');
  if (banner) banner.classList.add('hidden');

  // Hide receipt preview
  const preview = document.getElementById('receipt-preview');
  if (preview) preview.classList.add('hidden');
  const uploadArea = document.getElementById('receipt-upload-area');
  if (uploadArea) uploadArea.classList.remove('hidden');
}

function editTransaction(id) {
  // Navigate to add transaction page and populate form
  navigateTo('add-transaction');

  apiGet(`/transactions/${id}`).then(data => {
    if (!data || !data.success) return;

    const tx = data.data;
    currentEditId = id;

    // Set type
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(b => b.classList.remove('active'));
    const targetBtn = document.querySelector(`.type-btn[data-type="${tx.type}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    toggleTypeFields(tx.type);

    // Set fields
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date ? tx.date.split('T')[0] : '';

    if (tx.type === 'income') {
      document.getElementById('tx-source').value = tx.source || '';
    } else {
      setCustomDropdownValue('tx-category-dropdown', tx.category || '');
      document.getElementById('tx-description').value = tx.description || '';
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
// RECEIPT UPLOAD (inline on form)
// =============================================
function initReceiptUpload() {
  const area = document.getElementById('receipt-upload-area');
  const fileInput = document.getElementById('receipt-file');
  const preview = document.getElementById('receipt-preview');
  const previewImg = document.getElementById('receipt-preview-img');
  const removeBtn = document.getElementById('btn-remove-receipt');

  if (!area || !fileInput) return;

  area.addEventListener('click', () => fileInput.click());

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.style.borderColor = 'var(--gold)';
    area.style.background = 'var(--gold-muted)';
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
    removeBtn.addEventListener('click', () => {
      fileInput.value = '';
      preview.classList.add('hidden');
      area.classList.remove('hidden');
    });
  }

  function handleReceiptFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be under 5MB', 'error');
      fileInput.value = '';
      return;
    }

    // Show preview only — actual upload happens on form submit
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      preview.classList.remove('hidden');
      area.classList.add('hidden');
    };
    reader.readAsDataURL(file);
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
