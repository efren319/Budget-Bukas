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
    if (currentEditId) {
      await apiPut(`/transactions/${currentEditId}`, payload);
      showToast('Transaction updated successfully');
    } else {
      const result = await apiPost('/transactions', payload);

      // If there's a receipt file uploaded, save it
      const receiptFile = document.getElementById('receipt-file');
      if (type === 'expense' && receiptFile.files.length > 0 && result.data) {
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
    formData.append('receipt', file);
    // Append autoScan flag indicating pure storage
    const scanResult = await apiUpload('/receipts/upload?scan=false', formData);

    if (scanResult && scanResult.success) {
      // We need the expense_id. Fetch the transaction to get it.
      const txData = await apiGet(`/transactions/${transactionId}`);
      if (txData && txData.data) {
        await apiPost('/receipts/save', {
          expense_id: txData.data.id,
          file_path: scanResult.data.filePath,
          original_name: scanResult.data.originalName,
          extracted_text: scanResult.data.ocr ? scanResult.data.ocr.rawText : ''
        });
      }
    }
  } catch (err) {
    console.error('Receipt upload error:', err);
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
      document.getElementById('tx-category').value = tx.category || '';
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
  const ocrStatus = document.getElementById('ocr-status');

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

  async function handleReceiptFile(file) {
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      preview.classList.remove('hidden');
      area.classList.add('hidden');
    };
    reader.readAsDataURL(file);

    const toggleOcr = document.getElementById('toggle-ocr');
    const autoScan = toggleOcr ? toggleOcr.checked : true;

    if (!autoScan) {
      if (ocrStatus) {
        ocrStatus.style.display = 'flex';
        ocrStatus.innerHTML = '<i data-lucide="check-circle"></i> Receipt queued for upload (OCR skipped).';
        ocrStatus.style.color = 'var(--text-secondary)';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
      return; // Skip OCR
    }

    // OCR scan
    if (ocrStatus) {
      ocrStatus.style.display = 'flex';
      ocrStatus.innerHTML = '<i data-lucide="loader" class="spin"></i> Scanning receipt...';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
      const formData = new FormData();
      formData.append('receipt', file);
      const result = await apiUpload('/receipts/upload', formData);

      if (result && result.success && result.data.ocr) {
        const ocr = result.data.ocr;

        // Auto-fill form
        if (ocr.total && !document.getElementById('tx-amount').value) {
          document.getElementById('tx-amount').value = ocr.total;
        }
        if (ocr.date && !document.getElementById('tx-date').value) {
          document.getElementById('tx-date').value = ocr.date;
        }

        // Auto-compute engine
        if (ocr.items && ocr.items.length > 0) {
          renderAutoComputeTable(ocr.items);
        }

        ocrStatus.innerHTML = `<i data-lucide="check-circle"></i> Scanned! ${ocr.total ? 'Amount: ₱' + ocr.total.toLocaleString() : 'Review values below.'}`;
        ocrStatus.style.color = 'var(--success)';
      } else {
        ocrStatus.innerHTML = '<i data-lucide="alert-circle"></i> Could not extract data. Please fill manually.';
        ocrStatus.style.color = 'var(--warning)';
      }
    } catch (err) {
      ocrStatus.innerHTML = '<i data-lucide="alert-circle"></i> OCR failed. Fill form manually.';
      ocrStatus.style.color = 'var(--danger)';
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// =============================================
// AUTO COMPUTE ENGINE
// =============================================
function renderAutoComputeTable(items) {
  // Find insertion point before receipt upload area
  const receiptRow = document.querySelector('.expense-fields .receipt-upload-area').closest('.form-row');
  
  // Clean up existing if any
  const existing = document.getElementById('auto-compute-wrapper');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'auto-compute-wrapper';
  wrapper.className = 'form-row expense-fields';
  wrapper.style.animation = 'scaleIn var(--duration-normal) var(--ease-smooth)';

  let tableHtml = `
    <div class="form-group" style="width: 100%;">
      <label>Extracted Items (Auto-Compute)</label>
      <div style="background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: var(--space-md);">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;" id="auto-compute-table">
          <thead>
            <tr style="text-align: left; border-bottom: 1px solid var(--border-color);">
              <th style="padding-bottom: 8px;">Item Name</th>
              <th style="padding-bottom: 8px;">Price (₱)</th>
              <th style="padding-bottom: 8px; width: 60px;">Qty</th>
              <th style="padding-bottom: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
  `;

  items.forEach((item, index) => {
    tableHtml += `
      <tr>
        <td style="padding: 8px 0;">${item.name}</td>
        <td style="padding: 8px 0;"><input type="number" class="ac-price" data-idx="${index}" value="${item.price}" step="0.01" style="width: 80px; padding: 4px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary);"></td>
        <td style="padding: 8px 0;"><input type="number" class="ac-qty" data-idx="${index}" value="${item.qty}" min="1" style="width: 50px; padding: 4px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary);"></td>
        <td style="padding: 8px 0; text-align: right;" class="ac-item-total" data-idx="${index}">${(item.price * item.qty).toFixed(2)}</td>
      </tr>
    `;
  });

  tableHtml += `
          </tbody>
          <tfoot>
            <tr style="border-top: 1px solid var(--border-color); font-weight: 700;">
              <td colspan="3" style="padding-top: 12px; text-align: right;">Grand Total:</td>
              <td style="padding-top: 12px; text-align: right; color: var(--gold);" id="ac-grand-total">0.00</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
  wrapper.innerHTML = tableHtml;

  // Insert before receipt row
  receiptRow.parentNode.insertBefore(wrapper, receiptRow);

  // Bind calculation events
  const recalculate = () => {
    let grandTotal = 0;
    const rows = document.querySelectorAll('#auto-compute-table tbody tr');
    rows.forEach(tr => {
      const price = parseFloat(tr.querySelector('.ac-price').value) || 0;
      const qty = parseInt(tr.querySelector('.ac-qty').value) || 0;
      const total = price * qty;
      tr.querySelector('.ac-item-total').textContent = total.toFixed(2);
      grandTotal += total;
    });
    document.getElementById('ac-grand-total').textContent = grandTotal.toFixed(2);
    // Lock standard amount field to this computed amount
    document.getElementById('tx-amount').value = grandTotal.toFixed(2);
  };

  document.querySelectorAll('.ac-price, .ac-qty').forEach(input => {
    input.addEventListener('input', recalculate);
  });

  recalculate();
}


// =============================================
// RECORDS TABLE
// =============================================
function initRecords() {
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

  let url = `/transactions?page=${page}&sort=${sort}&order=${order}&limit=20`;
  if (type) url += `&type=${type}`;
  if (startDate) url += `&startDate=${startDate}`;
  if (endDate) url += `&endDate=${endDate}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const data = await apiGet(url);
    if (!data || !data.success) return;

    const { data: records, pagination } = data;

    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No records found</td></tr>';
    } else {
      tbody.innerHTML = records.map(r => {
        const detail = r.type === 'income' ? (r.source || '—') : (r.category || '—');
        const desc = r.description || '—';
        const officerActions = isOfficer() ? `
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

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === pagination.page ? 'active' : ''}" onclick="loadRecords(${i},'${sort}','${order}')">${i}</button>`;
  }
  container.innerHTML = html;
}
