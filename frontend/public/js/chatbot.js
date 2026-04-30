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

  // ---- Context-Aware Follow-Up Map ----
  const followUpMap = {
    balance:     ['Expenses this month', 'Income this month', 'Monthly report'],
    expense:     ['Expenses by category', 'Top expenses', 'Who spent the most'],
    income:      ['Income sources', 'Total income', 'Monthly report'],
    category:    ['Top expenses', 'Total expenses', 'Latest transactions'],
    table:       ['Expenses by category', 'Total balance', 'Monthly report'],
    report:      ['Expenses by category', 'Income sources', 'Latest transactions'],
    help:        ['Total balance', 'Expenses this month', 'Top expenses'],
    suggestions: ['Total balance', 'Expenses this month', 'Top expenses'],
    text:        ['Total balance', 'Expenses this month', 'Help']
  };

  // ==========================================================
  //  INITIALIZATION
  // ==========================================================
  function initChatbot() {
    // ---- Full-page chatbot ----
    bindInput('ai-input-field-empty', 'ai-send-empty');
    bindInput('ai-input-field-active', 'ai-send-active');

    // Suggestion chips (empty state grid + followup chips)
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-suggest-chip, .ai-followup-chip');
      if (!chip) return;
      const query = chip.dataset.query;
      if (query) handleFullPageSend(query);
    });

    // ---- Floating Widget ----
    initWidget();

    // ---- Track current page for FAB visibility ----
    observePageChanges();
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
      if (e.key === 'Enter') {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg) { input.value = ''; handleFullPageSend(msg); }
      }
    });
  }

  // ==========================================================
  //  FULL-PAGE CHAT LOGIC
  // ==========================================================
  function handleFullPageSend(message) {
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
    sendToAPI(message).then(result => {
      typingEl.remove();

      if (result) {
        addAIMessage(result.response, result.type, result.suggestions);
      } else {
        addAIMessage('⚠️ The server appears to be waking up (free-tier cold start). Please wait a moment and try again.', 'text');
      }
      scrollMessages();

      // Focus the active input
      const activeInput = document.getElementById('ai-input-field-active');
      if (activeInput) activeInput.focus();
    });
  }

  function addUserMessage(text) {
    const container = document.getElementById('ai-messages-scroll');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'ai-msg-row user';
    row.innerHTML = `<div class="ai-msg-user-bubble">${escapeHTML(text)}</div>`;
    container.appendChild(row);
  }

  function addAIMessage(responseText, type, serverSuggestions) {
    const container = document.getElementById('ai-messages-scroll');
    if (!container) return;

    const formatted = formatResponse(responseText);

    // Determine follow-up suggestions
    const suggestions = serverSuggestions ||
      followUpMap[type] ||
      followUpMap['text'];

    const suggestionsHTML = suggestions.map(s =>
      `<button class="ai-followup-chip" data-query="${escapeAttr(s)}">${escapeHTML(s)}</button>`
    ).join('');

    const row = document.createElement('div');
    row.className = 'ai-msg-row ai';
    row.innerHTML = `
      <div class="ai-msg-ai-content">
        <div class="ai-msg-avatar"><i data-lucide="sparkles"></i></div>
        <div class="ai-msg-body">
          ${formatted}
          <div class="ai-followup-suggestions">
            ${suggestionsHTML}
          </div>
        </div>
      </div>
    `;
    container.appendChild(row);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function addTypingIndicator() {
    const container = document.getElementById('ai-messages-scroll');
    const row = document.createElement('div');
    row.className = 'ai-typing-row';
    row.innerHTML = `
      <div class="ai-typing-indicator">
        <div class="ai-msg-avatar"><i data-lucide="sparkles"></i></div>
        <div class="ai-typing-dots">
          <span></span><span></span><span></span>
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

    // Toggle widget
    fab.addEventListener('click', () => {
      const isOpen = !widget.classList.contains('hidden');
      if (isOpen) {
        widget.classList.add('hidden');
      } else {
        widget.classList.remove('hidden');
        if (input) input.focus();
      }
    });

    // Close widget
    if (closeBtn) {
      closeBtn.addEventListener('click', () => widget.classList.add('hidden'));
    }

    // Expand to full chatbot page
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        widget.classList.add('hidden');
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
  }

  function handleWidgetSend(message) {
    const messagesEl = document.getElementById('chat-widget-messages');
    if (!messagesEl) return;

    // User bubble
    const userMsg = document.createElement('div');
    userMsg.className = 'widget-msg user';
    userMsg.textContent = message;
    messagesEl.appendChild(userMsg);

    // Typing
    const typing = document.createElement('div');
    typing.className = 'widget-msg ai';
    typing.innerHTML = '<p>...</p>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    sendToAPI(message).then(result => {
      typing.remove();
      const aiMsg = document.createElement('div');
      aiMsg.className = 'widget-msg ai';
      aiMsg.innerHTML = result
        ? formatResponse(result.response)
        : '<p>Error processing request.</p>';
      messagesEl.appendChild(aiMsg);
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
        if (widget) widget.classList.add('hidden');
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
  async function sendToAPI(message) {
    try {
      const data = await apiPost('/chatbot/query', { message });
      if (data && data.success) {
        return data.data;
      }
      return null;
    } catch (err) {
      console.error('[Chatbot] API Error:', err);
      return null;
    }
  }

  // ==========================================================
  //  RESPONSE FORMATTING
  // ==========================================================
  function formatResponse(text) {
    if (!text) return '<p>No response.</p>';

    let html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
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
