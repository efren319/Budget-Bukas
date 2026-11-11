// ============================================
// Chatbot.js — ChatGPT-Style Conversational UI
// Full rewrite: empty state → active chat, FAB widget,
// context-aware suggestions, domain-controlled responses
// ============================================

(function () {
  'use strict';

  // ---- State ----
  let chatStarted = false;
  let currentPage = 'dashboard';
  let aiMode = 'ai'; // 'ai' or 'offline'
  let pendingEdit = null; // { type: 'fullpage' | 'widget', row, widgetWrapper, text }
  let formatPrefs = { graph: false, table: true, list: true }; // '+' toggle menu preferences
  let geminiUsageStatus = null;
  let geminiUsageRefreshBusy = false;
  let geminiUsageRefreshQueued = false;

  function cancelEdit() {
    if (!pendingEdit) return;
    const banner = document.getElementById('ai-edit-banner');
    if (banner) banner.classList.add('hidden');

    const activeInput = document.getElementById('ai-input-field-active');
    const emptyInput = document.getElementById('ai-input-field-empty');
    const widgetInput = document.getElementById('chat-widget-input-field');

    if (activeInput) activeInput.value = '';
    if (emptyInput) emptyInput.value = '';
    if (widgetInput) widgetInput.value = '';

    pendingEdit = null;
  }

  // ---- Context-Aware Follow-Up Map ----
  const followUpMap = {
    balance:     ['Monthly report for October 2025', 'Expenses by category', 'What was our highest expense?'],
    expense:     ['Expenses by category', 'What was our highest expense?', 'Financial summary of SIKLAB'],
    income:      ['Total balance', 'Monthly report for October 2025', 'Compare Oct and Nov 2025'],
    category:    ['Expenses by category', 'What was our highest expense?', 'Monthly report for October 2025'],
    table:       ['Expenses by category', 'Monthly report for October 2025', 'Compare Oct and Nov 2025'],
    report:      ['Compare with previous month', 'Expenses by category', 'What was our highest expense?'],
    help:        ['Monthly report for October 2025', 'Total balance', 'Expenses by category'],
    suggestions: ['Monthly report for October 2025', 'Compare Oct and Nov 2025', 'Expenses by category'],
    text:        ['Monthly report for October 2025', 'Expenses by category', 'Total balance']
  };

  // ==========================================================
  //  INITIALIZATION
  // ==========================================================
  let choiceCounter = 0;

  // Helper to execute Continue with AI and handle transitions seamlessly
  // Defined at IIFE scope so both initChatbot() and setupChoiceCountdown() can access it
  function executeContinueAI(choiceRow, query) {
    if (!choiceRow) return;

    // Prevent double-firing
    if (choiceRow._continueInProgress) return;
    choiceRow._continueInProgress = true;

    if (choiceRow._countdownTimer) {
      clearInterval(choiceRow._countdownTimer);
      choiceRow._countdownTimer = null;
    }

    const card = choiceRow.querySelector('.ai-choice-card');
    if (card) {
      card.innerHTML = `
        <div class="ai-waiting-bar">
          <div class="ai-waiting-spinner">
            <i data-lucide="loader-2" class="spin"></i>
          </div>
          <div class="ai-waiting-text">
            <span>Connecting to PondoSync AI...</span>
            <strong class="ai-waiting-countdown">Generating response...</strong>
          </div>
        </div>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    sendToAPI(query, { force: true }).then(result => {
      if (result) {
        choiceRow.remove();
        addAIMessage(result.response, result.type, result.suggestions, result);
        scrollMessages();
      } else {
        const offlineData = choiceRow._offlineData || {};
        choiceRow.remove();
        addAIMessage(
          offlineData.response || 'No response available.',
          offlineData.type || 'text',
          offlineData.suggestions,
          { source: 'offline', userQuery: query }
        );
        scrollMessages();
      }
    });
  }

  function initChatbot() {
    // ---- Full-page chatbot ----
    bindInput('ai-input-field-empty', 'ai-send-empty');
    bindInput('ai-input-field-active', 'ai-send-active');

    // ---- AI Mode Toggles ----
    initAIModeToggles();

    // ---- Gemini quota and usage indicator ----
    initGeminiUsageIndicator();

    // ---- Format Toggle ('+' button) ----
    initFormatToggles();

    // ---- AI Unavailable Modal ----
    initAiUnavailableModal();

    // ---- Transaction Description Hover Modal ----
    initDescHoverModal();

    // Suggestion chips (empty state grid + followup chips)
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-suggest-chip, .ai-followup-chip');
      if (!chip) return;
      const query = chip.dataset.query;
      if (query) handleFullPageSend(query);
    });

    // ChatGPT-Style Code Block Copy Button
    document.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.chat-code-copy-btn');
      if (!copyBtn) return;
      const block = copyBtn.closest('.chat-code-block');
      if (!block) return;
      const codeEl = block.querySelector('pre code') || block.querySelector('pre');
      if (!codeEl) return;
      const codeText = codeEl.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeText).then(() => {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = '<i data-lucide="check"></i> <span>Copied!</span>';
          if (typeof lucide !== 'undefined') lucide.createIcons();
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = '<i data-lucide="copy"></i> <span>Copy code</span>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }, 2000);
        }).catch(() => {
          copyBtn.innerText = 'Copied!';
          setTimeout(() => { copyBtn.innerText = 'Copy code'; }, 2000);
        });
      }
    });

    // ---- Cancel Edit Button Listener ----
    const editCancelBtn = document.getElementById('ai-edit-cancel-btn');
    if (editCancelBtn) {
      editCancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cancelEdit();
      });
    }

    // 1. Edit message click listener (non-destructive: populates input, shows cancel banner, leaves messages intact)
    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-msg-btn');
      if (!editBtn) return;

      const row = editBtn.closest('.ai-msg-row');
      const widgetWrapper = editBtn.closest('.widget-msg-wrapper');

      if (row) {
        const text = editBtn.dataset.text || row.dataset.userText || '';
        pendingEdit = { type: 'fullpage', row, text };

        const banner = document.getElementById('ai-edit-banner');
        if (banner) banner.classList.remove('hidden');

        const activeInput = document.getElementById('ai-input-field-active');
        const emptyInput = document.getElementById('ai-input-field-empty');
        const targetInput = (!chatStarted ? emptyInput : activeInput) || activeInput || emptyInput;
        if (targetInput) {
          targetInput.value = text;
          targetInput.focus();
          try {
            targetInput.setSelectionRange(text.length, text.length);
          } catch (_) {}
          targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
      } else if (widgetWrapper) {
        const text = editBtn.dataset.text || widgetWrapper.dataset.userText || '';
        pendingEdit = { type: 'widget', widgetWrapper, text };
        const widgetInput = document.getElementById('chat-widget-input-field');
        if (widgetInput) {
          widgetInput.value = text;
          widgetInput.focus();
          try {
            widgetInput.setSelectionRange(text.length, text.length);
          } catch (_) {}
        }
      }
    });

    // 2. Delete message click listener (only user can delete their own chat)
    document.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.delete-msg-btn');
      if (!delBtn) return;

      const row = delBtn.closest('.ai-msg-row');
      const widgetWrapper = delBtn.closest('.widget-msg-wrapper');

      // Only allow user to delete their own messages
      if (row && row.classList.contains('user')) {
        if (pendingEdit && pendingEdit.row === row) {
          cancelEdit();
        }
        removeChatFromRow(row, false);
      } else if (widgetWrapper && widgetWrapper.classList.contains('user')) {
        if (pendingEdit && pendingEdit.widgetWrapper === widgetWrapper) {
          cancelEdit();
        }
        removeWidgetFromMsg(widgetWrapper, false);
      }
    });


    // 3. User clicked "Continue with AI"
    document.addEventListener('click', (e) => {
      const continueBtn = e.target.closest('.ai-choice-btn.continue-ai-btn');
      if (!continueBtn) return;

      const choiceRow = continueBtn.closest('.ai-msg-row') || continueBtn.closest('.widget-msg-wrapper') || continueBtn.closest('.widget-msg');
      if (!choiceRow) return;

      const query = continueBtn.dataset.query || choiceRow._userQuery || '';
      executeContinueAI(choiceRow, query);
    });

    // 4. User clicked "Wait for Online AI" (auto-continues with AI when 10s timer expires)
    document.addEventListener('click', (e) => {
      const waitBtn = e.target.closest('.ai-choice-btn.wait-ai-btn');
      if (!waitBtn) return;

      const choiceRow = waitBtn.closest('.ai-msg-row') || waitBtn.closest('.widget-msg-wrapper') || waitBtn.closest('.widget-msg');
      if (!choiceRow) return;

      const card = choiceRow.querySelector('.ai-choice-card');
      if (!card) return;

      // Mark this choice card as actively waiting so it auto-submits upon completion!
      choiceRow._isWaiting = true;

      card.innerHTML = `
        <div class="ai-waiting-bar">
          <div class="ai-waiting-spinner">
            <i data-lucide="loader-2" class="spin"></i>
          </div>
          <div class="ai-waiting-text">
            <span>Holding queue for PondoSync AI...</span>
            <strong class="ai-waiting-countdown">Checking slot...</strong>
          </div>
        </div>
        <div class="ai-choice-actions" style="margin-top: 10px; border-top: 1px solid rgba(212, 175, 55, 0.1); padding-top: 8px;">
          <button class="ai-choice-btn offline-now-btn small">
            <i data-lucide="database"></i> <span>Use Instant Ledger Answer</span>
          </button>
        </div>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      scrollMessages();
    });

    // 5. User clicked "Use Instant Offline Response"
    document.addEventListener('click', (e) => {
      const offlineBtn = e.target.closest('.ai-choice-btn.offline-now-btn');
      if (!offlineBtn) return;

      const choiceRow = offlineBtn.closest('.ai-msg-row') || offlineBtn.closest('.widget-msg-wrapper') || offlineBtn.closest('.widget-msg');
      if (!choiceRow) return;

      if (choiceRow._countdownTimer) {
        clearInterval(choiceRow._countdownTimer);
        choiceRow._countdownTimer = null;
      }

      const offlineData = choiceRow._offlineData || {};
      const query = choiceRow._userQuery || '';

      choiceRow.remove();

      addAIMessage(
        offlineData.response || 'No offline response available.',
        offlineData.type || 'text',
        offlineData.suggestions,
        { source: 'offline', userQuery: query }
      );
      scrollMessages();
    });

    // ---- Floating Widget ----
    initWidget();

    // ---- Track current page for FAB visibility ----
    observePageChanges();
  }

  function initGeminiUsageIndicator() {
    const trigger = document.getElementById('gemini-usage-trigger');
    const panel = document.getElementById('gemini-usage-panel');
    const container = document.getElementById('gemini-usage-indicator');

    if (trigger && panel) {
      // Clicking the floating Gemini button toggles the usage panel
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.toggle('open');
        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // Prevent clicks inside panel from closing it
      panel.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // Clicking outside the panel closes it
      document.addEventListener('click', (e) => {
        if (panel.classList.contains('open')) {
          const target = e.target;
          if (container && !container.contains(target)) {
            panel.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
          }
        }
      });

      // Escape key closes it
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) {
          panel.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Open by default so the user immediately sees the panel
      panel.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    renderGeminiUsageStatus(null);
    refreshGeminiUsageStatus();

    setInterval(() => {
      const chatbotPage = document.getElementById('page-chatbot');
      if (document.visibilityState === 'visible' && chatbotPage?.classList.contains('active')) {
        refreshGeminiUsageStatus();
      }
    }, 30000);
  }

  async function refreshGeminiUsageStatus() {
    if (geminiUsageRefreshBusy) {
      geminiUsageRefreshQueued = true;
      return;
    }

    geminiUsageRefreshBusy = true;
    try {
      const result = await apiGet('/chatbot/usage');
      if (result?.success && result.data) renderGeminiUsageStatus(result.data);
    } catch (error) {
      renderGeminiUsageStatus(null, 'Usage and quota status could not be loaded.');
    } finally {
      geminiUsageRefreshBusy = false;
      if (geminiUsageRefreshQueued) {
        geminiUsageRefreshQueued = false;
        setTimeout(refreshGeminiUsageStatus, 250);
      }
    }
  }

  function formatUsageCount(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : 'Unavailable';
  }

  function formatResetTime(value) {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unavailable';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesFormatted = minutes < 10 ? '0' + minutes : minutes;
    return `${month} ${day}, ${year} • ${hours}:${minutesFormatted} ${ampm}`;
  }

  function applyQuotaRestrictionToInputs(isBlocked, resetText = '') {
    const sendEmpty = document.getElementById('ai-send-empty');
    const sendActive = document.getElementById('ai-send-active');
    const sendWidget = document.getElementById('chat-widget-send');
    const inputEmpty = document.getElementById('ai-input-field-empty');
    const inputActive = document.getElementById('ai-input-field-active');
    const inputWidget = document.getElementById('chat-widget-input-field');

    const shouldDisable = isBlocked && aiMode === 'ai';

    [sendEmpty, sendActive, sendWidget].forEach(btn => {
      if (!btn) return;
      if (shouldDisable) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.title = `Gemini AI quota is nearly exhausted (<= 5% remaining). Requests are paused.${resetText ? ` Expected reset: ${resetText}` : ''}`;
      } else {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.style.opacity = '';
        btn.style.cursor = '';
        btn.title = 'Send';
      }
    });

    [inputEmpty, inputActive, inputWidget].forEach(inp => {
      if (!inp) return;
      if (shouldDisable) {
        if (!inp.hasAttribute('data-normal-placeholder')) {
          inp.setAttribute('data-normal-placeholder', inp.placeholder || '');
        }
        inp.placeholder = `AI quota nearly exhausted (<= 5%). Switch to Offline mode or wait for reset...`;
      } else if (inp.hasAttribute('data-normal-placeholder')) {
        inp.placeholder = inp.getAttribute('data-normal-placeholder');
      }
    });
  }

  function renderGeminiUsageStatus(status, loadError = null) {
    if (!status && geminiUsageStatus) status = geminiUsageStatus;
    else geminiUsageStatus = status;

    const quota = status?.quota || {};
    const selected = quota.selectedMetric || null;
    const hasVerifiedQuota = quota.availability === 'available' && Number.isFinite(quota.percentRemaining);

    const percentRemaining = hasVerifiedQuota
      ? Math.min(100, Math.max(0, quota.percentRemaining))
      : null;
    const percentUsed = hasVerifiedQuota
      ? (Number.isFinite(quota.percentUsed) ? Math.min(100, Math.max(0, quota.percentUsed)) : Math.max(0, 100 - percentRemaining))
      : null;

    const isBlocked = Boolean(status?.blocked);

    // 1. Header status (dot + text)
    const statusDot = document.getElementById('gemini-status-dot');
    const statusText = document.getElementById('gemini-status-text');
    if (statusDot && statusText) {
      statusDot.className = 'gemini-status-dot';
      statusText.className = 'gemini-status-text';
      if (isBlocked) {
        statusDot.classList.add('blocked');
        statusText.classList.add('blocked');
        statusText.textContent = 'Paused';
      } else if (status?.availability === 'rate_limited') {
        statusDot.classList.add('rate-limited');
        statusText.classList.add('rate-limited');
        statusText.textContent = 'Limited';
      } else {
        statusText.textContent = 'Live';
      }
    }

    // 2. Usage Visualization: Donut on left, Progress bar on right
    const donutFill = document.getElementById('gemini-donut-progress');
    const percentLabel = document.getElementById('gemini-usage-percent');
    const remainingLabel = document.getElementById('gemini-usage-remaining');
    const barFill = document.getElementById('gemini-usage-bar');

    const CIRCUMFERENCE = 245.044; // 2 * Math.PI * 39

    if (donutFill) {
      donutFill.classList.toggle('blocked', isBlocked);
      if (percentUsed !== null) {
        const offset = Math.max(0, CIRCUMFERENCE - (CIRCUMFERENCE * (percentUsed / 100)));
        donutFill.style.strokeDashoffset = offset;
      } else {
        donutFill.style.strokeDashoffset = CIRCUMFERENCE; // empty
      }
    }

    if (percentLabel) {
      percentLabel.textContent = percentUsed !== null ? `${Math.round(percentUsed)}%` : '—';
    }

    if (remainingLabel) {
      remainingLabel.textContent = percentRemaining !== null
        ? `${Math.round(percentRemaining)}% Remaining`
        : 'Unavailable';
    }

    if (barFill) {
      barFill.classList.toggle('blocked', isBlocked);
      barFill.style.width = percentUsed !== null ? `${percentUsed}%` : '0%';
    }

    // 3. Information rows
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('gemini-usage-model', status?.currentModel || 'Unavailable');

    if (selected && percentUsed !== null) {
      const countFormatted = formatUsageCount(selected.limit);
      const dimension = selected.dimension ? selected.dimension.toLowerCase() : 'requests';
      setText('gemini-usage-count', `${Math.round(percentUsed)}% of ${countFormatted} ${dimension}`);
    } else {
      setText('gemini-usage-count', 'Unavailable');
    }

    const resetTimeFormatted = selected?.resetAt ? formatResetTime(selected.resetAt) : 'Unavailable';
    setText('gemini-usage-reset', resetTimeFormatted);

    // 4. Availability Section
    const availText = document.getElementById('gemini-usage-status');
    const availIcon = document.getElementById('gemini-avail-icon');
    if (availText) {
      availText.className = 'gemini-avail-text';
      if (isBlocked) {
        availText.classList.add('blocked');
        availText.textContent = 'AI quota exhausted';
        if (availIcon) {
          availIcon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#EF4444"/>
              <path d="M12 7V13" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
              <circle cx="12" cy="16.5" r="1" fill="#FFFFFF"/>
            </svg>
          `;
        }
      } else if (status?.availability === 'rate_limited') {
        availText.classList.add('rate-limited');
        availText.textContent = 'AI rate limited';
        if (availIcon) {
          availIcon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#EAB308"/>
              <path d="M12 7V13" stroke="#121212" stroke-width="2" stroke-linecap="round"/>
              <circle cx="12" cy="16.5" r="1" fill="#121212"/>
            </svg>
          `;
        }
      } else if (!status || status?.availability === 'unavailable') {
        availText.textContent = 'AI unavailable';
        if (availIcon) {
          availIcon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#6B7280"/>
              <path d="M12 7V13" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
              <circle cx="12" cy="16.5" r="1" fill="#FFFFFF"/>
            </svg>
          `;
        }
      } else {
        availText.textContent = 'AI is available';
        if (availIcon) {
          availIcon.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#22C55E"/>
              <path d="M8 12.5L10.5 15L16 9.5" stroke="#121212" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
      }
    }

    // 5. Warning banner & 5% restriction handling
    const warning = document.getElementById('gemini-usage-warning');
    if (warning) {
      const shouldWarn = isBlocked || status?.availability === 'rate_limited';
      warning.classList.toggle('hidden', !shouldWarn);
      if (isBlocked) {
        const resetNotice = selected?.resetAt ? ` Expected reset: ${resetTimeFormatted}.` : '';
        warning.textContent = `The verified Gemini quota is at or below 5% remaining. Gemini AI requests are paused.${resetNotice}`;
      } else if (shouldWarn) {
        warning.textContent = 'Gemini recently returned a rate-limit response. Official quota data may be delayed; the verified ledger remains available.';
      }
    }

    // 6. Disable or enable AI submission functionality when quota <= 5%
    applyQuotaRestrictionToInputs(isBlocked, resetTimeFormatted !== 'Unavailable' ? resetTimeFormatted : '');
  }

  function isGeminiQuotaBlocked() {
    return Boolean(geminiUsageStatus?.blocked);
  }

  // ---- AI Mode Toggle Logic ----
  function initAIModeToggles() {
    const toggleEmpty = document.getElementById('ai-mode-toggle-empty');
    const toggleActive = document.getElementById('ai-mode-toggle-active');
    const toggleWidget = document.getElementById('ai-mode-toggle-widget');

    function syncToggles() {
      [toggleEmpty, toggleActive, toggleWidget].forEach(t => {
        if (!t) return;
        t.classList.remove('active', 'offline');
        t.classList.add(aiMode === 'ai' ? 'active' : 'offline');
        const label = t.querySelector('.ai-mode-label');
        if (label) label.textContent = 'AI';
        t.title = aiMode === 'ai' ? 'AI Mode: Active (Click to switch to Ledger Engine)' : 'AI Mode: Inactive (Click to activate AI)';
      });
      if (typeof lucide !== 'undefined') lucide.createIcons();
      applyQuotaRestrictionToInputs(isGeminiQuotaBlocked(), document.getElementById('gemini-usage-reset')?.textContent || '');
    }

    function handleToggle() {
      aiMode = aiMode === 'ai' ? 'offline' : 'ai';
      syncToggles();
    }

    if (toggleEmpty) toggleEmpty.addEventListener('click', handleToggle);
    if (toggleActive) toggleActive.addEventListener('click', handleToggle);
    if (toggleWidget) toggleWidget.addEventListener('click', handleToggle);

    syncToggles();
  }

  // ---- Format Toggle ('+' button) & Active Tags Logic ----
  const formatMeta = {
    graph: { label: 'Graph', icon: 'bar-chart-3' },
    table: { label: 'Table', icon: 'table' },
    list:  { label: 'List',  icon: 'list' }
  };

  function renderActiveFormatTags() {
    const containers = [
      document.getElementById('ai-format-tags-empty'),
      document.getElementById('ai-format-tags-active'),
      document.getElementById('ai-format-tags-widget')
    ];

    const activeFormats = Object.keys(formatPrefs).filter(k => formatPrefs[k]);

    containers.forEach(container => {
      if (!container) return;
      if (activeFormats.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      container.style.display = 'flex';
      container.innerHTML = activeFormats.map(fmt => {
        const meta = formatMeta[fmt] || { label: fmt, icon: 'check' };
        return `
          <div class="ai-format-tag" data-format="${escapeAttr(fmt)}">
            <i data-lucide="${escapeAttr(meta.icon)}" class="ai-format-tag-icon"></i>
            <span class="ai-format-tag-label">${escapeHTML(meta.label)}</span>
            <button type="button" class="ai-format-tag-remove" data-format="${escapeAttr(fmt)}" title="Remove ${escapeAttr(meta.label)} from response" aria-label="Remove ${escapeAttr(meta.label)}">
              <i data-lucide="x"></i>
            </button>
          </div>
        `;
      }).join('');
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function initFormatToggles() {
    const toggleBtnEmpty = document.getElementById('ai-format-toggle-empty');
    const toggleBtnActive = document.getElementById('ai-format-toggle-active');
    const toggleBtnWidget = document.getElementById('ai-format-toggle-widget');
    const menuEmpty = document.getElementById('ai-format-menu-empty');
    const menuActive = document.getElementById('ai-format-menu-active');
    const menuWidget = document.getElementById('ai-format-menu-widget');
    const tagsEmpty = document.getElementById('ai-format-tags-empty');
    const tagsActive = document.getElementById('ai-format-tags-active');
    const tagsWidget = document.getElementById('ai-format-tags-widget');

    const toggleBtns = [toggleBtnEmpty, toggleBtnActive, toggleBtnWidget].filter(Boolean);
    const menus = [menuEmpty, menuActive, menuWidget].filter(Boolean);
    const tagContainers = [tagsEmpty, tagsActive, tagsWidget].filter(Boolean);

    function toggleMenu(btn, menu) {
      if (!btn || !menu) return;
      const isOpen = !menu.classList.contains('hidden');
      // Close all menus first
      menus.forEach(m => { if (m) m.classList.add('hidden'); });
      toggleBtns.forEach(b => { if (b) b.classList.remove('active'); });
      if (!isOpen) {
        menu.classList.remove('hidden');
        btn.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }

    if (toggleBtnEmpty) {
      toggleBtnEmpty.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(toggleBtnEmpty, menuEmpty);
      });
    }
    if (toggleBtnActive) {
      toggleBtnActive.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(toggleBtnActive, menuActive);
      });
    }
    if (toggleBtnWidget) {
      toggleBtnWidget.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(toggleBtnWidget, menuWidget);
      });
    }

    // Sync checkbox state across all menus and update formatPrefs
    function syncFormatPrefs(sourceMenu) {
      if (!sourceMenu) return;
      const checks = sourceMenu.querySelectorAll('.ai-format-check');
      checks.forEach(chk => {
        const fmt = chk.dataset.format;
        if (fmt) formatPrefs[fmt] = chk.checked;
      });

      // Sync other menus' checkboxes to match
      menus.forEach(otherMenu => {
        if (otherMenu !== sourceMenu) {
          otherMenu.querySelectorAll('.ai-format-check').forEach(chk => {
            const fmt = chk.dataset.format;
            if (fmt && formatPrefs[fmt] !== undefined) {
              chk.checked = formatPrefs[fmt];
            }
          });
        }
      });

      renderActiveFormatTags();
    }

    // Handle tag '×' removal click
    function handleTagRemoval(e) {
      const removeBtn = e.target.closest('.ai-format-tag-remove');
      if (!removeBtn) return;
      e.stopPropagation();
      const fmt = removeBtn.dataset.format;
      if (!fmt) return;

      formatPrefs[fmt] = false;

      // Uncheck checkboxes across all menus
      document.querySelectorAll(`.ai-format-check[data-format="${fmt}"]`).forEach(chk => {
        chk.checked = false;
      });

      renderActiveFormatTags();
    }

    tagContainers.forEach(tagEl => {
      tagEl.addEventListener('click', handleTagRemoval);
    });

    // Listen for checkbox changes
    menus.forEach(menu => {
      menu.addEventListener('change', (e) => {
        if (e.target.classList.contains('ai-format-check')) {
          syncFormatPrefs(menu);
        }
      });
      // Prevent menu clicks from closing it
      menu.addEventListener('click', (e) => e.stopPropagation());
    });

    // Close menu on outside click
    document.addEventListener('click', () => {
      menus.forEach(m => { if (m) m.classList.add('hidden'); });
      toggleBtns.forEach(b => { if (b) b.classList.remove('active'); });
    });

    // Initial render of active format tags
    renderActiveFormatTags();
  }

  function bindInput(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn   = document.getElementById(btnId);
    if (!input || !btn) return;

    btn.addEventListener('click', () => {
      const msg = input.value.trim();
      if (msg) { input.value = ''; handleFullPageSend(msg); }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cancelEdit();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg) { input.value = ''; handleFullPageSend(msg); }
      }
    });
  }

  // ==========================================================
  //  AI UNAVAILABLE MODAL
  // ==========================================================
  let pendingAiFallback = null;

  function showAiUnavailableModal(query, offlineResult, isWidget = false) {
    pendingAiFallback = { query, offlineResult, isWidget };
    const modal = document.getElementById('ai-unavailable-modal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function hideAiUnavailableModal() {
    const modal = document.getElementById('ai-unavailable-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  function initAiUnavailableModal() {
    const modal = document.getElementById('ai-unavailable-modal');
    const closeBtn = document.getElementById('ai-unavailable-close');
    const useOfflineBtn = document.getElementById('ai-modal-use-offline');
    const tryAgainBtn = document.getElementById('ai-modal-try-again');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        hideAiUnavailableModal();
        if (pendingAiFallback) {
          renderOfflineFallback(pendingAiFallback);
          pendingAiFallback = null;
        }
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          hideAiUnavailableModal();
          if (pendingAiFallback) {
            renderOfflineFallback(pendingAiFallback);
            pendingAiFallback = null;
          }
        }
      });
    }

    if (useOfflineBtn) {
      useOfflineBtn.addEventListener('click', () => {
        hideAiUnavailableModal();
        if (pendingAiFallback) {
          renderOfflineFallback(pendingAiFallback);
          pendingAiFallback = null;
        }
      });
    }

    if (tryAgainBtn) {
      tryAgainBtn.addEventListener('click', () => {
        hideAiUnavailableModal();
        if (pendingAiFallback) {
          const { query, isWidget } = pendingAiFallback;
          pendingAiFallback = null;
          if (isWidget) {
            handleWidgetSend(query, { force: true });
          } else {
            handleFullPageSend(query, { force: true });
          }
        }
      });
    }
  }

  // ---- Transaction Description Hover Modal Handler ----
  let hoverModalEl = null;

  function initDescHoverModal() {
    hoverModalEl = document.getElementById('chat-desc-hover-modal');
    if (!hoverModalEl) {
      hoverModalEl = document.createElement('div');
      hoverModalEl.id = 'chat-desc-hover-modal';
      hoverModalEl.className = 'chat-desc-hover-modal';
      hoverModalEl.innerHTML = `
        <div class="chat-desc-modal-header">
          <i data-lucide="file-text"></i>
          <span>Full Description</span>
        </div>
        <div class="chat-desc-modal-body" id="chat-desc-modal-text"></div>
      `;
      document.body.appendChild(hoverModalEl);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    document.addEventListener('mouseover', (e) => {
      const truncateEl = e.target.closest('.chat-desc-truncate, .chat-td.col-desc[data-full-desc]');
      if (!truncateEl) return;

      const fullDesc = truncateEl.dataset.fullDesc || '';
      if (!fullDesc) return;

      const textEl = hoverModalEl.querySelector('#chat-desc-modal-text');
      if (textEl) textEl.textContent = fullDesc;

      hoverModalEl.classList.add('visible');
      positionHoverModal(truncateEl);
    });

    document.addEventListener('mousemove', (e) => {
      const truncateEl = e.target.closest('.chat-desc-truncate, .chat-td.col-desc[data-full-desc]');
      if (!truncateEl && hoverModalEl && hoverModalEl.classList.contains('visible')) {
        hoverModalEl.classList.remove('visible');
      }
    });

    document.addEventListener('mouseout', (e) => {
      const truncateEl = e.target.closest('.chat-desc-truncate, .chat-td.col-desc[data-full-desc]');
      if (truncateEl && hoverModalEl) {
        // Prevent flicker when moving over inner icon or child elements
        if (e.relatedTarget && truncateEl.contains(e.relatedTarget)) {
          return;
        }
        hoverModalEl.classList.remove('visible');
      }
    });

    // Mobile click support
    document.addEventListener('click', (e) => {
      const truncateEl = e.target.closest('.chat-desc-truncate, .chat-td.col-desc[data-full-desc]');
      if (!truncateEl) {
        if (hoverModalEl && hoverModalEl.classList.contains('visible')) {
          hoverModalEl.classList.remove('visible');
        }
        return;
      }
      const fullDesc = truncateEl.dataset.fullDesc || '';
      if (!fullDesc) return;

      const textEl = hoverModalEl.querySelector('#chat-desc-modal-text');
      if (textEl) textEl.textContent = fullDesc;

      hoverModalEl.classList.toggle('visible');
      positionHoverModal(truncateEl);
    });
  }

  function positionHoverModal(targetEl) {
    if (!hoverModalEl || !targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const modalWidth = hoverModalEl.offsetWidth || 300;
    const modalHeight = hoverModalEl.offsetHeight || 75;

    // Prefer above target, fallback below if near top
    let top = rect.top - modalHeight - 10;
    if (top < 12) {
      top = rect.bottom + 10;
    }
    if (top + modalHeight > window.innerHeight - 12) {
      top = window.innerHeight - modalHeight - 12;
    }
    if (top < 12) top = 12;

    // Center horizontally on target with window margin bounds
    let left = rect.left + (rect.width / 2) - (modalWidth / 2);
    if (left < 14) left = 14;
    if (left + modalWidth > window.innerWidth - 14) {
      left = window.innerWidth - modalWidth - 14;
    }

    hoverModalEl.style.top = `${Math.round(top)}px`;
    hoverModalEl.style.left = `${Math.round(left)}px`;
  }

  function renderOfflineFallback({ query, offlineResult, isWidget }) {
    const fallbackData = offlineResult || {
      response: 'No financial data could be retrieved.',
      type: 'text',
      source: 'offline',
      engine: 'PondoSync Verified Offline Engine',
      suggestions: ['Magkano natitirang pera ng JPCS?', 'Monthly report for Oct 2025', 'Expenses by category']
    };

    if (isWidget) {
      const messagesEl = document.getElementById('chat-widget-messages');
      if (!messagesEl) return;
      const aiWrapper = document.createElement('div');
      aiWrapper.className = 'widget-msg-wrapper ai';
      aiWrapper.dataset.aiText = fallbackData.response;
      aiWrapper.dataset.userQuery = query;
      aiWrapper.innerHTML = `
        <div class="widget-msg ai">
          <div class="ai-msg-header-bar" style="margin-bottom: 4px;">
            <div class="ai-status-pill offline small" title="Calculated directly from verified ledger records"><i data-lucide="database"></i> <span>Ledger Engine</span></div>
          </div>
          ${formatResponse(fallbackData.response)}
        </div>
      `;
      messagesEl.appendChild(aiWrapper);
      postProcessChatMessage(aiWrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      addAIMessage(fallbackData.response, fallbackData.type, fallbackData.suggestions, fallbackData);
      scrollMessages();
    }
  }

  // ==========================================================
  //  FULL-PAGE CHAT LOGIC
  // ==========================================================
  function handleFullPageSend(message, options = {}) {
    if (aiMode === 'ai' && isGeminiQuotaBlocked() && !options.force) {
      const warning = document.getElementById('gemini-usage-warning');
      if (warning) warning.classList.remove('hidden');
      return;
    }

    // If user was editing a message, commit the edit by removing that message and all below it
    if (pendingEdit && pendingEdit.type === 'fullpage' && pendingEdit.row) {
      const rowToReplace = pendingEdit.row;
      pendingEdit = null;
      const banner = document.getElementById('ai-edit-banner');
      if (banner) banner.classList.add('hidden');
      removeChatFromRow(rowToReplace, false);
    }

    // Transition from empty → active state
    if (!chatStarted) {
      chatStarted = true;
      const emptyState = document.getElementById('ai-empty-state');
      const activeChat = document.getElementById('ai-chat-active');
      if (emptyState) emptyState.classList.add('hidden');
      if (activeChat) activeChat.classList.remove('hidden');
    }

    // Render user message
    addUserMessage(message);

    // Show typing
    const typingEl = addTypingIndicator();
    scrollMessages();

    // Send to API
    // Pass mode based on toggle state (unless options override it)
    const sendOpts = { ...options };
    if (aiMode === 'offline' && !sendOpts.force) {
      sendOpts.mode = 'offline_only';
    }

    sendToAPI(message, sendOpts).then(result => {
      typingEl.remove();

      // If user is in AI mode and both AI engines failed, show the interactive modal
      if (aiMode === 'ai' && !isGeminiQuotaBlocked() && (!result || result.source === 'offline')) {
        showAiUnavailableModal(message, result, false);
        return;
      }

      if (!result) {
        addAIMessage('⚠️ The server appears to be waking up (free-tier cold start). Please wait a moment and try again.', 'text', null, { source: 'offline' });
        scrollMessages();
        return;
      }

      // Always render response immediately — never block the user with a cooldown card
      addAIMessage(result.response, result.type, result.suggestions, result);
      scrollMessages();

      // Focus the active input
      const activeInput = document.getElementById('ai-input-field-active');
      if (activeInput) activeInput.focus();
    });
  }

  // ---- Helper: Live Cooldown Countdown for Choice Cards ----
  function setupChoiceCountdown(row, initialCooldown, query) {
    if (row._countdownTimer) {
      clearInterval(row._countdownTimer);
      row._countdownTimer = null;
    }

    let remaining = parseInt(initialCooldown || '10', 10);
    if (isNaN(remaining) || remaining <= 0) remaining = 10;
    const totalCooldown = remaining;

    function updateDisplay() {
      const titleVal = row.querySelector('.ai-countdown-val');
      const btnVal = row.querySelector('.btn-countdown-val');
      const barCountdown = row.querySelector('.ai-waiting-countdown');
      const progressBar = row.querySelector('.ai-choice-progress');

      if (titleVal) titleVal.textContent = remaining;
      if (btnVal) btnVal.textContent = remaining;
      if (barCountdown) barCountdown.textContent = `${remaining}s remaining`;
      if (progressBar) progressBar.style.width = `${(remaining / totalCooldown) * 100}%`;
    }

    function setReadyState() {
      if (row._countdownTimer) {
        clearInterval(row._countdownTimer);
        row._countdownTimer = null;
      }

      // If user already clicked "Wait for Online AI", automatically continue with AI! No second click needed!
      if (row._isWaiting) {
        executeContinueAI(row, query);
        return;
      }

      const card = row.querySelector('.ai-choice-card');
      if (!card) return;

      card.classList.add('ready');
      const isSmall = card.classList.contains('small');

      if (isSmall) {
        card.innerHTML = `
          <div class="ai-choice-top">
            <div class="ai-choice-status ready">
              <span class="ai-choice-pulse-dot ready"></span>
              <span>AI Ready</span>
            </div>
            <div class="ai-choice-timer-pill" style="border-color: rgba(34, 197, 94, 0.4); color: #4ade80; background: rgba(34, 197, 94, 0.1);">
              <i data-lucide="check-circle-2"></i>
              <span>Ready</span>
            </div>
          </div>
          <h5 class="ai-choice-heading" style="font-size: 0.85rem; margin-top: 4px; color: var(--gold-light);">PondoSync AI is Ready</h5>
          <p class="ai-choice-desc" style="font-size: 0.75rem;">Cooldown finished. Click below to continue with AI.</p>
          <div class="ai-choice-actions" style="gap: 6px; margin-top: 10px; padding-top: 8px;">
            <button class="ai-choice-btn continue-ai-btn small" data-query="${escapeAttr(query)}">
              <i data-lucide="sparkles"></i> <span>Continue with AI</span>
            </button>
            <button class="ai-choice-btn offline-now-btn small">
              <i data-lucide="database"></i> <span>Instant Offline</span>
            </button>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="ai-msg-header-bar" style="margin-bottom: 8px;">
            <div class="ai-choice-top" style="flex: 1; margin-bottom: 0;">
              <div class="ai-choice-status ready">
                <span class="ai-choice-pulse-dot ready"></span>
                <span>AI Slot Available</span>
              </div>
              <div class="ai-choice-timer-pill" style="border-color: rgba(34, 197, 94, 0.4); color: #4ade80; background: rgba(34, 197, 94, 0.1);">
                <i data-lucide="check-circle-2"></i>
                <span>Ready</span>
              </div>
            </div>
          </div>
          <h4 class="ai-choice-heading" style="color: var(--gold-light);">PondoSync AI is Ready</h4>
          <p class="ai-choice-desc">
            The 10-second cooldown has concluded. Click Continue to submit your prompt to the online AI analyst.
          </p>
          <div class="ai-choice-actions">
            <button class="ai-choice-btn continue-ai-btn" data-query="${escapeAttr(query)}">
              <i data-lucide="sparkles"></i> <span>Continue with AI</span>
            </button>
            <button class="ai-choice-btn offline-now-btn">
              <i data-lucide="database"></i> <span>Use Instant Ledger Answer</span>
            </button>
          </div>
        `;
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
      scrollMessages();
    }

    // Immediate initial sync
    updateDisplay();

    row._countdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        updateDisplay();
      } else {
        if (row._countdownTimer) {
          clearInterval(row._countdownTimer);
          row._countdownTimer = null;
        }
        if (row._isWaiting) {
          // Auto-continue without requiring another click!
          executeContinueAI(row, query);
        } else {
          setReadyState();
        }
      }
    }, 1000);
  }

  // ---- Helper: ChatGPT-Style Remove Reply & Edit from Row Downwards ----
  function removeChatFromRow(row, isEdit = false, userText = '') {
    const container = row.parentElement;
    if (!container) return;

    // Collect target row and all subsequent siblings downwards
    const rowsToRemove = [];
    let curr = row;
    while (curr) {
      rowsToRemove.push(curr);
      curr = curr.nextElementSibling;
    }

    rowsToRemove.forEach(r => {
      if (r._countdownTimer) {
        clearInterval(r._countdownTimer);
        r._countdownTimer = null;
      }
      const canvases = r.querySelectorAll('canvas');
      canvases.forEach(c => {
        if (c._chartInstance) {
          try { c._chartInstance.destroy(); } catch (_) {}
          c._chartInstance = null;
        }
      });
      r.remove();
    });

    // Synchronize chatHistory with remaining rows
    rebuildChatHistory();

    // Check if any chat messages remain
    const remainingRows = container.querySelectorAll('.ai-msg-row');
    if (remainingRows.length === 0) {
      chatStarted = false;
      const emptyState = document.getElementById('ai-empty-state');
      const activeChat = document.getElementById('ai-chat-active');
      if (emptyState) emptyState.classList.remove('hidden');
      if (activeChat) activeChat.classList.add('hidden');
    }

    // If edit triggered, populate input field and focus
    if (isEdit && userText) {
      const activeInput = document.getElementById('ai-input-field-active');
      const emptyInput = document.getElementById('ai-input-field-empty');
      const targetInput = (!chatStarted ? emptyInput : activeInput) || activeInput || emptyInput;
      if (targetInput) {
        targetInput.value = userText;
        targetInput.focus();
        try {
          targetInput.setSelectionRange(userText.length, userText.length);
        } catch (_) {}
        targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // ---- Helper: Remove from Widget Message Downwards ----
  function removeWidgetFromMsg(wrapper, isEdit = false, userText = '') {
    const container = wrapper.parentElement;
    if (!container) return;

    const itemsToRemove = [];
    let curr = wrapper;
    while (curr) {
      itemsToRemove.push(curr);
      curr = curr.nextElementSibling;
    }
    itemsToRemove.forEach(item => {
      if (item._countdownTimer) {
        clearInterval(item._countdownTimer);
        item._countdownTimer = null;
      }
      const canvases = item.querySelectorAll('canvas');
      canvases.forEach(c => {
        if (c._chartInstance) {
          try { c._chartInstance.destroy(); } catch (_) {}
          c._chartInstance = null;
        }
      });
      item.remove();
    });

    if (isEdit && userText) {
      const input = document.getElementById('chat-widget-input-field');
      if (input) {
        input.value = userText;
        input.focus();
        try {
          input.setSelectionRange(userText.length, userText.length);
        } catch (_) {}
      }
    }
  }

  // ---- Helper: Rebuild chatHistory from remaining visible messages ----
  function rebuildChatHistory() {
    const container = document.getElementById('ai-messages-scroll');
    chatHistory = [];
    if (!container) return;
    const rows = container.querySelectorAll('.ai-msg-row');
    let pendingUser = null;
    rows.forEach(r => {
      if (r.classList.contains('user')) {
        pendingUser = r.dataset.userText || r.querySelector('.ai-msg-user-bubble')?.textContent?.trim() || '';
      } else if (r.classList.contains('ai') && pendingUser) {
        const aiText = r.dataset.aiText || '';
        if (aiText) {
          chatHistory.push({ role: 'user', parts: [{ text: pendingUser }] });
          chatHistory.push({ role: 'model', parts: [{ text: aiText }] });
        }
        pendingUser = null;
      }
    });
  }

  function showChoicePrompt(data) {
    const container = document.getElementById('ai-messages-scroll');
    if (!container) return;

    choiceCounter++;
    const choiceId = `ai-choice-${choiceCounter}`;
    let cooldown = parseInt(data.cooldown || '10', 10);
    if (isNaN(cooldown) || cooldown <= 0) cooldown = 10;

    const row = document.createElement('div');
    row.className = 'ai-msg-row ai';
    row.id = choiceId;
    row.dataset.aiText = '';
    row.innerHTML = `
      <div class="ai-msg-ai-content">
        <div class="ai-msg-avatar"><i data-lucide="clock"></i></div>
        <div class="ai-msg-body">
          <div class="ai-choice-card">
            <div class="ai-msg-header-bar" style="margin-bottom: 8px;">
              <div class="ai-choice-top" style="flex: 1; margin-bottom: 0;">
                <div class="ai-choice-status">
                  <span class="ai-choice-pulse-dot"></span>
                  <span>AI Rate Limit Cooldown</span>
                </div>
                <div class="ai-choice-timer-pill">
                  <i data-lucide="timer"></i>
                  <span><span class="ai-countdown-val">${cooldown}</span>s remaining</span>
                </div>
              </div>
            </div>
            <h4 class="ai-choice-heading">PondoSync AI is Cooling Down</h4>
            <p class="ai-choice-desc">
              The public AI engine enforces a brief cooldown between queries. You can wait for the slot to open, or view the verified database report immediately.
            </p>
            <div class="ai-choice-actions">
              <button class="ai-choice-btn wait-ai-btn" data-choice-id="${choiceId}" data-query="${escapeAttr(data.userQuery || '')}">
                <i data-lucide="clock"></i> <span>Wait for Online AI (<span class="btn-countdown-val">${cooldown}</span>s)</span>
              </button>
              <button class="ai-choice-btn offline-now-btn" data-choice-id="${choiceId}">
                <i data-lucide="database"></i> <span>Use Instant Ledger Answer</span>
              </button>
            </div>
            <div class="ai-choice-progress" style="width: 100%;"></div>
          </div>
        </div>
      </div>
    `;

    // Store pre-calculated offline response on the element
    row._offlineData = data.offlineData || {
      response: data.response,
      type: data.type,
      suggestions: data.suggestions
    };
    row._userQuery = data.userQuery;

    container.appendChild(row);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setupChoiceCountdown(row, cooldown, data.userQuery || '');
    scrollMessages();
  }

  function addUserMessage(text) {
    const container = document.getElementById('ai-messages-scroll');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'ai-msg-row user';
    row.dataset.userText = text;
    row.innerHTML = `
      <div class="ai-msg-user-wrapper">
        <div class="ai-msg-user-bubble">${escapeHTML(text)}</div>
        <div class="ai-msg-actions user-actions">
          <button class="ai-msg-action-btn edit-msg-btn" title="Edit message (removes subsequent replies)" data-text="${escapeAttr(text)}">
            <i data-lucide="edit-2"></i> <span>Edit</span>
          </button>
          <button class="ai-msg-action-btn delete-msg-btn" title="Delete from here downwards">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(row);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function addAIMessage(responseText, type, serverSuggestions, meta = {}) {
    const container = document.getElementById('ai-messages-scroll');
    if (!container) return;

    const formatted = formatResponse(responseText);
    const isOffline = meta.source === 'offline';
    const retryCooldown = meta.retryCooldown || 0;

    // Status pill: "AI" with gold gradient or "Ledger Engine" in gray
    const statusPillHTML = isOffline
      ? `<div class="ai-status-pill offline" title="Calculated directly from verified ledger records"><i data-lucide="database"></i> <span>Ledger Engine</span></div>`
      : `<div class="ai-status-pill online" title="Generated by AI"><i data-lucide="sparkles"></i> <span>AI</span></div>`;

    // Determine follow-up suggestions
    const suggestions = serverSuggestions ||
      followUpMap[type] ||
      followUpMap['text'];

    const suggestionsHTML = suggestions.map(s =>
      `<button class="ai-followup-chip" data-query="${escapeAttr(s)}">${escapeHTML(s)}</button>`
    ).join('');

    const row = document.createElement('div');
    row.className = 'ai-msg-row ai';
    row.dataset.aiText = responseText;
    row.innerHTML = `
      <div class="ai-msg-ai-content">
        <div class="ai-msg-avatar"><i data-lucide="sparkles"></i></div>
        <div class="ai-msg-body">
          <div class="ai-msg-header-bar">
            ${statusPillHTML}
          </div>
          ${formatted}
          <div class="ai-followup-suggestions">
            ${suggestionsHTML}
          </div>
        </div>
      </div>
    `;
    container.appendChild(row);
    postProcessChatMessage(row);
  }

  function addTypingIndicator() {
    const container = document.getElementById('ai-messages-scroll');
    const row = document.createElement('div');
    row.className = 'ai-typing-row';
    row.innerHTML = `
      <div class="ai-msg-ai-content">
        <div class="ai-msg-avatar"><i data-lucide="sparkles"></i></div>
        <div class="ai-msg-body">
          <div class="skeleton skeleton-text full"></div>
          <div class="skeleton skeleton-text long"></div>
          <div class="skeleton skeleton-text short"></div>
        </div>
      </div>
    `;
    container.appendChild(row);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    scrollMessages();
    return row;
  }

  function scrollMessages() {
    const container = document.getElementById('ai-messages-scroll');
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  // ==========================================================
  //  FLOATING WIDGET
  // ==========================================================
  function initWidget() {
    const fab       = document.getElementById('chat-fab');
    const widget    = document.getElementById('chat-widget');
    const closeBtn  = document.getElementById('chat-widget-close');
    const expandBtn = document.getElementById('chat-widget-expand');
    const sendBtn   = document.getElementById('chat-widget-send');
    const input     = document.getElementById('chat-widget-input-field');

    if (!fab || !widget) return;

    function updateWidgetOrigin() {
      const fabRect = fab.getBoundingClientRect();
      const originX = (fabRect.left + fabRect.width / 2) - widget.offsetLeft;
      const originY = (fabRect.top + fabRect.height / 2) - widget.offsetTop;
      widget.style.transformOrigin = `${originX}px ${originY}px`;
      
      // Force a reflow so the browser applies the origin BEFORE the transition starts
      void widget.offsetWidth;
    }

    function toggleFabBounce() {
      fab.classList.add('fab-clicked');
      setTimeout(() => fab.classList.remove('fab-clicked'), 150);
    }

    // Toggle widget
    fab.addEventListener('click', () => {
      toggleFabBounce();
      updateWidgetOrigin();

      const isOpen = !widget.classList.contains('widget-hidden');
      if (isOpen) {
        widget.classList.add('widget-hidden');
      } else {
        widget.classList.remove('widget-hidden');
        if (input) input.focus();
      }
    });

    // Close widget
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        toggleFabBounce();
        updateWidgetOrigin();
        widget.classList.add('widget-hidden');
      });
    }

    // Expand to full chatbot page
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        toggleFabBounce();
        updateWidgetOrigin();
        widget.classList.add('widget-hidden');
        if (typeof navigateTo === 'function') navigateTo('chatbot');
      });
    }

    // Send message in widget
    if (sendBtn && input) {
      sendBtn.addEventListener('click', () => {
        const msg = input.value.trim();
        if (msg) { input.value = ''; handleWidgetSend(msg); }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const msg = input.value.trim();
          if (msg) { input.value = ''; handleWidgetSend(msg); }
        }
      });
    }

    // Make widget draggable by header
    const header = widget.querySelector('.chat-widget-header');
    let isDragging = false;
    let startX, startY, initialX, initialY;

    if (header) {
      header.addEventListener('mousedown', (e) => {
        // Prevent dragging if clicking buttons
        if (e.target.closest('button')) return;
        
        isDragging = true;
        
        // Temporarily clear right/bottom styles to fix it to left/top
        const rect = widget.getBoundingClientRect();
        widget.style.right = 'auto';
        widget.style.bottom = 'auto';
        widget.style.left = rect.left + 'px';
        widget.style.top = rect.top + 'px';

        // Set the transform origin EXACTLY where the user clicked, so the shrink feels physical
        const originX = e.clientX - rect.left;
        const originY = e.clientY - rect.top;
        widget.style.transformOrigin = `${originX}px ${originY}px`;
        
        // Force reflow before applying dragging class
        void widget.offsetWidth;
        
        widget.classList.add('dragging');

        initialX = rect.left;
        initialY = rect.top;
        startX = e.clientX;
        startY = e.clientY;
        
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        widget.style.left = (initialX + dx) + 'px';
        widget.style.top = (initialY + dy) + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          widget.classList.remove('dragging');
          
          // Boundary check & smooth snap-back
          let newLeft = widget.offsetLeft;
          let newTop = widget.offsetTop;
          
          const padding = 20;
          const wWidth = widget.offsetWidth;
          const wHeight = widget.offsetHeight;
          
          if (newLeft < padding) newLeft = padding;
          if (newLeft + wWidth > window.innerWidth - padding) newLeft = window.innerWidth - wWidth - padding;
          
          if (newTop < padding) newTop = padding;
          if (newTop + wHeight > window.innerHeight - padding) newTop = window.innerHeight - wHeight - padding;
          
          if (newLeft !== widget.offsetLeft || newTop !== widget.offsetTop) {
            widget.classList.add('snap-back');
            widget.style.left = newLeft + 'px';
            widget.style.top = newTop + 'px';
            setTimeout(() => widget.classList.remove('snap-back'), 400);
          }
        }
      });
    }
  }

  function handleWidgetSend(message, options = {}) {
    const messagesEl = document.getElementById('chat-widget-messages');
    if (!messagesEl) return;

    if (aiMode === 'ai' && isGeminiQuotaBlocked() && !options.force) {
      const warning = document.getElementById('gemini-usage-warning');
      if (warning) warning.classList.remove('hidden');
      return;
    }

    if (pendingEdit && pendingEdit.type === 'widget' && pendingEdit.widgetWrapper) {
      const wrapperToReplace = pendingEdit.widgetWrapper;
      pendingEdit = null;
      removeWidgetFromMsg(wrapperToReplace, false);
    }

    // User bubble with actions
    const userWrapper = document.createElement('div');
    userWrapper.className = 'widget-msg-wrapper user';
    userWrapper.dataset.userText = message;
    userWrapper.innerHTML = `
      <div class="widget-msg user">${escapeHTML(message)}</div>
      <div class="ai-msg-actions">
        <button class="ai-msg-action-btn edit-msg-btn" title="Edit message" data-text="${escapeAttr(message)}">
          <i data-lucide="edit-2"></i> <span>Edit</span>
        </button>
        <button class="ai-msg-action-btn delete-msg-btn" title="Delete from here">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    messagesEl.appendChild(userWrapper);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Typing
    const typing = document.createElement('div');
    typing.className = 'widget-msg ai';
    typing.innerHTML = `
      <div class="skeleton skeleton-text full"></div>
      <div class="skeleton skeleton-text short"></div>
    `;
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const widgetSendOpts = { ...options };
    if (aiMode === 'offline' && !widgetSendOpts.force) {
      widgetSendOpts.mode = 'offline_only';
    }

    sendToAPI(message, widgetSendOpts).then(result => {
      typing.remove();

      // If user is in AI mode and both AI engines failed, show interactive modal
      if (aiMode === 'ai' && !isGeminiQuotaBlocked() && (!result || result.source === 'offline')) {
        showAiUnavailableModal(message, result, true);
        return;
      }

      if (!result) {
        const errEl = document.createElement('div');
        errEl.className = 'widget-msg ai';
        errEl.innerHTML = '<p>Error processing request.</p>';
        messagesEl.appendChild(errEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return;
      }

      const aiWrapper = document.createElement('div');
      aiWrapper.className = 'widget-msg-wrapper ai';
      aiWrapper.dataset.aiText = result.response;
      aiWrapper.dataset.userQuery = message;
      const isOffline = result.source === 'offline';
      const statusPillHTML = isOffline
        ? `<div class="ai-status-pill offline small" title="Calculated directly from verified ledger records"><i data-lucide="database"></i> <span>Ledger Engine</span></div>`
        : `<div class="ai-status-pill online small" title="Generated by AI"><i data-lucide="sparkles"></i> <span>AI</span></div>`;

      aiWrapper.innerHTML = `
        <div class="widget-msg ai">
          <div class="ai-msg-header-bar" style="margin-bottom: 4px;">
            ${statusPillHTML}
          </div>
          ${formatResponse(result.response)}
        </div>
      `;
      messagesEl.appendChild(aiWrapper);
      postProcessChatMessage(aiWrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ==========================================================
  //  FAB VISIBILITY (hide on chatbot page)
  // ==========================================================
  function observePageChanges() {
    const fab = document.getElementById('chat-fab');
    if (!fab) return;

    // Use MutationObserver to watch for active page changes
    const pagesContainer = document.querySelector('.pages-wrapper') ||
                           document.querySelector('.main-content');
    if (!pagesContainer) return;

    const observer = new MutationObserver(() => {
      const chatbotPage = document.getElementById('page-chatbot');
      if (chatbotPage && chatbotPage.classList.contains('active')) {
        fab.classList.add('hidden');
        // Also hide widget when on chatbot page
        const widget = document.getElementById('chat-widget');
        if (widget) widget.classList.add('widget-hidden');
      } else {
        fab.classList.remove('hidden');
      }
    });

    observer.observe(pagesContainer, { subtree: true, attributes: true, attributeFilter: ['class'] });

    // Initial check
    const chatbotPage = document.getElementById('page-chatbot');
    if (chatbotPage && chatbotPage.classList.contains('active')) {
      fab.classList.add('hidden');
    }
  }

  // ==========================================================
  //  API COMMUNICATION
  // ==========================================================
  let chatHistory = [];

  async function sendToAPI(message, options = {}) {
    try {
      // Keep only last 10 messages for context
      if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

      const payload = {
        message,
        history: chatHistory,
        formatPrefs: { ...formatPrefs },
        ...options
      };

      if (isGeminiQuotaBlocked()) payload.mode = 'offline_only';

      const data = await apiPost('/chatbot/query', payload);

      if (data && data.success) {
        if (data.data.usageStatus) renderGeminiUsageStatus(data.data.usageStatus);
        // The backend gate is authoritative when the browser's last poll was stale.
        if (data.data.reason === 'quota_low') {
          renderGeminiUsageStatus({
            ...(geminiUsageStatus || {}),
            ...(data.data.usageStatus || {}),
            blocked: true,
            availability: 'quota_limited',
            warning: data.data.quotaWarning || 'The verified Gemini quota is at or below 5% remaining.'
          });
        }
        refreshGeminiUsageStatus();
        if (data.data.response) {
          chatHistory.push({ role: 'user', parts: [{ text: message }] });
          chatHistory.push({ role: 'model', parts: [{ text: data.data.response }] });
        }
        return data.data;
      }
      refreshGeminiUsageStatus();
      return null;
    } catch (err) {
      console.error('[Chatbot] API Error:', err);
      refreshGeminiUsageStatus();
      return null;
    }
  }

  // ==========================================================
  //  CHATGPT-STYLE RESPONSE FORMATTING & MARKDOWN PARSER
  // ==========================================================
  function parseCurrency(str) {
    if (!str) return 0;
    const match = str.replace(/,/g, '').match(/[-+]?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  }

  function isNumericOrCurrency(str) {
    if (!str) return false;
    const clean = str.replace(/<[^>]*>/g, '').replace(/[*_]/g, '').trim();
    return /^[₱$€£¥]/.test(clean) || /^\d+(\.\d+)?%$/.test(clean) || /^[-+]?₱?[\d,]+(\.\d+)?%?$/.test(clean) || /^\d+$/.test(clean);
  }

  function formatInlineMarkdown(text) {
    if (!text) return '';
    return text
      // Fenced inline code `code`
      .replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>')
      // Links: [text](url)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>')
      // Bold italic: ***text*** or ___text___
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="chat-strong"><em class="chat-em">$1</em></strong>')
      .replace(/___(.+?)___/g, '<strong class="chat-strong"><em class="chat-em">$1</em></strong>')
      // Bold: **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, '<strong class="chat-strong">$1</strong>')
      .replace(/__(.+?)__/g, '<strong class="chat-strong">$1</strong>')
      // Italic: *text* or _text_
      .replace(/\*([^*\n]+)\*/g, '<em class="chat-em">$1</em>')
      .replace(/_([^_\n]+)_/g, '<em class="chat-em">$1</em>');
  }

  function cleanPeriodName(h, fallback = '') {
    if (!h) return fallback;
    const stripped = h.replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim();
    const parenMatch = stripped.match(/\((.*?)\)/);
    if (parenMatch && parenMatch[1].trim()) {
      return parenMatch[1].trim();
    }
    return stripped.replace(/^(Previous|Current|Nakaraang|Kasalukuyang)\s*(Period|Buwan)?\s*[:-]?\s*/i, '').trim() || stripped || fallback;
  }

  function isComparisonTable(headers, rows) {
    if (!headers || headers.length < 4 || !rows || rows.length < 2) return false;
    const cleanHeaders = headers.map(h => (h || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim().toLowerCase());
    const hasMetricCol = cleanHeaders[0].includes('metric') || cleanHeaders[0].includes('sukatan') || cleanHeaders[0].includes('financial');
    const hasDiffCol = cleanHeaders.some(h => h.includes('diff') || h.includes('pagkakaiba') || h.includes('change') || h.includes('bahagdan'));
    const hasPeriodCols = cleanHeaders.some(h => h.includes('period') || h.includes('previous') || h.includes('current') || h.includes('nakaraan') || h.includes('kasalukuyan') || /\b202\d\b/.test(h) || h.includes('quarter') || /\bq[1-4]\b/.test(h));

    const rowLabels = rows.map(r => (r[0] || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim().toLowerCase());
    const hasIncomeRow = rowLabels.some(l => l.includes('income') || l.includes('kita'));
    const hasExpenseRow = rowLabels.some(l => l.includes('expense') || l.includes('gastos'));

    return (hasMetricCol || hasPeriodCols) && (hasDiffCol || headers.length >= 4) && hasIncomeRow && hasExpenseRow;
  }

  function isComparisonOverviewTable(headers, rows) {
    if (!headers || headers.length !== 3 || !rows || rows.length < 2) return false;
    const h0 = (headers[0] || '').toLowerCase();
    if (!h0.includes('metric') && !h0.includes('sukatan') && !h0.includes('financial')) return false;
    const rowLabels = rows.map(r => (r[0] || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim().toLowerCase());
    return rowLabels.some(l => l.includes('net') || l.includes('income') || l.includes('expense'));
  }

  function renderPeriodComparisonOverview(headers, rows) {
    if (!isComparisonOverviewTable(headers, rows)) return null;

    const labelA = cleanPeriodName(headers[1], 'Period A');
    const labelB = cleanPeriodName(headers[2], 'Period B');

    function parsePeriodCell(val) {
      if (!val) return { amount: '', count: '' };
      const raw = val.replace(/<[^>]*>/g, '').trim();
      const parenMatch = raw.match(/\((.*?)\)/);
      let count = '';
      let amount = raw;
      if (parenMatch && parenMatch[1]) {
        count = parenMatch[1].trim();
        amount = raw.replace(/\(.*?\)/, '').trim();
      }
      return { amount, count };
    }

    let netA = '', netB = '';
    let incA = '', incCountA = '', incB = '', incCountB = '';
    let expA = '', expCountA = '', expB = '', expCountB = '';

    for (const row of rows) {
      const metric = (row[0] || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim().toLowerCase();
      const parsedA = parsePeriodCell(row[1]);
      const parsedB = parsePeriodCell(row[2]);

      const isRatio = metric.includes('ratio') || metric.includes('bahagdan') || metric.includes('rate');

      if (metric.includes('net') || metric.includes('cash flow')) {
        netA = parsedA.amount;
        netB = parsedB.amount;
      } else if (!isRatio && (metric.includes('income') || metric.includes('kita'))) {
        incA = parsedA.amount;
        incCountA = parsedA.count;
        incB = parsedB.amount;
        incCountB = parsedB.count;
      } else if (!isRatio && (metric.includes('expense') || metric.includes('gastos'))) {
        expA = parsedA.amount;
        expCountA = parsedA.count;
        expB = parsedB.amount;
        expCountB = parsedB.count;
      }
    }

    const isSurplusA = netA ? (!netA.toLowerCase().includes('deficit') && !netA.includes('-') && !netA.toLowerCase().includes('kalugihan')) : true;
    const isSurplusB = netB ? (!netB.toLowerCase().includes('deficit') && !netB.includes('-') && !netB.toLowerCase().includes('kalugihan')) : true;

    return `
<div class="chat-period-comparison-grid">
  <!-- Period A Card -->
  <div class="chat-period-card">
    <div class="chat-period-card-header">
      <div class="chat-period-title">
        <i data-lucide="calendar"></i>
        <span>${escapeHTML(labelA)}</span>
      </div>
      <span class="chat-summary-badge ${isSurplusA ? 'surplus' : 'deficit'}">${isSurplusA ? 'Surplus' : 'Deficit'}</span>
    </div>
    <div class="chat-period-hero">
      <span class="chat-hero-label">Net Cash Flow</span>
      <div class="chat-hero-value ${isSurplusA ? 'positive' : 'negative'}">
        ${formatInlineMarkdown(netA || '₱0.00')}
      </div>
    </div>
    <div class="chat-period-metrics">
      <div class="chat-period-metric-row">
        <span class="chat-metric-label">Total Income</span>
        <div class="chat-period-metric-data">
          <span class="chat-metric-val income">${formatInlineMarkdown(incA || '₱0.00')}</span>
          ${incCountA ? `<span class="chat-tx-count">${escapeHTML(incCountA)}</span>` : ''}
        </div>
      </div>
      <div class="chat-period-metric-row">
        <span class="chat-metric-label">Total Expenses</span>
        <div class="chat-period-metric-data">
          <span class="chat-metric-val expense">${formatInlineMarkdown(expA || '₱0.00')}</span>
          ${expCountA ? `<span class="chat-tx-count">${escapeHTML(expCountA)}</span>` : ''}
        </div>
      </div>
    </div>
  </div>

  <!-- Period B Card -->
  <div class="chat-period-card">
    <div class="chat-period-card-header">
      <div class="chat-period-title">
        <i data-lucide="calendar"></i>
        <span>${escapeHTML(labelB)}</span>
      </div>
      <span class="chat-summary-badge ${isSurplusB ? 'surplus' : 'deficit'}">${isSurplusB ? 'Surplus' : 'Deficit'}</span>
    </div>
    <div class="chat-period-hero">
      <span class="chat-hero-label">Net Cash Flow</span>
      <div class="chat-hero-value ${isSurplusB ? 'positive' : 'negative'}">
        ${formatInlineMarkdown(netB || '₱0.00')}
      </div>
    </div>
    <div class="chat-period-metrics">
      <div class="chat-period-metric-row">
        <span class="chat-metric-label">Total Income</span>
        <div class="chat-period-metric-data">
          <span class="chat-metric-val income">${formatInlineMarkdown(incB || '₱0.00')}</span>
          ${incCountB ? `<span class="chat-tx-count">${escapeHTML(incCountB)}</span>` : ''}
        </div>
      </div>
      <div class="chat-period-metric-row">
        <span class="chat-metric-label">Total Expenses</span>
        <div class="chat-period-metric-data">
          <span class="chat-metric-val expense">${formatInlineMarkdown(expB || '₱0.00')}</span>
          ${expCountB ? `<span class="chat-tx-count">${escapeHTML(expCountB)}</span>` : ''}
        </div>
      </div>
    </div>
  </div>
</div>`;
  }

  function renderSummaryBox(headers, rows) {
    if (!headers || headers.length !== 2) return null;
    const h0 = (headers[0] || '').toLowerCase();
    // Check if table is a Financial Metrics / Summary table
    if (!h0.includes('metric') && !h0.includes('sukatan') && !h0.includes('financial') && !h0.includes('item') && !h0.includes('kategorya ng ulat') && !h0.includes('account')) {
      return null;
    }

    let totalIncome = null;
    let totalExpenses = null;
    let netResult = null;
    let remainingBalance = null;
    let openingBalance = null;
    let closingBalance = null;
    let totalTransactions = null;
    let largestExpense = null;

    for (const row of rows) {
      const rawLabel = (row[0] || '').replace(/<[^>]*>/g, '').replace(/[*_]/g, '').trim();
      const rawVal = (row[1] || '').trim();
      const labelLower = rawLabel.toLowerCase();

      if (labelLower.includes('largest expense') || labelLower.includes('pinakamalaking gastos') || labelLower.includes('pinakamalaki')) {
        largestExpense = rawVal;
      } else if (labelLower.includes('opening balance') || labelLower.includes('panimulang pondo') || labelLower.includes('beginning balance')) {
        openingBalance = rawVal;
      } else if (labelLower.includes('closing balance') || labelLower.includes('pangwakas na pondo')) {
        closingBalance = rawVal;
      } else if (labelLower.includes('total income') || labelLower.includes('kabuuang kita') || labelLower.includes('pumasok na pondo') || (labelLower.includes('income') && !labelLower.includes('count'))) {
        totalIncome = rawVal;
      } else if (labelLower.includes('total expense') || labelLower.includes('kabuuang gastos') || labelLower.includes('nagastos') || (labelLower.includes('expense') && !labelLower.includes('count') && !labelLower.includes('largest'))) {
        totalExpenses = rawVal;
      } else if (labelLower.includes('net result') || labelLower.includes('net balance') || labelLower.includes('net cash flow') || labelLower.includes('netong resulta')) {
        netResult = rawVal;
      } else if (labelLower.includes('remaining balance') || labelLower.includes('natitirang balance') || labelLower.includes('kasalukuyang pondo')) {
        remainingBalance = rawVal;
      } else if (labelLower.includes('transaction') || labelLower.includes('talaan') || labelLower.includes('transaksyon')) {
        totalTransactions = rawVal;
      }
    }

    if (!totalIncome && !totalExpenses && !netResult && !remainingBalance && !openingBalance && !closingBalance) {
      return null;
    }

    const isSurplus = netResult ? (!netResult.toLowerCase().includes('deficit') && !netResult.includes('-') && !netResult.toLowerCase().includes('kalugihan')) : true;
    const statusBadge = isSurplus ? 'Surplus' : 'Deficit';

    let heroAmount = netResult || remainingBalance || '';
    let heroSub = '';
    if (heroAmount) {
      const parts = heroAmount.split(/\((.*?)\)/);
      if (parts.length > 1) {
        heroAmount = parts[0].trim();
        heroSub = parts[1].trim();
      }
    }

    let incomeVal = totalIncome || '';
    let incomeCount = '';
    if (incomeVal) {
      const parts = incomeVal.split(/\((.*?)\)/);
      if (parts.length > 1) {
        incomeVal = parts[0].trim();
        incomeCount = parts[1].trim();
      }
    }

    let expenseVal = totalExpenses || '';
    let expenseCount = '';
    if (expenseVal) {
      const parts = expenseVal.split(/\((.*?)\)/);
      if (parts.length > 1) {
        expenseVal = parts[0].trim();
        expenseCount = parts[1].trim();
      }
    }

    let html = `<div class="chat-summary-box">
      <div class="chat-summary-header">
        <div class="chat-summary-title">
          <i data-lucide="receipt"></i>
          <span>Financial Overview</span>
        </div>
        <span class="chat-summary-badge ${isSurplus ? 'surplus' : 'deficit'}">${escapeHTML(statusBadge)}</span>
      </div>`;

    if (heroAmount) {
      html += `
      <div class="chat-summary-hero">
        <span class="chat-hero-label">Net Cash Flow / Result</span>
        <div class="chat-hero-value ${isSurplus ? 'positive' : 'negative'}">
          ${formatInlineMarkdown(heroAmount)}
        </div>
        ${heroSub ? `<div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 3px;">(${formatInlineMarkdown(heroSub)})</div>` : ''}
      </div>`;
    }

    html += `
      <div class="chat-summary-grid">`;

    if (incomeVal) {
      html += `
        <div class="chat-metric-card">
          <span class="chat-metric-label">Total Income</span>
          <span class="chat-metric-val income">${formatInlineMarkdown(incomeVal)}</span>
          ${incomeCount ? `<span style="font-size: 0.72rem; color: var(--text-muted);">${escapeHTML(incomeCount)}</span>` : ''}
        </div>`;
    }

    if (expenseVal) {
      html += `
        <div class="chat-metric-card">
          <span class="chat-metric-label">Total Expenses</span>
          <span class="chat-metric-val expense">${formatInlineMarkdown(expenseVal)}</span>
          ${expenseCount ? `<span style="font-size: 0.72rem; color: var(--text-muted);">${escapeHTML(expenseCount)}</span>` : ''}
        </div>`;
    }

    if (openingBalance) {
      html += `
        <div class="chat-metric-card">
          <span class="chat-metric-label">Opening Balance</span>
          <span class="chat-metric-val">${formatInlineMarkdown(openingBalance)}</span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Period Start</span>
        </div>`;
    }

    if (closingBalance) {
      html += `
        <div class="chat-metric-card">
          <span class="chat-metric-label">Closing Balance</span>
          <span class="chat-metric-val" style="color: var(--gold-light);">${formatInlineMarkdown(closingBalance)}</span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Period End</span>
        </div>`;
    } else if (totalTransactions || remainingBalance) {
      const thirdLabel = totalTransactions ? 'Transactions' : 'Balance';
      const thirdVal = totalTransactions || remainingBalance;
      html += `
        <div class="chat-metric-card">
          <span class="chat-metric-label">${thirdLabel}</span>
          <span class="chat-metric-val">${formatInlineMarkdown(thirdVal)}</span>
          <span style="font-size: 0.72rem; color: var(--text-muted);">Verified Ledger</span>
        </div>`;
    }

    html += `
      </div>`;

    if (largestExpense) {
      html += `
      <div class="chat-summary-footer">
        <span><strong>Largest Expense:</strong> ${formatInlineMarkdown(largestExpense)}</span>
      </div>`;
    }

    html += `
    </div>`;

    return html;
  }

  function renderDataTable(headers, rows) {
    const isCompTable = isComparisonTable(headers, rows);

    // 1. Identify column types based on header titles
    const colTypes = headers.map(h => {
      const norm = (h || '').toLowerCase().replace(/<[^>]*>/g, '').trim();
      if (norm.includes('date') || norm.includes('petsa')) return 'date';
      if (norm.includes('desc') || norm.includes('detail') || norm.includes('particular') || norm.includes('item') || norm.includes('source')) return 'desc';
      if (norm.includes('cat') || norm.includes('kategorya')) return 'category';
      if (norm === 'type' || norm.includes('record type') || norm.includes('uri')) return 'type';
      if (norm.includes('amount') || norm.includes('halaga') || norm.includes('total') || norm.includes('price') || norm.includes('cost')) return 'amount';
      return 'general';
    });

    // Detect column numeric alignments as fallback
    const colIsNumeric = headers.map((_, colIdx) => {
      if (colTypes[colIdx] === 'amount') return true;
      let numericCount = 0;
      let totalNonEmpty = 0;
      for (const row of rows) {
        const cell = row[colIdx];
        if (cell && cell.trim()) {
          totalNonEmpty++;
          if (isNumericOrCurrency(cell)) numericCount++;
        }
      }
      return totalNonEmpty > 0 && (numericCount / totalNonEmpty) >= 0.5;
    });

    // 2. Filter out Type column if present (since Amount color indicates income/expense)
    const typeColIdx = colTypes.indexOf('type');
    const visibleHeaders = typeColIdx !== -1 ? headers.filter((_, idx) => idx !== typeColIdx) : headers;
    const visibleColTypes = typeColIdx !== -1 ? colTypes.filter((_, idx) => idx !== typeColIdx) : colTypes;
    const visibleColIsNumeric = typeColIdx !== -1 ? colIsNumeric.filter((_, idx) => idx !== typeColIdx) : colIsNumeric;

    let tableHtml = `<div class="chat-table-container"><table class="chat-table"><thead class="chat-thead"><tr>`;
    visibleHeaders.forEach((h, i) => {
      let extraClass = '';
      let headerText = h;
      if (isCompTable) {
        if (i === 0) extraClass += ' col-metric';
        else {
          extraClass += ' col-numeric col-amount';
          if (i === 1 || i === 2) {
            headerText = cleanPeriodName(h, h);
          }
        }
      } else {
        if (visibleColTypes[i] === 'date') extraClass += ' col-date';
        if (visibleColTypes[i] === 'desc') extraClass += ' col-desc';
        if (visibleColTypes[i] === 'category') extraClass += ' col-category';
        if (visibleColTypes[i] === 'amount' || visibleColIsNumeric[i]) extraClass += ' col-numeric col-amount';
      }
      tableHtml += `<th class="chat-th${extraClass}">${formatInlineMarkdown(headerText)}</th>`;
    });
    tableHtml += `</tr></thead><tbody class="chat-tbody">`;

    rows.forEach(originalRow => {
      const row = [...originalRow];
      const rowMetricLabel = (row[0] || '').toLowerCase();
      const isTotalRow = !isCompTable && (rowMetricLabel.includes('total') || rowMetricLabel.includes('kabuuang'));
      
      let rowClass = ' class="chat-tr"';
      if (isCompTable && (rowMetricLabel.includes('net') || rowMetricLabel.includes('cash flow'))) {
        rowClass = ' class="chat-tr chat-comp-net-row"';
      } else if (isTotalRow) {
        rowClass = ' class="chat-tr chat-table-total-row"';
      }
      tableHtml += `<tr${rowClass}>`;

      // Determine if this row represents an income or expense
      let rowType = null; // 'income' | 'expense'
      const catIdx = colTypes.indexOf('category');
      const descIdx = colTypes.indexOf('desc');

      if (!isTotalRow && !isCompTable) {
        if (typeColIdx !== -1 && row[typeColIdx]) {
          const tVal = row[typeColIdx].toLowerCase();
          if (tVal.includes('income') || tVal.includes('kita')) rowType = 'income';
          else if (tVal.includes('expense') || tVal.includes('gastos')) rowType = 'expense';
        }

        if (!rowType && catIdx !== -1 && row[catIdx]) {
          const catVal = row[catIdx].toLowerCase();
          // Positively identify income categories
          if (catVal.includes('income') || catVal.includes('source') || catVal.includes('kita') || catVal.includes('booth') || catVal.includes('fee') || catVal.includes('membership') || catVal.includes('registration') || catVal.includes('donation') || catVal.includes('sponsorship') || catVal.includes('sponsor') || catVal.includes('ticket') || catVal.includes('sales') || catVal.includes('merch') || catVal.includes('solicitation') || catVal.includes('fundrais') || catVal.includes('collection') || catVal.includes('revenue') || catVal.includes('earning') || catVal.includes('beginning balance') || catVal.includes('cash on hand')) {
            rowType = 'income';
          }
          // Positively identify expense categories
          else if (catVal.includes('supplies') || catVal.includes('food') || catVal.includes('beverage') || catVal.includes('transportation') || catVal.includes('printing') || catVal.includes('equipment') || catVal.includes('venue') || catVal.includes('miscellaneous') || catVal.includes('events') || catVal.includes('expense') || catVal.includes('gastos')) {
            rowType = 'expense';
          }
          // Do NOT default — let the amount sign check below determine the type
        }

        if (!rowType) {
          const amountIdx = colTypes.findIndex((t, idx) => t === 'amount' || colIsNumeric[idx]);
          if (amountIdx !== -1 && row[amountIdx]) {
            const aVal = row[amountIdx];
            if (aVal.includes('+')) rowType = 'income';
            else if (aVal.includes('-')) rowType = 'expense';
          }
        }

        if (!rowType && descIdx !== -1 && row[descIdx]) {
          const dVal = row[descIdx].toLowerCase();
          if (dVal.includes('income') || dVal.includes('booth') || dVal.includes('fee') || dVal.includes('donation') || dVal.includes('sales') || dVal.includes('sponsor') || dVal.includes('membership') || dVal.includes('registration') || dVal.includes('solicitation') || dVal.includes('collection')) {
            rowType = 'income';
          }
          // Do NOT default to expense — leave for other checks or uncolored
        }

        if (!rowType && row[0]) {
          const firstCol = (row[0] || '').toLowerCase();
          if (firstCol.includes('income') || firstCol.includes('kita') || firstCol.includes('surplus')) {
            rowType = 'income';
          } else if (firstCol.includes('expense') || firstCol.includes('gastos') || firstCol.includes('deficit')) {
            rowType = 'expense';
          }
        }

        // Refine Income category if it is generic "Income"
        if (catIdx !== -1 && row[catIdx]) {
          const rawCat = row[catIdx].replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim();
          if (rawCat.toLowerCase() === 'income' && descIdx !== -1 && row[descIdx]) {
            const rawDesc = row[descIdx].replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim();
            const sepMatch = rawDesc.match(/^(.*?)\s+[—–-]\s+(.*)$/);
            if (sepMatch) {
              row[catIdx] = sepMatch[1].trim();
              row[descIdx] = sepMatch[2].trim();
            } else {
              const dLower = rawDesc.toLowerCase();
              if (dLower.includes('booth')) row[catIdx] = 'Booth Income';
              else if (dLower.includes('membership')) row[catIdx] = 'Membership Fees';
              else if (dLower.includes('registration')) row[catIdx] = 'Registration Fees';
              else if (dLower.includes('donation')) row[catIdx] = 'Donations';
              else if (dLower.includes('sponsor')) row[catIdx] = 'Sponsorship';
              else if (dLower.includes('ticket')) row[catIdx] = 'Ticket Sales';
              else if (dLower.includes('merch') || dLower.includes('sales')) row[catIdx] = 'Merchandise Sales';
            }
          }
        }
      }

      // Filter out Type column from visible cells
      const visibleCells = typeColIdx !== -1 ? row.filter((_, idx) => idx !== typeColIdx) : row;

      visibleCells.forEach((cell, i) => {
        let cellClass = 'chat-td';
        const rawCell = (cell || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim();

        // Comparison Table Specialized Rendering
        if (isCompTable) {
          if (i === 0) {
            cellClass += ' col-metric';
            tableHtml += `<td class="${cellClass}">${formatInlineMarkdown(cell)}</td>`;
            return;
          }

          if (i === 1 || i === 2) {
            cellClass += ' cell-numeric col-amount';
            tableHtml += `<td class="${cellClass}">${formatInlineMarkdown(cell)}</td>`;
            return;
          }

          // Columns 3 & 4: Difference in pesos and Percentage Change
          const isIncomeOrNet = rowMetricLabel.includes('income') || rowMetricLabel.includes('kita') || rowMetricLabel.includes('net') || rowMetricLabel.includes('cash flow');
          let diffClass = 'col-diff-neutral';
          if (rawCell.includes('+')) {
            diffClass = isIncomeOrNet ? 'col-diff-pos' : 'col-diff-neg';
          } else if (rawCell.includes('-')) {
            diffClass = isIncomeOrNet ? 'col-diff-neg' : 'col-diff-pos';
          }

          cellClass += ` cell-numeric ${diffClass}`;
          const pill = `<span class="chat-diff-pill ${diffClass}">${formatInlineMarkdown(cell)}</span>`;
          tableHtml += `<td class="${cellClass}">${pill}</td>`;
          return;
        }

        // Standard Table Rendering
        const isDateCell = visibleColTypes[i] === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(rawCell);
        if (isDateCell) cellClass += ' col-date';
        if (visibleColTypes[i] === 'category') cellClass += ' col-category';
        if (visibleColTypes[i] === 'amount' || visibleColIsNumeric[i]) cellClass += ' cell-numeric col-amount';

        let cellContent = formatInlineMarkdown(cell);

        // 1. Description truncation with interactive hover modal (max 20 characters)
        let cellAttrs = '';
        const isDescCol = visibleColTypes[i] === 'desc' || (visibleColTypes[i] === 'general' && i === 1 && rawCell.length > 20);
        if (isDescCol && !isTotalRow) {
          cellClass += ' col-desc';
          const maxChars = 20;
          if (rawCell.length > maxChars) {
            const truncated = rawCell.slice(0, maxChars).trim() + '...';
            cellAttrs = ` data-full-desc="${escapeAttr(rawCell)}"`;
            cellContent = `<span class="chat-desc-truncate" data-full-desc="${escapeAttr(rawCell)}" title="Click or hover to view full description">${escapeHTML(truncated)} <i data-lucide="info" class="chat-desc-info-icon"></i></span>`;
          }
        }

        // 2. Amount coloring: Red for expense, Green for income
        if ((visibleColTypes[i] === 'amount' || visibleColIsNumeric[i]) && !isTotalRow && rowType) {
          cellClass += ` amount-${rowType}`;
          const cleanAmt = rawCell;
          let prefix = '';
          if (rowType === 'income' && !cleanAmt.startsWith('+')) prefix = '+';
          if (rowType === 'expense' && !cleanAmt.startsWith('-')) prefix = '-';
          
          cellContent = `<span class="chat-amount-val ${rowType}">${prefix}${formatInlineMarkdown(cleanAmt.replace(/^[+-]/, ''))}</span>`;
        }

        tableHtml += `<td class="${cellClass}"${cellAttrs}>${cellContent}</td>`;
      });
      tableHtml += `</tr>`;
    });
    tableHtml += `</tbody></table></div>`;

    return tableHtml;
  }

  // ---- Smart chart data aggregation by view dimension ----
  function aggregateByView(transactions, view) {
    let labels = [], values = [], fullLabels = [];
    let chartType = 'bar', chartTitle = '';

    if (view === 'category') {
      // Aggregate amounts by category
      const catMap = {};
      for (const t of transactions) {
        const key = t.category || 'Uncategorized';
        catMap[key] = (catMap[key] || 0) + t.amount;
      }
      const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
      fullLabels = entries.map(e => e[0]);
      labels = fullLabels.map(l => l.length > 22 ? l.slice(0, 22) + '\u2026' : l);
      values = entries.map(e => Math.round(e[1] * 100) / 100);
      chartType = entries.length <= 6 ? 'doughnut' : 'bar';
      chartTitle = 'Breakdown by Category (' + entries.length + ')';
    } else if (view === 'transaction') {
      // Individual transactions by description, sorted by amount desc
      const txns = transactions.slice().sort((a, b) => b.amount - a.amount);
      const limited = txns.length > 15 ? txns.slice(0, 15) : txns;
      for (let i = 0; i < limited.length; i++) {
        const t = limited[i];
        let desc = t.description || t.category || ('Item #' + (i + 1));
        const dupCount = limited.filter(other => (other.description || other.category) === desc).length;
        if (dupCount > 1 && t.date) {
          desc += ' (' + t.date + ')';
        }
        fullLabels.push(desc);
        labels.push(desc.length > 18 ? desc.slice(0, 18) + '\u2026' : desc);
        values.push(t.amount);
      }
      chartType = 'bar';
      const suffix = txns.length > 15 ? ' of ' + txns.length : '';
      chartTitle = 'Transaction Amounts (' + limited.length + suffix + ')';
    } else if (view === 'date') {
      // Aggregate amounts by date
      const dateMap = {};
      for (const t of transactions) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
          dateMap[t.date] = (dateMap[t.date] || 0) + t.amount;
        }
      }
      const sortedDates = Object.keys(dateMap).sort();
      fullLabels = sortedDates.slice();
      labels = sortedDates.slice();
      values = sortedDates.map(d => Math.round(dateMap[d] * 100) / 100);
      chartType = sortedDates.length > 5 ? 'line' : 'bar';
      chartTitle = 'Spending by Date (' + sortedDates.length + ' day' + (sortedDates.length !== 1 ? 's' : '') + ')';
    }

    return { labels, values, fullLabels, chartType, chartTitle };
  }

  // ---- Dedicated Comparison Chart: Monthly Income vs. Expenses ----
  function generateComparisonChart(headers, rows) {
    const cleanHeaders = headers.map(h => (h || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim());

    const labelA = cleanPeriodName(cleanHeaders[1], 'Period A');
    const labelB = cleanPeriodName(cleanHeaders[2], 'Period B');
    const chartLabels = [labelA, labelB];

    let incomeA = 0, incomeB = 0;
    let expensesA = 0, expensesB = 0;

    for (const row of rows) {
      const metric = (row[0] || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim().toLowerCase();
      const isRatio = metric.includes('ratio') || metric.includes('bahagdan') || metric.includes('rate');
      if (!isRatio && (metric.includes('income') || metric.includes('kita'))) {
        incomeA = parseCurrency(row[1] || '0');
        incomeB = parseCurrency(row[2] || '0');
      } else if (!isRatio && (metric.includes('expense') || metric.includes('gastos'))) {
        expensesA = parseCurrency(row[1] || '0');
        expensesB = parseCurrency(row[2] || '0');
      }
    }

    const incomeValues = [incomeA, incomeB];
    const expenseValues = [expensesA, expensesB];
    const chartTitle = 'Monthly Income vs. Expenses';

    return `
<div class="chat-chart-card" 
     data-chart-type="bar" 
     data-chart-is-comparison="true" 
     data-chart-title="${escapeAttr(chartTitle)}" 
     data-chart-labels='${escapeAttr(JSON.stringify(chartLabels))}' 
     data-chart-comp-income='${escapeAttr(JSON.stringify(incomeValues))}' 
     data-chart-comp-expenses='${escapeAttr(JSON.stringify(expenseValues))}'>
  <div class="chat-chart-header">
    <div class="chat-chart-title">
      <i data-lucide="bar-chart-3"></i>
      <span>${escapeHTML(chartTitle)}</span>
    </div>
    <span class="chat-chart-badge comparison">Comparison</span>
  </div>
  <div class="chat-chart-canvas-wrap">
    <canvas class="chat-chart-canvas"></canvas>
  </div>
</div>`;
  }

  // ---- Dynamic Chart Generation Based on Data Context ----
  function generateChartForData(headers, rows) {
    // Strictly respect graph preference toggle — do not render ANY chart if graph is OFF
    if (!formatPrefs.graph || !headers || !rows || rows.length < 2) return '';

    // Comparison tables generate visual comparison bar chart when graph toggle is ON
    if (isComparisonTable(headers, rows)) {
      return generateComparisonChart(headers, rows);
    }

    const cleanHeaders = headers.map(h => (h || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim().toLowerCase());

    // Find key columns
    const catColIdx = cleanHeaders.findIndex(h => h.includes('category') || h.includes('kategorya') || h.includes('source') || h.includes('pinagmulan'));
    const dateColIdx = cleanHeaders.findIndex(h => h.includes('date') || h.includes('petsa'));
    const amountColIdx = cleanHeaders.findIndex(h => h.includes('amount') || h.includes('halaga') || h.includes('presyo'));

    if (amountColIdx === -1) return '';

    // Find description column (exclude already-matched columns and numeric/count columns)
    let descColIdx = -1;
    for (let ci = 0; ci < cleanHeaders.length; ci++) {
      if (ci === catColIdx || ci === dateColIdx || ci === amountColIdx) continue;
      const h = cleanHeaders[ci];
      if (h.includes('desc') || h.includes('detail') || h.includes('particular') || h.includes('item') || h.includes('transaksyon') || h.includes('paglalarawan')) {
        descColIdx = ci;
        break;
      }
    }
    // Only fall back to another text column if it is not count, percentage, average, total, or user
    if (descColIdx === -1) {
      for (let ci = 0; ci < cleanHeaders.length; ci++) {
        if (ci === catColIdx || ci === dateColIdx || ci === amountColIdx) continue;
        const h = cleanHeaders[ci];
        const isNumericHeader = h.includes('count') || h.includes('bilang') || h.includes('percent') || 
                                h.includes('bahagdan') || h.includes('avg') || h.includes('average') || 
                                h.includes('rate') || h.includes('total') || h.includes('kabuuan') ||
                                h.includes('record') || h.includes('by') || h.includes('type') || h.includes('user');
        if (!isNumericHeader) {
          descColIdx = ci;
          break;
        }
      }
    }

    // Extract raw transaction data for all possible views
    const transactions = [];
    for (const row of rows) {
      const rawCat = catColIdx !== -1 ? (row[catColIdx] || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim() : '';
      const rawDesc = descColIdx !== -1 ? (row[descColIdx] || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim() : '';
      const rawDate = dateColIdx !== -1 ? (row[dateColIdx] || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim() : '';
      const amt = parseCurrency(row[amountColIdx] || '');

      const checkStr = (rawCat + ' ' + rawDesc + ' ' + (row[0] || '')).toLowerCase();
      const isTotalRow = checkStr.includes('total') || checkStr.includes('kabuuan');

      if (amt > 0 && !isTotalRow) {
        transactions.push({ category: rawCat, description: rawDesc, date: rawDate, amount: amt });
      }
    }

    if (transactions.length < 2) return '';

    // Determine which views are available and meaningful
    const availableViews = [];

    const uniqueCats = new Set(transactions.map(t => t.category).filter(Boolean));
    if (catColIdx !== -1 && uniqueCats.size >= 2) {
      availableViews.push('category');
    }

    const uniqueDescs = new Set(transactions.map(t => t.description).filter(Boolean));
    // Transaction/item view is available when descriptions exist and are distinct (no arbitrary 30-item limit!)
    if (descColIdx !== -1 && uniqueDescs.size >= 2) {
      availableViews.push('transaction');
    }

    const validDates = transactions.filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date));
    const uniqueDates = new Set(validDates.map(t => t.date));
    if (dateColIdx !== -1 && uniqueDates.size >= 2) {
      availableViews.push('date');
    }

    // Fallback: If still empty but we have >= 2 transactions
    if (availableViews.length === 0 && transactions.length >= 2) {
      if (uniqueDescs.size >= 2) {
        availableViews.push('transaction');
      } else if (uniqueDates.size >= 2) {
        availableViews.push('date');
      } else if (uniqueCats.size >= 2) {
        availableViews.push('category');
      }
    }

    if (availableViews.length === 0) return '';

    // Smart default: category if diverse (>= 2 categories), else transaction (items), else date
    let defaultView;
    if (availableViews.includes('category')) {
      defaultView = 'category';
    } else if (availableViews.includes('transaction')) {
      defaultView = 'transaction';
    } else {
      defaultView = availableViews[0];
    }

    const { labels, values, fullLabels, chartType, chartTitle } = aggregateByView(transactions, defaultView);

    if (labels.length < 2) return '';

    // View switcher buttons (only when multiple views are possible)
    let viewSwitcherHtml = '';
    if (availableViews.length > 1) {
      const viewLabels = { category: 'By Category', transaction: 'By Item', date: 'By Date' };
      const viewIcons = { category: 'folder', transaction: 'file-text', date: 'calendar' };
      viewSwitcherHtml = '<div class="chat-chart-view-switcher">';
      for (const view of availableViews) {
        const isActive = view === defaultView ? ' active' : '';
        viewSwitcherHtml += '<button class="chat-chart-view-btn' + isActive + '" data-view="' + view + '"><i data-lucide="' + viewIcons[view] + '"></i><span>' + viewLabels[view] + '</span></button>';
      }
      viewSwitcherHtml += '</div>';
    }

    const iconName = (chartType === 'doughnut' || chartType === 'pie') ? 'pie-chart' : chartType === 'line' ? 'trending-up' : 'bar-chart-3';
    const badgeLabel = chartType === 'doughnut' ? 'Pie Breakdown' : chartType === 'line' ? 'Line Trend' : 'Bar Chart';

    return `
<div class="chat-chart-card" data-chart-type="${chartType}" data-chart-title="${escapeAttr(chartTitle)}" data-chart-labels='${escapeAttr(JSON.stringify(labels))}' data-chart-values='${escapeAttr(JSON.stringify(values))}' data-chart-full-labels='${escapeAttr(JSON.stringify(fullLabels))}' data-chart-transactions='${escapeAttr(JSON.stringify(transactions))}' data-available-views='${escapeAttr(JSON.stringify(availableViews))}' data-current-view="${defaultView}">
  <div class="chat-chart-header">
    <div class="chat-chart-title">
      <i data-lucide="${iconName}"></i>
      <span>${escapeHTML(chartTitle)}</span>
    </div>
    <span class="chat-chart-badge">${badgeLabel}</span>
  </div>
  ${viewSwitcherHtml}
  <div class="chat-chart-canvas-wrap">
    <canvas class="chat-chart-canvas"></canvas>
  </div>
</div>`;
  }

  // Fallback list view when table toggle is OFF
  function renderTableAsList(headers, rows) {
    if (!rows || rows.length === 0) return '';
    const cleanHeaders = headers.map(h => (h || '').replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim().toLowerCase());
    const typeColIdx = cleanHeaders.findIndex(h => h.includes('type') || h.includes('uri'));

    let html = '<div class="chat-table-list-view">';
    rows.forEach(row => {
      html += '<div class="chat-table-list-item">';
      row.forEach((cell, idx) => {
        if (idx === typeColIdx) return; // Omit type column
        const header = headers[idx] || `Item ${idx + 1}`;
        html += `<div class="chat-table-list-field"><span class="chat-table-list-label">${escapeHTML(header)}:</span> <span class="chat-table-list-val">${formatInlineMarkdown(cell)}</span></div>`;
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // Dynamic chart generation from bulleted / numbered list items
  function generateChartForList(items) {
    if (!formatPrefs.graph || !items || items.length < 2) return '';

    const chartLabels = [];
    const chartValues = [];

    for (const item of items) {
      const raw = item.replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim();
      // Match patterns like "Food & Beverages: ₱1,980.00" or "Supplies — ₱396.00"
      const match = raw.match(/^(.*?)\s*[:—–-]\s*[+]?[-]?₱?([\d,]+(\.\d+)?)/);
      if (match) {
        const label = match[1].trim();
        const val = parseCurrency(match[2]);
        if (label && !label.toLowerCase().includes('total') && !label.toLowerCase().includes('kabuuan') && val > 0) {
          chartLabels.push(label.length > 22 ? label.slice(0, 22) + '...' : label);
          chartValues.push(val);
        }
      }
    }

    if (chartLabels.length >= 2) {
      const chartType = chartLabels.length <= 5 ? 'doughnut' : 'bar';
      const chartTitle = 'Expense & Breakdown Visualization';
      const iconName = chartType === 'doughnut' ? 'pie-chart' : 'bar-chart-3';
      const badgeLabel = chartType === 'doughnut' ? 'Pie Breakdown' : 'Bar Comparison';

      return `
<div class="chat-chart-card" data-chart-type="${chartType}" data-chart-title="${escapeAttr(chartTitle)}" data-chart-labels='${escapeAttr(JSON.stringify(chartLabels))}' data-chart-values='${escapeAttr(JSON.stringify(chartValues))}'>
  <div class="chat-chart-header">
    <div class="chat-chart-title">
      <i data-lucide="${iconName}"></i>
      <span>${escapeHTML(chartTitle)} (${chartLabels.length} Items)</span>
    </div>
    <span class="chat-chart-badge">${badgeLabel}</span>
  </div>
  <div class="chat-chart-canvas-wrap">
    <canvas class="chat-chart-canvas"></canvas>
  </div>
</div>`;
    }

    return '';
  }

  function formatResponse(text) {
    if (!text) return '<p class="chat-p">No response.</p>';

    // Step 1: Extract code blocks (suppressing JSON / chart config code blocks)
    const codeBlocks = [];
    let processed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const trimmedCode = code.trim();
      const lowerLang = (lang || '').toLowerCase();
      // Drop JSON chart configs or raw JSON payloads so users never see code blocks in financial chat
      if (
        lowerLang === 'json' ||
        trimmedCode.includes('chartType') ||
        (trimmedCode.startsWith('{') && (trimmedCode.includes('"data"') || trimmedCode.includes('"label"')))
      ) {
        return '';
      }
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push({ lang: lang || 'code', code: code.trimEnd() });
      return `\n\n${id}\n\n`;
    });

    // Step 2: Line by line processing
    const lines = processed.split('\n');
    const blocks = [];
    let inTable = false;
    let tableHeaders = [];
    let tableRows = [];
    let inList = false;
    let listType = 'ul';
    let listItems = [];
    let inBlockquote = false;
    let blockquoteLines = [];
    let hasGeneratedChart = false;

    function flushList() {
      if (inList && listItems.length > 0) {
        // If graph is ON, attempt to extract charts from list items if no chart has been generated yet
        if (formatPrefs.graph && !hasGeneratedChart) {
          const listChartHtml = generateChartForList(listItems);
          if (listChartHtml) {
            blocks.push(listChartHtml);
            hasGeneratedChart = true;
          }
        }

        if (!formatPrefs.list) {
          // List toggle OFF -> combine into fluent paragraph text
          blocks.push(`<p class="chat-p">${listItems.map(item => formatInlineMarkdown(item)).join('; ')}.</p>`);
        } else {
          const tag = listType === 'ol' ? 'ol' : 'ul';
          blocks.push(`<${tag} class="chat-list chat-${tag}">${listItems.map(item => `<li class="chat-list-item">${formatInlineMarkdown(item)}</li>`).join('')}</${tag}>`);
        }
        listItems = [];
        inList = false;
      }
    }

    function flushBlockquote() {
      if (inBlockquote && blockquoteLines.length > 0) {
        blocks.push(`<blockquote class="chat-blockquote">${blockquoteLines.map(line => `<p class="chat-p">${formatInlineMarkdown(line)}</p>`).join('')}</blockquote>`);
        blockquoteLines = [];
        inBlockquote = false;
      }
    }

    function flushTable() {
      if (inTable && tableHeaders.length > 0) {
        const compOverview = formatPrefs.table ? renderPeriodComparisonOverview(tableHeaders, tableRows) : null;
        if (compOverview) {
          // Render side-by-side period overview cards directly without generating a duplicate chart
          blocks.push(compOverview);
        } else {
          // 1. Generate chart strictly ONLY if graph toggle is ON (at most once per response)
          let chartHtml = '';
          if (!hasGeneratedChart && formatPrefs.graph) {
            chartHtml = generateChartForData(tableHeaders, tableRows);
            if (chartHtml) hasGeneratedChart = true;
          }

          // 2. Render table (or list fallback if table toggle is OFF)
          if (!formatPrefs.table) {
            const listHtml = renderTableAsList(tableHeaders, tableRows);
            blocks.push(chartHtml + listHtml);
          } else {
            const summaryBox = renderSummaryBox(tableHeaders, tableRows);
            if (summaryBox) {
              blocks.push(chartHtml + summaryBox);
            } else {
              blocks.push(chartHtml + renderDataTable(tableHeaders, tableRows));
            }
          }
        }

        tableHeaders = [];
        tableRows = [];
        inTable = false;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Empty line
      if (!trimmed) {
        flushList();
        flushBlockquote();
        flushTable();
        continue;
      }

      // Code block placeholder
      if (trimmed.startsWith('__CODE_BLOCK_') && trimmed.endsWith('__')) {
        flushList();
        flushBlockquote();
        flushTable();
        blocks.push(trimmed);
        continue;
      }

      // Dividers: ---, ***, ___
      if (/^[-*_]{3,}$/.test(trimmed)) {
        flushList();
        flushBlockquote();
        flushTable();
        blocks.push('<hr class="chat-divider">');
        continue;
      }

      // Headings
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushList();
        flushBlockquote();
        flushTable();
        const level = headingMatch[1].length;
        const headingContent = formatInlineMarkdown(headingMatch[2]);
        const tag = level === 1 ? 'h2' : level === 2 ? 'h3' : level === 3 ? 'h4' : 'h5';
        const headingClass = `chat-heading chat-h${level}`;
        blocks.push(`<${tag} class="${headingClass}">${headingContent}</${tag}>`);
        continue;
      }

      // Blockquote: > text
      if (trimmed.startsWith('>')) {
        flushList();
        flushTable();
        inBlockquote = true;
        const quoteText = trimmed.replace(/^>\s?/, '');
        blockquoteLines.push(quoteText);
        continue;
      } else if (inBlockquote) {
        flushBlockquote();
      }

      // Table row: | cell | cell |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        flushList();
        flushBlockquote();
        const rawCells = trimmed.split('|');
        rawCells.shift();
        rawCells.pop();
        const cells = rawCells.map(c => c.trim());

        // Separator row: |---|---|
        if (cells.every(c => /^[-: ]+$/.test(c))) {
          continue;
        }

        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        continue;
      } else if (inTable) {
        flushTable();
      }

      // Nested or regular lists
      const ulMatch = trimmed.match(/^([\*\-\+•‣])\s+(.*)$/);
      const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

      if (ulMatch) {
        flushBlockquote();
        flushTable();
        if (!inList || listType !== 'ul') {
          flushList();
          inList = true;
          listType = 'ul';
        }
        const isSubitem = /^\s{2,}/.test(rawLine);
        const itemContent = isSubitem ? `<span style="padding-left: 1.2rem; display: block;">${ulMatch[2]}</span>` : ulMatch[2];
        listItems.push(itemContent);
        continue;
      } else if (olMatch) {
        flushBlockquote();
        flushTable();
        if (!inList || listType !== 'ol') {
          flushList();
          inList = true;
          listType = 'ol';
        }
        listItems.push(olMatch[2]);
        continue;
      } else if (inList) {
        flushList();
      }

      // Regular Paragraph
      blocks.push(`<p class="chat-p">${formatInlineMarkdown(trimmed)}</p>`);
    }

    flushList();
    flushBlockquote();
    flushTable();

    // If graph toggle is ON but no graph could be generated (single scalar metric, empty data, or non-comparative text)
    if (formatPrefs.graph && !hasGeneratedChart) {
      const lowerText = text.toLowerCase();
      const alreadyExplains = lowerText.includes('graph') && (
        lowerText.includes('not available') || 
        lowerText.includes('could not') || 
        lowerText.includes('cannot be') || 
        lowerText.includes('no graph') ||
        lowerText.includes('walang graph')
      );
      if (!alreadyExplains) {
        blocks.push(`
<div class="chat-no-graph-notice">
  <i data-lucide="info"></i>
  <span><strong>Graph Not Available:</strong> A visual chart could not be generated for this inquiry because the response contains only a single metric, summary figure, or non-comparative details without multiple categories or time-series points to plot.</span>
</div>`);
      }
    }

    // Re-insert code blocks
    let finalHtml = blocks.join('\n');
    codeBlocks.forEach((cb, idx) => {
      const placeholder = `__CODE_BLOCK_${idx}__`;
      const escapedCode = escapeHTML(cb.code);
      const codeBlockHtml = `<div class="chat-code-block">
        <div class="chat-code-header">
          <span class="chat-code-lang">${escapeHTML(cb.lang || 'code')}</span>
          <button class="chat-code-copy-btn"><i data-lucide="copy"></i><span>Copy code</span></button>
        </div>
        <pre class="chat-code-pre"><code>${escapedCode}</code></pre>
      </div>`;
      finalHtml = finalHtml.replace(placeholder, codeBlockHtml);
    });

    return finalHtml;
  }

  // ==========================================================
  //  CHART.JS VISUALIZATION & POST-PROCESSING
  // ==========================================================
  function createChartInstance(card) {
    const canvas = card.querySelector('canvas.chat-chart-canvas');
    if (!canvas) return null;

    if (canvas._chartInstance) {
      canvas._chartInstance.destroy();
      canvas._chartInstance = null;
    }

    try {
      const isCompChart = card.getAttribute('data-chart-is-comparison') === 'true';
      const labels = JSON.parse(card.getAttribute('data-chart-labels') || '[]');
      const values = JSON.parse(card.getAttribute('data-chart-values') || '[]');
      const fullLabels = JSON.parse(card.getAttribute('data-chart-full-labels') || '[]');
      const chartType = card.getAttribute('data-chart-type') || 'doughnut';

      if (!isCompChart && (!labels.length || !values.length)) return null;
      if (isCompChart && !labels.length) return null;

      // PondoSync luxury palette
      const palette = [
        '#d3ac77', '#34C759', '#5AC8FA', '#FF9F0A',
        '#AF52DE', '#FF3B5C', '#FFD60A', '#64D2FF'
      ];

      const isPieOrDoughnut = chartType === 'doughnut' || chartType === 'pie';
      const isLine = chartType === 'line';
      const isBar = chartType === 'bar';

      let datasetsConfig = [];
      let scalesConfig = undefined;
      let legendConfig = { display: false };

      if (isCompChart) {
        const incomeValues = JSON.parse(card.getAttribute('data-chart-comp-income') || '[]');
        const expenseValues = JSON.parse(card.getAttribute('data-chart-comp-expenses') || '[]');

        legendConfig = {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#a6a096',
            font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            useBorderRadius: true,
            padding: 12
          }
        };

        scalesConfig = {
          x: {
            grid: { display: false },
            ticks: {
              color: '#d3ac77',
              font: { family: "'Inter', sans-serif", size: 11, weight: '600' }
            }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#a6a096',
              font: { family: "'Inter', sans-serif", size: 10 },
              callback: function (v) { return '₱' + Number(v).toLocaleString('en-PH'); }
            }
          }
        };

        datasetsConfig = [
          {
            label: 'Total Income',
            data: incomeValues,
            backgroundColor: 'rgba(52, 199, 89, 0.85)',
            borderColor: '#34C759',
            borderWidth: 1.5,
            borderRadius: 6,
            maxBarThickness: 45
          },
          {
            label: 'Total Expenses',
            data: expenseValues,
            backgroundColor: 'rgba(255, 59, 92, 0.85)',
            borderColor: '#FF3B5C',
            borderWidth: 1.5,
            borderRadius: 6,
            maxBarThickness: 45
          }
        ];
      } else if (isPieOrDoughnut) {
        legendConfig = {
          display: true,
          position: 'right',
          labels: {
            color: '#a6a096',
            font: { family: "'Inter', sans-serif", size: 11 },
            boxWidth: 12,
            padding: 8
          }
        };
        datasetsConfig = [{
          data: values,
          backgroundColor: labels.map((_, i) => palette[i % palette.length]),
          borderColor: 'rgba(22, 18, 14, 0.9)',
          borderWidth: 2,
          hoverOffset: 6
        }];
      } else if (isLine) {
        scalesConfig = {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#a6a096', font: { family: "'Inter', sans-serif", size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#a6a096',
              font: { family: "'Inter', sans-serif", size: 10 },
              callback: function (v) { return '₱' + Number(v).toLocaleString('en-PH'); }
            }
          }
        };
        datasetsConfig = [{
          label: 'Amount (₱)',
          data: values,
          borderColor: '#d3ac77',
          backgroundColor: 'rgba(211, 172, 119, 0.15)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#d3ac77',
          pointBorderColor: '#120f0c',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }];
      } else if (isBar) {
        scalesConfig = {
          x: {
            grid: { display: false },
            ticks: {
              color: '#a6a096',
              font: { family: "'Inter', sans-serif", size: 10 },
              maxRotation: 45,
              minRotation: 0
            }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#a6a096',
              font: { family: "'Inter', sans-serif", size: 10 },
              callback: function (v) { return '₱' + Number(v).toLocaleString('en-PH'); }
            }
          }
        };
        datasetsConfig = [{
          label: 'Amount (₱)',
          data: values,
          backgroundColor: labels.map((_, i) => palette[i % palette.length]),
          borderColor: 'rgba(212, 175, 55, 0.4)',
          borderWidth: 1,
          borderRadius: 6
        }];
      }

      // Closure for full labels tooltip (show un-truncated text on hover)
      const closureFullLabels = fullLabels.length ? fullLabels : labels;

      const chartInstance = new Chart(canvas, {
        type: chartType,
        data: {
          labels: labels,
          datasets: datasetsConfig
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: chartType === 'pie' ? 0 : (chartType === 'doughnut' ? '65%' : undefined),
          plugins: {
            legend: legendConfig,
            tooltip: {
              backgroundColor: 'rgba(22, 18, 14, 0.95)',
              titleColor: '#f2dab2',
              bodyColor: '#faf7f3',
              borderColor: 'rgba(212, 175, 55, 0.3)',
              borderWidth: 1,
              padding: 10,
              boxPadding: 4,
              callbacks: {
                title: function (tooltipItems) {
                  // Show full un-truncated label on hover
                  const idx = tooltipItems[0].dataIndex;
                  return closureFullLabels[idx] || tooltipItems[0].label || '';
                },
                label: function (context) {
                  const val = context.raw || 0;
                  const formatted = '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  if (isCompChart) {
                    return ' ' + context.dataset.label + ': ' + formatted;
                  }
                  if (isPieOrDoughnut) {
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                    return ' ' + formatted + ' (' + pct + '%)';
                  }
                  return ' ' + formatted;
                }
              }
            }
          },
          scales: scalesConfig,
          layout: {
            padding: 4
          }
        }
      });

      canvas._chartInstance = chartInstance;
      return chartInstance;
    } catch (e) {
      console.warn('[Chatbot] Failed to initialize chart in chat:', e);
      return null;
    }
  }

  function initializeChartsInContainer(container) {
    if (!container || typeof Chart === 'undefined') return;

    const chartCards = container.querySelectorAll('.chat-chart-card:not([data-chart-rendered="true"])');
    chartCards.forEach(card => {
      card.setAttribute('data-chart-rendered', 'true');
      createChartInstance(card);

      // Attach view switcher click handlers
      const viewBtns = card.querySelectorAll('.chat-chart-view-btn');
      viewBtns.forEach(btn => {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          const view = this.getAttribute('data-view');
          if (view && view !== card.getAttribute('data-current-view')) {
            rebuildChart(card, view);
          }
        });
      });
    });
  }

  // ---- Rebuild chart when user switches view dimension ----
  function rebuildChart(card, view) {
    try {
      const transactions = JSON.parse(card.getAttribute('data-chart-transactions') || '[]');
      if (!transactions.length) return;

      const { labels, values, fullLabels, chartType, chartTitle } = aggregateByView(transactions, view);
      if (labels.length < 2) return;

      // Update card data attributes
      card.setAttribute('data-chart-type', chartType);
      card.setAttribute('data-chart-title', chartTitle);
      card.setAttribute('data-chart-labels', JSON.stringify(labels));
      card.setAttribute('data-chart-values', JSON.stringify(values));
      card.setAttribute('data-chart-full-labels', JSON.stringify(fullLabels));
      card.setAttribute('data-current-view', view);

      // Update header text and badge
      const titleSpan = card.querySelector('.chat-chart-title span');
      const badge = card.querySelector('.chat-chart-badge');
      const titleIcon = card.querySelector('.chat-chart-title i, .chat-chart-title svg');
      if (titleSpan) titleSpan.textContent = chartTitle;

      const iconName = (chartType === 'doughnut' || chartType === 'pie') ? 'pie-chart' : chartType === 'line' ? 'trending-up' : 'bar-chart-3';
      const badgeLabel = chartType === 'doughnut' ? 'Pie Breakdown' : chartType === 'line' ? 'Line Trend' : 'Bar Chart';
      if (badge) badge.textContent = badgeLabel;
      if (titleIcon) {
        const newIcon = document.createElement('i');
        newIcon.setAttribute('data-lucide', iconName);
        titleIcon.parentNode.replaceChild(newIcon, titleIcon);
      }

      // Update active view button
      card.querySelectorAll('.chat-chart-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === view);
      });

      // Destroy existing chart and recreate
      createChartInstance(card);

      // Re-render Lucide icons
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
      console.warn('[Chatbot] Failed to rebuild chart:', e);
    }
  }

  function postProcessChatMessage(container) {
    if (!container) return;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    initializeChartsInContainer(container);
  }

  // ==========================================================
  //  UTILITIES
  // ==========================================================
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Expose globally for app.js
  window.initChatbot = initChatbot;

})();
