// ============================================
// Receipts.js — Gallery view + modal
// ============================================

function initReceiptsPage() {
  // Close modal
  const closeBtn = document.getElementById('receipt-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('receipt-modal')?.classList.add('hidden');
    });
  }

  // Close modal on overlay click
  const overlay = document.getElementById('receipt-modal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }
}

async function loadReceipts() {
  const grid = document.getElementById('receipts-grid');
  if (!grid) return;

  try {
    const data = await apiGet('/receipts');
    if (!data || !data.success) return;

    const receipts = data.data;

    if (receipts.length === 0) {
      grid.innerHTML = '<div class="empty-state">No receipts uploaded yet</div>';
      return;
    }

    grid.innerHTML = receipts.map(r => `
      <div class="receipt-card hover-lift" onclick="viewReceipt(${r.id})">
        <div class="receipt-card-img">
          <img src="/api/receipts/image/${r.file_path}" alt="Receipt" onerror="this.parentElement.innerHTML='<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><path d=\\'m21 15-5-5L5 21\\'/></svg>'">
        </div>
        <div class="receipt-card-body">
          <h5>${r.category || 'Expense'}</h5>
          <p>${formatDate(r.date)}${r.description ? ' • ' + r.description : ''}</p>
          <div class="receipt-amount">${formatPeso(r.amount)}</div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    grid.innerHTML = '<div class="empty-state">Error loading receipts</div>';
  }
}

async function viewReceipt(id) {
  const modal = document.getElementById('receipt-modal');
  const img = document.getElementById('receipt-modal-img');
  const info = document.getElementById('receipt-modal-info');
  if (!modal) return;

  try {
    const data = await apiGet(`/receipts/${id}`);
    if (!data || !data.success) return;

    const r = data.data;

    img.src = `/api/receipts/image/${r.file_path}`;
    img.onerror = () => { img.style.display = 'none'; };

    info.innerHTML = `
      <h3 style="margin-bottom:var(--space-md)">${r.category || 'Receipt'}</h3>
      <p><strong>Amount:</strong> ${formatPeso(r.amount)}</p>
      <p><strong>Date:</strong> ${formatDate(r.date)}</p>
      ${r.description ? `<p><strong>Description:</strong> ${r.description}</p>` : ''}
      ${r.extracted_text ? `
        <div style="margin-top:var(--space-md);padding:var(--space-md);background:var(--bg-elevated);border-radius:var(--radius-md);font-size:0.8rem;color:var(--text-secondary);white-space:pre-wrap;max-height:200px;overflow-y:auto">
          <strong style="color:var(--text-primary)">OCR Extracted Text:</strong><br>${r.extracted_text}
        </div>
      ` : ''}
    `;

    modal.classList.remove('hidden');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (error) {
    showToast('Error loading receipt', 'error');
  }
}
