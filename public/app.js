const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let activeChat = null;
let pollTimer = null;
let ordersRefreshTimer = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ---------- Auth ----------
function getPassword() { return localStorage.getItem('wa_admin_password') || ''; }

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': getPassword(), ...(options.headers || {}) },
  });
  if (res.status === 401) { localStorage.removeItem('wa_admin_password'); showLogin('Session expired.'); throw new Error('Unauthorized'); }
  return res.json();
}

function showLogin(error) {
  $('#view-login').style.display = 'flex';
  $('#view-app').style.display = 'none';
  if (error) { $('#login-error').textContent = error; $('#login-error').style.display = 'block'; }
}

async function tryLogin(password) {
  localStorage.setItem('wa_admin_password', password);
  try {
    await api('/settings');
    $('#view-login').style.display = 'none';
    $('#view-app').style.display = 'block';
    init();
  } catch (e) { showLogin('Incorrect password. Try again.'); }
}

$('#btn-login').addEventListener('click', () => { const pw = $('#password').value.trim(); if (pw) tryLogin(pw); });
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-login').click(); });
$('#btn-logout').addEventListener('click', () => {
  localStorage.removeItem('wa_admin_password');
  if (pollTimer) clearInterval(pollTimer);
  if (ordersRefreshTimer) clearInterval(ordersRefreshTimer);
  showLogin();
});

// ---------- Tabs ----------
$$('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

function switchTab(tab) {
  $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.view').forEach((v) => v.classList.remove('active'));
  const el = $(`#view-${tab}`);
  if (el) el.classList.add('active');
  if (tab === 'conversations') loadConversations();
  if (tab === 'orders') loadOrders();
  if (tab === 'settings') loadSettings();
  if (tab === 'verifications') loadVerifications();
}

// ---------- Conversations ----------
async function loadConversations() {
  const list = await api('/conversations');
  const container = $('#conv-list');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">&#128172;</div>No conversations yet.</div>`;
    return;
  }
  container.innerHTML = list.map((c) => {
    const last = c.lastMessage;
    const preview = last ? (last.content || '').slice(0, 60) : '';
    const time = c.updatedAt ? new Date(c.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="conv-item" data-phone="${c.phone}">
      <div><div class="phone">+${c.phone}</div><div class="preview">${escapeHtml(preview)}</div></div>
      <div class="time">${time}</div>
    </div>`;
  }).join('');
  $$('.conv-item').forEach((el) => el.addEventListener('click', () => openChat(el.dataset.phone)));
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
  container.innerHTML = (data.messages || []).map((m) => {
    const isUser = m.role === 'user';
    const time = new Date(m.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
    const typeLabel = m.type ? ` <span class="msg-type">${m.type.replace(/_/g,' ')}</span>` : '';
    return `<div class="msg ${isUser ? 'user' : 'assistant'}">
      <div class="bubble">${escapeHtml(m.content || '')}</div>
      <div class="meta">${time}${typeLabel}${m.ai ? ' · AI' : ''}${m.manual ? ' · Manual' : ''}</div>
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

$('#btn-back-chat').addEventListener('click', () => { activeChat = null; switchTab('conversations'); });
$('#btn-send-reply').addEventListener('click', async () => {
  const msg = $('#chat-reply').value.trim();
  if (!msg || !activeChat) return;
  $('#btn-send-reply').disabled = true;
  try {
    await api('/send-text', { method: 'POST', body: JSON.stringify({ to: activeChat, message: msg }) });
    $('#chat-reply').value = '';
    const status = $('#reply-status');
    status.textContent = 'Sent!'; status.style.display = 'block';
    setTimeout(() => (status.style.display = 'none'), 3000);
    await refreshChat();
  } catch (e) { alert('Failed to send: ' + e.message); }
  $('#btn-send-reply').disabled = false;
});

// ---------- LIVE ORDERS ----------
window.loadOrders = async function() {
  const container = $('#orders-list');
  const summaryEl = $('#orders-summary');
  const refreshEl = $('#orders-last-refresh');
  if (refreshEl) refreshEl.textContent = 'Refreshing...';

  const status = $('#filter-status')?.value || 'any';
  const financial = $('#filter-financial')?.value || '';
  const fulfillment = $('#filter-fulfillment')?.value || '';
  const limit = $('#filter-limit')?.value || 50;

  let url = `/orders?status=${status}&limit=${limit}`;
  if (financial) url += `&financial_status=${financial}`;
  if (fulfillment) url += `&fulfillment_status=${fulfillment}`;

  try {
    const orders = await api(url);

    // Summary stats
    const total = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const unpaid = orders.filter(o => o.financial_status === 'pending').length;
    const unshipped = orders.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled').length;

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="summary-box"><div class="num">${total}</div><div class="lbl">Orders</div></div>
        <div class="summary-box"><div class="num">₹${totalRevenue.toLocaleString('en-IN', {maximumFractionDigits:0})}</div><div class="lbl">Revenue</div></div>
        <div class="summary-box"><div class="num">${unpaid}</div><div class="lbl">COD/Pending</div></div>
        <div class="summary-box"><div class="num">${unshipped}</div><div class="lbl">Unshipped</div></div>
      `;
    }

    if (!orders.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">&#128722;</div>No orders found with these filters.</div>';
      if (refreshEl) refreshEl.textContent = 'No orders found · ' + new Date().toLocaleTimeString('en-IN');
      return;
    }

    container.innerHTML = orders.map((o) => {
      const customerName = o.shipping_address?.name || o.customer?.first_name + ' ' + (o.customer?.last_name || '') || 'Unknown Customer';
      const phone = o.shipping_address?.phone || o.customer?.phone || o.billing_address?.phone || '';
      const cleanPhone = phone.replace(/\D/g,'');
      const items = (o.line_items || []).map(li => `${li.title} × ${li.quantity}`).join(' | ');
      const total = `₹${parseFloat(o.total_price).toLocaleString('en-IN', {maximumFractionDigits:2})}`;
      const date = new Date(o.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      const city = o.shipping_address?.city || o.shipping_address?.province || '';

      const payBadge = o.financial_status === 'paid' ? 'badge-paid' :
                       o.financial_status === 'pending' ? 'badge-pending badge-cod' :
                       o.financial_status === 'refunded' ? 'badge-refunded' : 'badge-pending';
      const payLabel = o.financial_status === 'pending' ? 'COD' : (o.financial_status || 'unknown');

      const fulfillBadge = o.fulfillment_status === 'fulfilled' ? 'badge-fulfilled' :
                           o.fulfillment_status === 'partial' ? 'badge-partial' : 'badge-unfulfilled';
      const fulfillLabel = o.fulfillment_status || 'Unfulfilled';

      const tracking = o.fulfillments?.[0]?.tracking_number ? `📦 ${o.fulfillments[0].tracking_number}` : '';

      return `<div class="order-card" onclick="showOrderDetail('${o.id}')">
        <div class="order-card-header">
          <span class="order-number">${o.name}</span>
          <div class="order-badges">
            <span class="badge ${payBadge}">${payLabel}</span>
            <span class="badge ${fulfillBadge}">${fulfillLabel}</span>
          </div>
        </div>
        <div class="order-customer">👤 ${escapeHtml(customerName.trim())}${city ? ' · 📍 ' + escapeHtml(city) : ''}</div>
        ${cleanPhone ? `<div class="order-phone">📱 +${cleanPhone}</div>` : ''}
        <div class="order-items">${escapeHtml(items)}</div>
        ${tracking ? `<div class="order-items" style="color:#1565c0;">${tracking}</div>` : ''}
        <div class="order-footer">
          <span class="order-total">${total}</span>
          <span class="order-time">${date}</span>
        </div>
      </div>`;
    }).join('');

    if (refreshEl) refreshEl.textContent = `${total} orders · Last updated: ${new Date().toLocaleTimeString('en-IN')}`;
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load orders: ${e.message}</div>`;
    if (refreshEl) refreshEl.textContent = 'Error loading orders';
  }
};

// Order Detail Overlay
window.showOrderDetail = async function(orderId) {
  const overlay = $('#order-overlay');
  const content = $('#order-detail-content');
  overlay.style.display = 'flex';
  content.innerHTML = '<div style="text-align:center;padding:30px;">Loading...</div>';

  try {
    const o = await api(`/orders/${orderId}`);
    const customerName = o.shipping_address?.name || (o.customer?.first_name + ' ' + (o.customer?.last_name || '')) || 'Unknown';
    const phone = o.shipping_address?.phone || o.customer?.phone || '';
    const addr = o.shipping_address ? [o.shipping_address.address1, o.shipping_address.city, o.shipping_address.province, o.shipping_address.zip].filter(Boolean).join(', ') : 'N/A';
    const tracking = o.fulfillments?.[0]?.tracking_number || null;
    const trackingCo = o.fulfillments?.[0]?.tracking_company || null;
    const trackingUrl = o.fulfillments?.[0]?.tracking_url || null;

    const itemsHtml = (o.line_items || []).map(li =>
      `<div class="detail-row"><span class="detail-label">${escapeHtml(li.title)}</span><span class="detail-value">x${li.quantity} · ₹${parseFloat(li.price).toFixed(2)}</span></div>`
    ).join('');

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;">${o.name}</h3>
        <button onclick="closeOrderDetail()" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${new Date(o.created_at).toLocaleString('en-IN')}</span></div>
      <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${escapeHtml(customerName.trim())}</span></div>
      ${phone ? `<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(phone)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">${escapeHtml(addr)}</span></div>
      <div class="detail-row"><span class="detail-label">Payment</span><span class="detail-value">${o.financial_status || 'N/A'} ${o.payment_gateway ? '(' + o.payment_gateway + ')' : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Fulfillment</span><span class="detail-value">${o.fulfillment_status || 'Unfulfilled'}</span></div>
      <div style="margin:12px 0 6px;font-weight:600;font-size:13px;color:#888;">ITEMS</div>
      ${itemsHtml}
      <div class="detail-row" style="margin-top:8px;"><span class="detail-label">Subtotal</span><span class="detail-value">₹${parseFloat(o.subtotal_price).toFixed(2)}</span></div>
      ${parseFloat(o.total_discounts) > 0 ? `<div class="detail-row"><span class="detail-label">Discount</span><span class="detail-value" style="color:#c62828;">-₹${parseFloat(o.total_discounts).toFixed(2)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Shipping</span><span class="detail-value">₹${parseFloat(o.total_shipping_price_set?.shop_money?.amount || 0).toFixed(2)}</span></div>
      <div class="detail-row"><span class="detail-label" style="font-weight:700;">TOTAL</span><span class="detail-value" style="font-size:16px;font-weight:700;">₹${parseFloat(o.total_price).toFixed(2)}</span></div>
      ${tracking ? `<div style="margin-top:12px;padding:10px;background:#e3f2fd;border-radius:8px;">
        <div style="font-weight:600;color:#1565c0;">📦 Tracking</div>
        <div style="font-size:13px;margin-top:4px;">${trackingCo || 'Courier'}: ${tracking}</div>
        ${trackingUrl ? `<a href="${trackingUrl}" target="_blank" style="color:#1565c0;font-size:12px;">Track package →</a>` : ''}
      </div>` : ''}
      ${phone ? `<button class="btn" style="margin-top:16px;width:100%;" onclick="openChat('${phone.replace(/\D/g,'').slice(-12)}')">💬 WhatsApp Customer</button>` : ''}
    `;
  } catch(e) {
    content.innerHTML = `<div class="error">Failed to load order: ${e.message}</div>`;
  }
};

window.closeOrderDetail = function(e) {
  if (!e || e.target === $('#order-overlay')) $('#order-overlay').style.display = 'none';
};

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
      const time = new Date(v.createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
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
  } catch(e) { container.innerHTML = '<div class="error">Failed to load verifications.</div>'; }
};

window.adminVerify = async function(orderNumber, status) {
  try {
    await api(`/verifications/${encodeURIComponent(orderNumber)}/status`, { method:'POST', body: JSON.stringify({ status }) });
    loadVerifications();
  } catch(e) { alert('Failed to update: ' + e.message); }
};

// ---------- Templates ----------
$('#btn-send-template').addEventListener('click', async () => {
  const recipientsRaw = $('#tpl-recipients').value.trim();
  const templateName = $('#tpl-name').value.trim();
  const languageCode = $('#tpl-lang').value.trim() || 'en_US';
  const varsRaw = $('#tpl-vars').value.trim();
  if (!recipientsRaw || !templateName) { alert('Please enter recipients and template name.'); return; }
  const recipients = recipientsRaw.split('\n').map(r => r.trim()).filter(Boolean);
  const vars = varsRaw ? varsRaw.split(',').map(v => v.trim()) : [];
  const components = vars.length ? [{ type:'body', parameters: vars.map(v => ({ type:'text', text:v })) }] : [];
  $('#btn-send-template').disabled = true;
  try {
    const result = await api('/send-template', { method:'POST', body: JSON.stringify({ recipients, templateName, languageCode, components }) });
    const div = $('#template-result');
    div.innerHTML = (result.results || []).map(r => `<div class="${r.success ? 'success' : 'error'}">${r.to}: ${r.success ? 'Sent ✓' : r.error}</div>`).join('');
  } catch(e) { alert('Error: ' + e.message); }
  $('#btn-send-template').disabled = false;
});

// ---------- Settings ----------
async function loadSettings() {
  const s = await api('/settings');
  $('#toggle-ai').checked = !!s.aiAutoReplyEnabled;
  const base = window.location.origin;
  const urlCreated = $('#url-order-created');
  const urlFulfilled = $('#url-order-fulfilled');
  if (urlCreated) urlCreated.textContent = base + '/shopify/order-created';
  if (urlFulfilled) urlFulfilled.textContent = base + '/shopify/order-fulfilled';
}
$('#toggle-ai').addEventListener('change', async () => {
  await api('/settings', { method:'POST', body: JSON.stringify({ aiAutoReplyEnabled: $('#toggle-ai').checked }) });
});

// ---------- Init ----------
function init() {
  loadConversations();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab === 'conversations') loadConversations();
    if (activeTab === 'verifications') loadVerifications();
  }, 15000);

  // Auto-refresh orders every 60 seconds when on Orders tab
  if (ordersRefreshTimer) clearInterval(ordersRefreshTimer);
  ordersRefreshTimer = setInterval(() => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab === 'orders') loadOrders();
  }, 60000);
}

if (getPassword()) tryLogin(getPassword());

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
