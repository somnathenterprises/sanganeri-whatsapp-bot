const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let activeChat = null;
let pollTimer = null;

// ---------- Service worker (for "Add to Home Screen") ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ---------- Auth ----------
function getPassword() {
  return localStorage.getItem('wa_admin_password') || '';
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': getPassword(),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('wa_admin_password');
    showLogin('Session expired. Please log in again.');
    throw new Error('Unauthorized');
  }
  return res.json();
}

function showLogin(error) {
  $('#view-login').style.display = 'flex';
  $('#view-app').style.display = 'none';
  if (error) {
    $('#login-error').textContent = error;
    $('#login-error').style.display = 'block';
  }
}

async function tryLogin(password) {
  localStorage.setItem('wa_admin_password', password);
  try {
    await api('/settings');
    $('#view-login').style.display = 'none';
    $('#view-app').style.display = 'block';
    init();
  } catch (e) {
    showLogin('Incorrect password. Try again.');
  }
}

$('#btn-login').addEventListener('click', () => {
  const pw = $('#password').value.trim();
  if (!pw) return;
  tryLogin(pw);
});
$('#password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-login').click();
});

$('#btn-logout').addEventListener('click', () => {
  localStorage.removeItem('wa_admin_password');
  if (pollTimer) clearInterval(pollTimer);
  showLogin();
});

// ---------- Tabs ----------
$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.view').forEach((v) => v.classList.remove('active'));
  `#view-${tab}` && $(`#view-${tab}`) && $(`#view-${tab}`).classList.add('active');
  if (tab === 'conversations') loadConversations();
  if (tab === 'settings') loadSettings();
  if (tab === 'verifications') loadVerifications();
}

// ---------- Conversations ----------
async function loadConversations() {
  const list = await api('/conversations');
  const container = $('#conv-list');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">&#128172;</div>No conversations yet. Messages from customers will appear here.</div>`;
    return;
  }
  container.innerHTML = list
    .map((c) => {
      const last = c.lastMessage;
      const preview = last ? (last.content || '').slice(0, 60) : '';
      const time = c.updatedAt ? new Date(c.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="conv-item" data-phone="${c.phone}">
        <div>
          <div class="phone">+${c.phone}</div>
          <div class="preview">${escapeHtml(preview)}</div>
        </div>
        <div class="time">${time}</div>
      </div>`;
    })
    .join('');

  $$('.conv-item').forEach((el) => {
    el.addEventListener('click', () => openChat(el.dataset.phone));
  });
}

async function openChat(phone) {
  activeChat = phone;
  $$('.tab-btn').forEach((b) => b.classList.remove('active'));
  $$('.view').forEach((v) => v.classList.remove('active'));
  $('#view-chat').classList.add('active');
  $('#chat-title').textContent = `+${phone}`;
  await refreshChat();
}

async function refreshChat() {
  if (!activeChat) return;
  const data = await api(`/conversations/${activeChat}`);
  const container = $('#chat-messages');
  container.innerHTML = (data.messages || [])
    .map((m) => {
      const isUser = m.role === 'user';
      const time = new Date(m.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
      const typeLabel = m.type ? ` <span class="msg-type">${m.type.replace(/_/g,' ')}</span>` : '';
      return `<div class="msg ${isUser ? 'user' : 'assistant'}">
        <div class="bubble">${escapeHtml(m.content || '')}</div>
        <div class="meta">${time}${typeLabel}${m.ai ? ' · AI' : ''}${m.manual ? ' · Manual' : ''}</div>
      </div>`;
    })
    .join('');
  container.scrollTop = container.scrollHeight;
}

$('#btn-back-chat').addEventListener('click', () => {
  activeChat = null;
  switchTab('conversations');
});

$('#btn-send-reply').addEventListener('click', async () => {
  const msg = $('#chat-reply').value.trim();
  if (!msg || !activeChat) return;
  $('#btn-send-reply').disabled = true;
  try {
    await api('/send-text', {
      method: 'POST',
      body: JSON.stringify({ to: activeChat, message: msg }),
    });
    $('#chat-reply').value = '';
    const status = $('#reply-status');
    status.textContent = 'Sent!';
    status.style.display = 'block';
    setTimeout(() => (status.style.display = 'none'), 3000);
    await refreshChat();
  } catch (e) {
    alert('Failed to send: ' + e.message);
  }
  $('#btn-send-reply').disabled = false;
});

// ---------- COD Verifications ----------
window.loadVerifications = async function(statusFilter) {
  const container = $('#verif-list');
  container.innerHTML = '<div class="hint">Loading...</div>';
  try {
    const path = statusFilter ? `/verifications?status=${statusFilter}` : '/verifications';
    const list = await api(path);
    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">&#128276;</div>No verifications found.</div>';
      return;
    }
    container.innerHTML = list.map((v) => {
      const statusEmoji = v.status === 'confirmed' ? '✅' : v.status === 'cancelled' ? '❌' : '⏳';
      const statusColor = v.status === 'confirmed' ? '#2e7d32' : v.status === 'cancelled' ? '#c62828' : '#e65100';
      const time = new Date(v.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div class="conv-item" style="flex-direction:column;align-items:flex-start;gap:6px;">
        <div style="display:flex;justify-content:space-between;width:100%;">
          <strong>${v.orderNumber}</strong>
          <span style="color:${statusColor};font-weight:600;">${statusEmoji} ${v.status.toUpperCase()}</span>
        </div>
        <div class="hint">Customer: ${escapeHtml(v.customerName)} · +${v.phone}</div>
        <div class="hint">Items: ${escapeHtml(v.items || '')}</div>
        <div class="hint">Amount: ${v.total} · ${time}</div>
        ${v.status === 'pending' ? `<div style="display:flex;gap:8px;margin-top:4px;">
          <button class="btn small" onclick="adminVerify('${v.orderNumber}','confirmed')">✅ Confirm</button>
          <button class="btn ghost small" onclick="adminVerify('${v.orderNumber}','cancelled')">❌ Cancel</button>
        </div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = '<div class="error">Failed to load verifications.</div>';
  }
};

window.adminVerify = async function(orderNumber, status) {
  try {
    await api(`/verifications/${encodeURIComponent(orderNumber)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    loadVerifications();
  } catch(e) {
    alert('Failed to update: ' + e.message);
  }
};

// ---------- Templates ----------
$('#btn-send-template').addEventListener('click', async () => {
  const recipientsRaw = $('#tpl-recipients').value.trim();
  const templateName = $('#tpl-name').value.trim();
  const languageCode = $('#tpl-lang').value.trim() || 'en_US';
  const varsRaw = $('#tpl-vars').value.trim();

  if (!recipientsRaw || !templateName) {
    alert('Please enter recipients and template name.');
    return;
  }

  const recipients = recipientsRaw.split('\n').map((r) => r.trim()).filter(Boolean);
  const vars = varsRaw ? varsRaw.split(',').map((v) => v.trim()) : [];
  const components = vars.length
    ? [{ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: v })) }]
    : [];

  $('#btn-send-template').disabled = true;
  try {
    const result = await api('/send-template', {
      method: 'POST',
      body: JSON.stringify({ recipients, templateName, languageCode, components }),
    });
    const div = $('#template-result');
    div.innerHTML = (result.results || [])
      .map((r) => `<div class="${r.success ? 'success' : 'error'}">${r.to}: ${r.success ? 'Sent ✓' : r.error}</div>`)
      .join('');
  } catch(e) {
    alert('Error: ' + e.message);
  }
  $('#btn-send-template').disabled = false;
});

// ---------- Settings ----------
async function loadSettings() {
  const s = await api('/settings');
  $('#toggle-ai').checked = !!s.aiAutoReplyEnabled;

  // Show Shopify webhook URLs
  const base = window.location.origin;
  const urlCreated = $('#url-order-created');
  const urlFulfilled = $('#url-order-fulfilled');
  if (urlCreated) urlCreated.textContent = base + '/shopify/order-created';
  if (urlFulfilled) urlFulfilled.textContent = base + '/shopify/order-fulfilled';
}

$('#toggle-ai').addEventListener('change', async () => {
  await api('/settings', {
    method: 'POST',
    body: JSON.stringify({ aiAutoReplyEnabled: $('#toggle-ai').checked }),
  });
});

// ---------- Init ----------
function init() {
  loadConversations();
  // Poll conversations every 15s
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab === 'conversations') loadConversations();
    if (activeTab === 'verifications') loadVerifications();
  }, 15000);
}

// Auto-login if password already stored
if (getPassword()) tryLogin(getPassword());

// ---------- Helpers ----------
function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
