// ===== HELPERS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function getPassword() { return localStorage.getItem('wa_admin_password') || ''; }

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type':'application/json', 'X-Admin-Password': getPassword(), ...(opts.headers||{}) }
  });
  if (res.status === 401) { localStorage.removeItem('wa_admin_password'); showLogin('Session expired.'); throw new Error('Unauthorized'); }
  return res.json();
}

// ===== AUTH =====
function showLogin(err) {
  $('#app').style.display = 'none';
  $('#login-page').style.display = 'flex';
  if (err) { const e = $('#login-error'); e.textContent = err; e.style.display = 'block'; }
}

function hideLogin() {
  $('#login-page').style.display = 'none';
  $('#app').style.display = 'flex';
}

async function handleLogin() {
  const pw = $('#login-password').value.trim();
  if (!pw) return;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem('wa_admin_password', pw);
      hideLogin();
      initApp();
    } else {
      const e = $('#login-error');
      e.textContent = data.error || 'Wrong password';
      e.style.display = 'block';
    }
  } catch(ex) {
    const e = $('#login-error');
    e.textContent = 'Connection error. Try again.';
    e.style.display = 'block';
  }
}

// ===== NAVIGATION =====
let currentPage = 'orders';

function switchPage(page) {
  currentPage = page;
  $$('.page-section').forEach(s => s.style.display = 'none');
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const section = $('#page-' + page);
  if (section) section.style.display = 'block';
  const navItem = $('.nav-item[data-page="' + page + '"]');
  if (navItem) navItem.classList.add('active');
  const titles = { orders: 'Orders', chats: 'WhatsApp Chats', cod: 'COD Verifications', templates: 'Send Templates', settings: 'Settings' };
  const titleEl = $('#page-title');
  if (titleEl) titleEl.textContent = titles[page] || page;
  if (page === 'orders') loadOrders();
  if (page === 'chats') loadChats();
  if (page === 'cod') loadVerifications();
}

// ===== ORDERS =====
let allOrders = [];

async function loadOrders() {
  const tbody = $('#orders-tbody');
  const statsEl = $('#orders-stats');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#666;">Loading orders...</td></tr>';
  try {
    const orders = await api('/orders?limit=50');
    allOrders = orders;
    renderOrdersTable(orders);
    renderStats(orders);
  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#d82c0d;">Failed to load orders: ' + esc(e.message) + '</td></tr>';
  }
}

function renderStats(orders) {
  const el = $('#orders-stats');
  if (!el) return;
  const total = orders.length;
  const paid = orders.filter(o => o.financial_status === 'paid').length;
  const pending = orders.filter(o => o.financial_status !== 'paid').length;
  const fulfilled = orders.filter(o => o.fulfillment_status === 'fulfilled').length;
  const totalAmount = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
  el.innerHTML = '<div class="stat-card"><div class="stat-value">' + total + '</div><div class="stat-label">Total Orders</div></div><div class="stat-card"><div class="stat-value">&#8377;' + totalAmount.toFixed(0) + '</div><div class="stat-label">Total Value</div></div><div class="stat-card"><div class="stat-value">' + paid + '</div><div class="stat-label">Paid</div></div><div class="stat-card"><div class="stat-value">' + pending + '</div><div class="stat-label">COD Pending</div></div><div class="stat-card"><div class="stat-value">' + fulfilled + '</div><div class="stat-label">Fulfilled</div></div>';
}

function renderOrdersTable(orders) {
  const tbody = $('#orders-tbody');
  if (!tbody) return;
  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#666;">No orders found.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const name = o.customer ? (o.customer.first_name + ' ' + (o.customer.last_name || '')).trim() : 'Guest';
    const city = o.shipping_address ? o.shipping_address.city : '';
    const date = new Date(o.created_at).toLocaleString('en-IN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const payBadge = o.financial_status === 'paid' ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-pending">COD Pending</span>';
    const fulBadge = o.fulfillment_status === 'fulfilled' ? '<span class="badge badge-fulfilled">Fulfilled</span>' : '<span class="badge badge-unfulfilled">Unfulfilled</span>';
    const items = (o.line_items || []).length;
    const phone = o.customer ? (o.customer.phone || o.billing_address?.phone || '-') : '-';
    return '<tr onclick="openOrderDrawer(' + o.id + ')" style="cursor:pointer;">' +
      '<td><span style="color:#1a73e8;font-weight:600;">' + esc(o.name) + '</span></td>' +
      '<td style="color:#666;font-size:13px;">' + date + '</td>' +
      '<td>' + esc(name) + '</td>' +
      '<td style="color:#666;">' + esc(city) + '</td>' +
      '<td style="font-weight:600;">&#8377;' + parseFloat(o.total_price).toFixed(2) + '</td>' +
      '<td>' + payBadge + '</td>' +
      '<td>' + fulBadge + '</td>' +
      '<td>' + items + ' item' + (items !== 1 ? 's' : '') + '</td>' +
      '<td style="color:#666;font-size:13px;">' + esc(phone) + '</td>' +
      '</tr>';
  }).join('');
}

function filterOrders() {
  const q = ($('#order-search') || {value:''}).value.toLowerCase();
  const status = ($('#order-status-filter') || {value:''}).value;
  let filtered = allOrders;
  if (q) {
    filtered = filtered.filter(o => {
      const name = o.customer ? (o.customer.first_name + ' ' + (o.customer.last_name || '')).toLowerCase() : '';
      const num = (o.name || '').toLowerCase();
      return name.includes(q) || num.includes(q);
    });
  }
  if (status) {
    filtered = filtered.filter(o => o.financial_status === status || o.fulfillment_status === status);
  }
  renderOrdersTable(filtered);
}

async function openOrderDrawer(orderId) {
  const drawer = $('#order-drawer');
  const body = $('#order-drawer-body');
  if (!drawer || !body) return;
  drawer.style.display = 'block';
  body.innerHTML = '<div style="padding:32px;text-align:center;color:#666;">Loading order details...</div>';
  try {
    const o = await api('/orders/' + orderId);
    const name = o.customer ? (o.customer.first_name + ' ' + (o.customer.last_name || '')).trim() : 'Guest';
    const phone = o.customer ? (o.customer.phone || o.billing_address?.phone || '') : '';
    const addr = o.shipping_address ? [o.shipping_address.address1, o.shipping_address.address2, o.shipping_address.city, o.shipping_address.province, o.shipping_address.zip].filter(Boolean).join(', ') : '';
    const tracking = o.fulfillments && o.fulfillments[0] ? o.fulfillments[0].tracking_number : null;
    const trackingCo = o.fulfillments && o.fulfillments[0] ? o.fulfillments[0].tracking_company : null;
    const trackingUrl = o.fulfillments && o.fulfillments[0] ? o.fulfillments[0].tracking_url : null;
    const payBadge = o.financial_status === 'paid' ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-pending">COD Pending</span>';
    const fulBadge = o.fulfillment_status === 'fulfilled' ? '<span class="badge badge-fulfilled">Fulfilled</span>' : '<span class="badge badge-unfulfilled">Unfulfilled</span>';
    const lineItemsHtml = (o.line_items || []).map(li => '<tr><td>' + esc(li.title) + (li.variant_title ? ' - ' + esc(li.variant_title) + '' : '') + '</td><td>x' + li.quantity + '</td><td style="text-align:right;font-weight:600;">&#8377;' + parseFloat(li.price).toFixed(2) + '</td></tr>').join('');
    body.innerHTML = '<div class="drawer-header"><h3>' + esc(o.name) + ' <span style="font-size:14px;font-weight:400;color:#666;">' + new Date(o.created_at).toLocaleString('en-IN') + '</span></h3><div style="margin-top:8px;">' + payBadge + ' ' + fulBadge + '</div></div>' +
      '<div class="drawer-section"><div class="detail-row"><span class="detail-label">Order</span><span class="detail-value">' + esc(o.name) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">' + new Date(o.created_at).toLocaleString('en-IN') + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Payment</span><span class="detail-value">' + esc(o.financial_status || '-') + ' via ' + esc(o.payment_gateway || '-') + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Fulfillment</span><span class="detail-value">' + esc(o.fulfillment_status || 'Unfulfilled') + '</span></div></div>' +
      '<div class="drawer-section"><div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">' + esc(name) + '</span></div>' +
      (phone ? '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">+' + phone + '</span></div>' : '') +
      (addr ? '<div class="detail-row"><span class="detail-label">Address</span><span class="detail-value" style="font-size:12px;">' + esc(addr) + '</span></div>' : '') +
      (o.customer && o.customer.email ? '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value" style="font-size:12px;">' + esc(o.customer.email) + '</span></div>' : '') +
      '</div>' +
      '<div class="drawer-section"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="border-bottom:1px solid #eee;"><th style="text-align:left;padding:6px 0;color:#666;">Item</th><th style="text-align:left;color:#666;">Qty</th><th style="text-align:right;color:#666;">Price</th></tr></thead><tbody>' + lineItemsHtml + '</tbody></table>' +
      '<div class="detail-row" style="margin-top:12px;border-top:1px solid #eee;padding-top:8px;"><span class="detail-label" style="color:#d72c0d;">Discount</span><span class="detail-value" style="color:#d72c0d;">-&#8377;' + parseFloat(o.total_discounts || 0).toFixed(2) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label" style="font-weight:700;font-size:14px;">Total</span><span class="detail-value" style="font-size:16px;font-weight:700;color:#1a73e8;">&#8377;' + parseFloat(o.total_price).toFixed(2) + '</span></div></div>' +
      (tracking ? '<div class="drawer-section"><div class="tracking-box"><h4>&#128230; Tracking</h4><div style="font-size:13px;margin-top:4px;">' + esc(trackingCo || 'Courier') + ': ' + esc(tracking) + '</div>' + (trackingUrl ? '<a href="' + esc(trackingUrl) + '" target="_blank" style="color:#1a6432;font-size:12px;margin-top:4px;display:block;">Track Order</a>' : '') + '</div></div>' : '') +
      (phone ? '<div class="drawer-section"><button class="btn-whatsapp" style="width:100%;margin-top:8px;" onclick="switchPage('chats')">&#128172; Open WhatsApp Chat</button></div>' : '');
  } catch(e) {
    body.innerHTML = '<div style="padding:32px;text-align:center;color:#d82c0d;">Failed to load order: ' + esc(e.message) + '</div>';
  }
}

function closeOrderDrawer() {
  const drawer = $('#order-drawer');
  if (drawer) drawer.style.display = 'none';
}

// ===== CHATS =====
async function loadChats() {
  const el = $('#chats-list');
  if (!el) return;
  el.innerHTML = '<div style="padding:24px;color:#666;">Loading chats...</div>';
  try {
    const convs = await api('/conversations');
    if (!convs || convs.length === 0) {
      el.innerHTML = '<div style="padding:24px;color:#666;">No conversations yet.</div>';
      return;
    }
    el.innerHTML = convs.map(c => {
      const last = c.lastMessage ? esc(c.lastMessage.content || '').substring(0, 60) + '...' : 'No messages';
      const time = c.updatedAt ? new Date(c.updatedAt).toLocaleString('en-IN') : '';
      return '<div class="chat-item" onclick="loadConversation('' + esc(c.phone) + '')">' +
        '<div class="chat-avatar">' + (c.phone || '?')[0] + '</div>' +
        '<div class="chat-info"><div class="chat-phone">+' + esc(c.phone) + '</div><div class="chat-last">' + last + '</div></div>' +
        '<div class="chat-time">' + time + '</div></div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="padding:24px;color:#d82c0d;">Error: ' + esc(e.message) + '</div>';
  }
}

async function loadConversation(phone) {
  const panel = $('#chat-panel');
  const msgs = $('#chat-messages');
  const title = $('#chat-panel-title');
  if (!panel || !msgs) return;
  panel.style.display = 'flex';
  if (title) title.textContent = '+' + phone;
  msgs.innerHTML = '<div style="padding:16px;color:#666;">Loading messages...</div>';
  try {
    const conv = await api('/conversations/' + phone);
    const messages = conv.messages || [];
    msgs.innerHTML = messages.map(m => {
      const isUser = m.role === 'user';
      return '<div class="message ' + (isUser ? 'message-user' : 'message-bot') + '"><div class="message-bubble">' + esc(m.content || '') + '</div><div class="message-time">' + (m.timestamp ? new Date(m.timestamp).toLocaleTimeString('en-IN') : '') + '</div></div>';
    }).join('');
    msgs.scrollTop = msgs.scrollHeight;
    const replyInput = $('#reply-to');
    const replyPhone = $('#reply-phone');
    if (replyInput) replyInput.placeholder = 'Type a message to +' + phone + '...';
    if (replyPhone) replyPhone.value = phone;
  } catch(e) {
    msgs.innerHTML = '<div style="padding:16px;color:#d82c0d;">Error: ' + esc(e.message) + '</div>';
  }
}

async function sendReply() {
  const input = $('#reply-to');
  const phoneEl = $('#reply-phone');
  if (!input || !phoneEl) return;
  const message = input.value.trim();
  const phone = phoneEl.value.trim();
  if (!message || !phone) return;
  try {
    await api('/send-text', { method: 'POST', body: JSON.stringify({ to: phone, message }) });
    input.value = '';
    loadConversation(phone);
  } catch(e) {
    alert('Failed to send: ' + e.message);
  }
}

// ===== COD VERIFICATIONS =====
async function loadVerifications() {
  const el = $('#cod-list');
  if (!el) return;
  el.innerHTML = '<div style="padding:24px;color:#666;">Loading verifications...</div>';
  try {
    const verifications = await api('/verifications');
    if (!verifications || verifications.length === 0) {
      el.innerHTML = '<div style="padding:24px;color:#666;">No pending COD verifications.</div>';
      return;
    }
    el.innerHTML = verifications.map(v => {
      const statusColor = v.status === 'confirmed' ? '#2e7d32' : v.status === 'cancelled' ? '#d82c0d' : '#b57c00';
      return '<div class="cod-card"><div class="cod-header"><span class="cod-order">' + esc(v.orderId || '') + '</span><span class="cod-status" style="color:' + statusColor + ';">' + esc(v.status || 'pending') + '</span></div>' +
        '<div class="cod-customer">' + esc(v.customerName || '') + ' - +' + esc(v.phone || '') + '</div>' +
        '<div class="cod-amount">Amount: &#8377;' + esc(String(v.amount || '')) + '</div>' +
        (v.status === 'pending' ? '<button class="btn-secondary" style="margin-top:8px;" onclick="resendVerification('' + esc(v.orderId) + '')">Resend Message</button>' : '') +
        '</div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="padding:24px;color:#d82c0d;">Error: ' + esc(e.message) + '</div>';
  }
}

async function resendVerification(orderId) {
  try {
    await api('/verifications/' + orderId + '/resend', { method: 'POST' });
    alert('Verification message resent!');
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ===== TEMPLATES =====
async function sendTemplate() {
  const name = $('#tmpl-name') ? $('#tmpl-name').value.trim() : '';
  const phones = $('#tmpl-phones') ? $('#tmpl-phones').value.trim() : '';
  const lang = $('#tmpl-lang') ? $('#tmpl-lang').value.trim() : 'en';
  if (!name || !phones) { alert('Please fill template name and phone numbers'); return; }
  const toList = phones.split(',').map(p => p.trim()).filter(Boolean);
  try {
    const result = await api('/send-template', { method: 'POST', body: JSON.stringify({ to: toList, templateName: name, languageCode: lang, components: [] }) });
    alert('Template sent to ' + toList.length + ' recipient(s)!');
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

// ===== SETTINGS =====
function loadSettings() {
  const webhookUrl = window.location.origin + '/shopify/webhook';
  const waWebhookUrl = window.location.origin + '/webhook';
  const shopifyEl = $('#shopify-webhook-url');
  const waEl = $('#wa-webhook-url');
  if (shopifyEl) shopifyEl.textContent = webhookUrl;
  if (waEl) waEl.textContent = waWebhookUrl;
}

// ===== INIT =====
function initApp() {
  switchPage('orders');
  loadSettings();
  const loginBtn = $('#login-btn');
  if (loginBtn) loginBtn.onclick = handleLogin;
  const loginPw = $('#login-password');
  if (loginPw) loginPw.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
  const navItems = $$('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.getAttribute('data-page');
      if (page) switchPage(page);
    });
  });
  const refreshBtn = $('#refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => {
    if (currentPage === 'orders') loadOrders();
    else if (currentPage === 'chats') loadChats();
    else if (currentPage === 'cod') loadVerifications();
  });
  const orderSearch = $('#order-search');
  if (orderSearch) orderSearch.addEventListener('input', filterOrders);
  const orderFilter = $('#order-status-filter');
  if (orderFilter) orderFilter.addEventListener('change', filterOrders);
  const sendBtn = $('#send-reply-btn');
  if (sendBtn) sendBtn.addEventListener('click', sendReply);
  const sendTemplBtn = $('#send-template-btn');
  if (sendTemplBtn) sendTemplBtn.addEventListener('click', sendTemplate);
  const drawerClose = $('#close-drawer');
  if (drawerClose) drawerClose.addEventListener('click', closeOrderDrawer);
  const chatClose = $('#close-chat-panel');
  if (chatClose) chatClose.addEventListener('click', () => { const p = $('#chat-panel'); if (p) p.style.display = 'none'; });
}

// Start
document.addEventListener('DOMContentLoaded', () => {
  const pw = getPassword();
  if (pw) {
    hideLogin();
    initApp();
  } else {
    showLogin();
    const loginBtn = $('#login-btn');
    if (loginBtn) loginBtn.onclick = handleLogin;
    const loginPw = $('#login-password');
    if (loginPw) loginPw.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
  }
});
