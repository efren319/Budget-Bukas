// ============================================
// Chatbot.js — Chat UI + API integration
// ============================================

function initChatbot() {
  const input = document.getElementById('chatbot-input');
  const sendBtn = document.getElementById('chatbot-send');

  if (!input || !sendBtn) return;

  // Send on button click
  sendBtn.addEventListener('click', () => sendChatMessage());

  // Send on Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Suggestion pills
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('.suggestion-pill');
    if (!pill) return;
    
    const query = pill.dataset.query;
    if (query) {
      input.value = query;
      sendChatMessage();
    }
  });
}

async function sendChatMessage() {
  const input = document.getElementById('chatbot-input');
  const messagesContainer = document.getElementById('chatbot-messages');

  const message = input.value.trim();
  if (!message) return;

  // Clear input
  input.value = '';

  // Add user message
  addChatBubble(message, 'user');

  // Show typing indicator
  const typingEl = addTypingIndicator();

  // Scroll to bottom
  scrollChatToBottom();

  try {
    const data = await apiPost('/chatbot/query', { message });

    // Remove typing indicator
    typingEl.remove();

    if (data && data.success) {
      const result = data.data;

      // Render bot response
      let bubbleContent = formatBotResponse(result.response);

      // Add suggestions if available
      if (result.suggestions) {
        bubbleContent += renderSuggestions(result.suggestions);
      }

      // Add default suggestions for text responses
      if (result.type === 'text' || result.type === 'balance' || result.type === 'table' || result.type === 'report') {
        bubbleContent += renderSuggestions([
          'Total balance',
          'Expenses this month',
          'Top expenses',
          'Expenses by category'
        ]);
      }

      addChatBubble(bubbleContent, 'bot', true);
    } else {
      addChatBubble('Sorry, I encountered an error processing your question. Please try again.', 'bot');
    }
  } catch (error) {
    typingEl.remove();
    addChatBubble('⚠️ Connection error. Please make sure the server is running.', 'bot');
  }

  scrollChatToBottom();
}

function addChatBubble(content, sender, isHTML = false) {
  const container = document.getElementById('chatbot-messages');
  if (!container) return;

  const icon = sender === 'bot' ? 'bot' : 'user';

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${sender}`;
  msgDiv.innerHTML = `
    <div class="chat-avatar"><i data-lucide="${icon}"></i></div>
    <div class="chat-bubble">
      ${isHTML ? content : `<p>${escapeHTML(content)}</p>`}
    </div>
  `;

  container.appendChild(msgDiv);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function addTypingIndicator() {
  const container = document.getElementById('chatbot-messages');
  const typing = document.createElement('div');
  typing.className = 'chat-message bot';
  typing.innerHTML = `
    <div class="chat-avatar"><i data-lucide="bot"></i></div>
    <div class="chat-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  container.appendChild(typing);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  scrollChatToBottom();
  return typing;
}

function formatBotResponse(text) {
  if (!text) return '<p>No response.</p>';

  // Convert markdown-like formatting to HTML
  let html = text
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}

function renderSuggestions(suggestions) {
  return `
    <div class="chat-suggestions">
      ${suggestions.map(s => `<button class="suggestion-pill" data-query="${escapeAttr(s)}">${escapeHTML(s)}</button>`).join('')}
    </div>
  `;
}

function scrollChatToBottom() {
  const container = document.getElementById('chatbot-messages');
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
