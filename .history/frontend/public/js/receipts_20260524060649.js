// ============================================
// Receipts.js — Gallery view + modal
// ============================================

function initReceiptsPage() {
  // Close modal
  const closeBtn = document.getElementById('receipt-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('receipt-modal')?.classList.remove('active');
    });
  }

  // Close modal on overlay click
  const overlay = document.getElementById('receipt-modal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        resetZoom(); // Reset when closing
      }
    });
  }
}

// Zoom / Pan State
let currentZoom = 1;
let panX = 0, panY = 0;
let isDragging = false;
let startX, startY;

function resetZoom() {
  currentZoom = 1; panX = 0; panY = 0;
  const img = document.getElementById('receipt-modal-img');
  if (img) {
    img.style.transform = 'translate(0px, 0px) scale(1)';
  }
}

function setupZoomAndPan() {
  const img = document.getElementById('receipt-modal-img');
  if (!img) return;
  
  img.style.cursor = 'grab';
  img.style.transition = 'transform 0.1s ease-out'; // Fast response for zoom
  
  // Clean up old listeners (prevent duplicates)
  img.onwheel = null; img.onmousedown = null; img.onmousemove = null; img.onmouseup = null; img.onmouseleave = null;

  img.onwheel = (e) => {
    e.preventDefault();
    currentZoom += e.deltaY * -0.002;
    currentZoom = Math.min(Math.max(1, currentZoom), 5); // Clamped between 1x and 5x
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
  };
  
  img.onmousedown = (e) => {
    e.preventDefault();
    isDragging = true;
    img.style.cursor = 'grabbing';
    img.style.transition = 'none'; // Instant pan tracking
    startX = e.pageX - panX;
    startY = e.pageY - panY;
  };
  
  img.onmousemove = (e) => {
    if (!isDragging) return;
    panX = e.pageX - startX;
    panY = e.pageY - startY;
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
  };
  
  const endDrag = () => { 
    if(isDragging) {
      isDragging = false; 
      img.style.cursor = 'grab';
      img.style.transition = 'transform 0.1s ease-out';
    }
  };
  
  img.onmouseup = endDrag;
  img.onmouseleave = endDrag;
}

async function loadReceipts() {
  const grid = document.getElementById('receipts-grid');
  if (!grid) return;

  try {
    // Show skeletons
    grid.innerHTML = Array(6).fill(0).map(() => `
      <div class="receipt-card skeleton" style="height: 200px; border: none;"></div>
    `).join('');

    const data = await apiGet('/receipts');
    if (!data || !data.success) return;

    const receipts = data.data;

    if (receipts.length === 0) {
      grid.innerHTML = '<div class="empty-state">No receipts uploaded yet</div>';
      return;
    }

    grid.innerHTML = receipts.map(r => {
      const hasImage = r.file_path && r.file_path.startsWith('data:');
      const imgHtml = hasImage
        ? `<img src="${r.file_path}" alt="Receipt">`
        : `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><path d='m21 15-5-5L5 21'/></svg>`;
      return `
        <div class="receipt-card hover-lift" onclick="viewReceipt(${r.id})">
          <div class="receipt-card-img">${imgHtml}</div>
          <div class="receipt-card-body">
            <h5>${r.category || 'Expense'}</h5>
            <p>${formatDate(r.date)}${r.description ? ' • ' + r.description : ''}</p>
            <div class="receipt-amount">${formatPeso(r.amount)}</div>
          </div>
        </div>
      `;
    }).join('');
    grid.classList.add('content-fade-in');
  } catch (error) {
    grid.innerHTML = '<div class="empty-state">Error loading receipts</div>';
  }
}

async function viewReceipt(id) {
  const modal = document.getElementById('receipt-modal');
  const img = document.getElementById('receipt-modal-img');
  const info = document.getElementById('receipt-modal-info');
  if (!modal) return;

  // Show modal immediately with loading state
  resetZoom();
  img.style.display = 'none';
  img.onload = null;
  img.onerror = null;
  img.removeAttribute('src');
  
  const skeleton = document.getElementById('receipt-modal-img-skeleton');
  if (skeleton) {
    skeleton.style.display = 'block';
    skeleton.classList.remove('hidden');
  }
  modal.classList.add('active');

  try {
    const data = await apiGet(`/receipts/${id}`);
    if (!data || !data.success) {
      showToast('Could not load receipt', 'error');
      modal.classList.remove('active');
      return;
    }

    const r = data.data;

    // file_path is now a base64 data URI stored in the database
    const hasImage = r.file_path && r.file_path.startsWith('data:');
    console.log('Receipt data — id:', r.id, 'hasImage:', hasImage, 'file_path prefix:', r.file_path ? r.file_path.substring(0, 30) : 'null');

    img.onload = () => {
      if (skeleton) skeleton.style.display = 'none';
      img.style.display = 'block';
      img.classList.add('content-fade-in');
      setupZoomAndPan();
    };

    img.onerror = () => {
      // Ignore pseudo-errors fired by the browser when clearing src
      if (!img.getAttribute('src') || !img.getAttribute('src').startsWith('data:')) return;

      console.error('Image render failed. file_path prefix:', r.file_path ? r.file_path.substring(0, 60) : 'null');
      if (skeleton) skeleton.style.display = 'none';
      img.style.display = 'none';
      const imgArea = document.querySelector('.receipt-modal-image-area');
      if (imgArea && !imgArea.querySelector('.receipt-img-error')) {
        imgArea.insertAdjacentHTML('beforeend', `
          <div class="receipt-img-error" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;gap:12px;color:var(--text-muted);">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            <span style="font-size:0.85rem;">Image unavailable</span>
          </div>
        `);
      }
    };

    if (hasImage) {
      img.src = r.file_path; // base64 data URI — no network request needed
    } else {
      console.warn('No base64 image data. Old/missing receipt. file_path:', r.file_path);
      if (skeleton) skeleton.style.display = 'none';
      img.style.display = 'none';
    }

    if (info) {
      info.innerHTML = `
        <div style="flex:1;">
          <h3 style="margin:0 0 5px 0;">${r.category || 'Expense'}</h3>
          <p style="margin:0; color:var(--text-muted); font-size:0.9rem;">
            ${formatDate(r.date)}${r.description ? ' • ' + r.description : ''}
          </p>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600; font-size:1.2rem; color:var(--accent-red);">
            ${formatPeso(r.amount)}
          </div>
          <p style="margin:0; color:var(--text-muted); font-size:0.8rem;">
            Added by ${r.user_name || 'User'}
          </p>
        </div>
      `;
    }

  } catch (error) {
    showToast('Error loading receipt', 'error');
    modal.classList.remove('active');
  }
  }