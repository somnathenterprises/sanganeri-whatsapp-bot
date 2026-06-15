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
  $(`#view-${tab}`).classList.add('active');
  if (tab === 'conversations') loadConversations();
  if (tab === 'settings') loadSettings();
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
  const conv = await api(`/conversations/${activeChat}`);
  const container = $('#chat-messages');
  container.innerHTML = conv.messages
    .map((m) => {
      const cls = m.role === 'user' ? 'user' : 'assistant';
      const tag = m.ai ? '<span class="tag">AI auto-reply</span>' : m.manual ? '<span class="tag">Sent by you</span>' : '';
      return `<div class="bubble ${cls}">${escapeHtml(m.content)}${tag}</div>`;
    })
    .join('');
}

$('#btn-back-chat').addEventListener('click', () => {
  activeChat = null;
  $('#view-chat').classList.remove('active');
  $('#view-conversations').classList.add('active');
  $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'conversations'));
  loadConversations();
});

$('#btn-send-reply').addEventListener('click', async () => {
  const message = $('#chat-reply').value.trim();
  if (!message || !activeChat) return;
  const status = $('#reply-status');
  status.style.display = 'none';
  try {
    await api('/send-text', { method: 'POST', body: JSON.stringify({ to: activeChat, message }) });
    $('#chat-reply').value = '';
    status.textContent = 'Sent!';
    status.style.display = 'block';
    await refreshChat();
  } catch (e) {
    status.textContent = 'Failed to send. Check WhatsApp API credentials.';
    status.className = 'error';
    status.style.display = 'block';
  }
});

// ---------- Send template ----------
$('#btn-send-template').addEventListener('click', async () => {
  const recipients = $('#tpl-recipients').value
    .split('\n')
    .map((s) => s.trim().replace(/\D/g, ''))
    .filter(Boolean);
  const templateName = $('#tpl-name').value.trim();
  const languageCode = $('#tpl-lang').value.trim() || 'en_US';
  const varsRaw = $('#tpl-vars').value.trim();

  const resultBox = $('#template-result');
  resultBox.innerHTML = '';

  if (!recipients.length || !templateName) {
    resultBox.innerHTML = `<p class="error">Add at least one recipient and a template name.</p>`;
    return;
  }

  let components = [];
  if (varsRaw) {
    const params = varsRaw.split(',').map((v) => ({ type: 'text', text: v.trim() }));
    components = [{ type: 'body', parameters: params }];
  }

  resultBox.innerHTML = `<p class="hint">Sending to ${recipients.length} recipient(s)...</p>`;

  try {
    const data = await api('/send-template', {
      method: 'POST',
      body: JSON.stringify({ recipients, templateName, languageCode, components }),
    });
    const ok = data.results.filter((r) => r.success).length;
    const fail = data.results.filter((r) => !r.success);
    let html = `<p class="success">Sent to ${ok}/${data.results.length}.</p>`;
    if (fail.length) {
      html += fail.map((f) => `<p class="error">+${f.to}: ${escapeHtml(f.error)}</p>`).join('');
    }
    resultBox.innerHTML = html;
  } catch (e) {
    resultBox.innerHTML = `<p class="error">Failed to send templates.</p>`;
  }
});

// ---------- Settings ----------
async function loadSettings() {
  const settings = await api('/settings');
  $('#toggle-ai').checked = !!settings.aiAutoReplyEnabled;
}

$('#toggle-ai').addEventListener('change', async (e) => {
  await api('/settings', { method: 'POST', body: JSON.stringify({ aiAutoReplyEnabled: e.target.checked }) });
});

// ---------- Utilities ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function init() {
  loadConversations();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if ($('#view-conversations').classList.contains('active')) loadConversations();
    if ($('#view-chat').classList.contains('active')) refreshChat();
  }, 8000);
}

// ---------- Boot ----------
(async function boot() {
  const pw = getPassword();
  if (!pw) return showLogin();
  try {
    await api('/settings');
    $('#view-login').style.display = 'none';
    $('#view-app').style.display = 'block';
    init();
  } catch (e) {
    showLogin();
  }
})();
