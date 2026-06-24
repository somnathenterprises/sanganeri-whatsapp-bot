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
  $('#view-login').style.display = 'flex';
  $('#app-shell').style.display = 'none';
  if (err) { const e=$('#login-error'); e.textContent=err; e.style.display='block'; }
}

async function tryLogin(pw) {
  localStorage.setItem('wa_admin_password', pw);
  try {
    await api('/settings');
    $('#view-login').style.display = 'none';
    $('#app-shell').style.display = 'flex';
    init();
  } catch(e) { showLogin('Incorrect password. Try again.'); }
}

$('#btn-login').addEventListener('click', () => { const pw=$('#password').value.trim(); if(pw) tryLogin(pw); });
$('#password').addEventListener('keydown', e => { if(e.key==='Enter') $('#btn-login').click(); });
$('#btn-logout').addEventListener('click', () => { localStorage.removeItem('wa_admin_password'); showLogin(); });

// ===== PAGE NAVIGATION =====
const PAGE_TITLES = { orders:'Orders', chats:'WhatsApp Chats', cod:'COD Verifications', templates:'Send Templates', settings:'Settings' };

function switchPage(page) {
  // Sidebar nav
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  // Mobile tabbar
  $$('.mobile-tabbar button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  // Pages
  $$('.page').forEach(p => p.style.display = 'none');
  const pg = $('#page-'+page);
  if (pg) pg.style.display = page === 'chats' ? 'block' : 'block';
  // Topbar title
  $('#topbar-title').textContent = PAGE_TITLES[page] || page;
  // Show/hide search
  $('#order-search').style.display = page === 'orders' ? '' : 'none';
  // Load data
  if (page === 'orders') loadOrders();
  if (page === 'chats') loadConversations();
  if (page === 'cod') loadVerifications();
  if (page === 'settings') loadSettings();
}

$$('.nav-item[data-page]').forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page)));
$$('.mobile-tabbar button[data-page]').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));

// ===== ORDERS =====
let allOrdersCache = [];
let currentStatusFilter = 'any';

window.setStatusFilter = function(status, el) {
  currentStatusFilter = status;
  $$('#page-orders .filter-tab').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  loadOrders();
};

window.loadOrders = async function() {
  const tbody = $('#orders-tbody');
  const refreshEl = $('#orders-last-refresh');
  if(refreshEl) refreshEl.textContent = 'Refreshing...';

  const financial = $('#filter-financial')?.value || '';
  const fulfillment = $('#filter-fulfillment')?.value || '';
  const limit = $('#filter-limit')?.value || 50;

  let url = '/orders?status='+currentStatusFilter+'&limit='+limit;
  if(financial) url += '&financial_status='+financial;
  if(fulfillment) url += '&fulfillment_status='+fulfillment;

  try {
    const orders = await api(url);
    allOrdersCache = orders;
    renderOrdersTable(orders);

    // Stats
    const total = orders.length;
    const revenue = orders.reduce((s,o) => s+parseFloat(o.total_price||0), 0);
    const cod = orders.filter(o => o.financial_status==='pending').length;
    const unship = orders.filter(o => !o.fulfillment_status || o.fulfillment_status==='unfulfilled').length;
    const fulfilled = orders.filter(o => o.fulfillment_status==='fulfilled').length;

    const sv = (id, v) => { const el=$(id); if(el) el.textContent=v; };
    sv('#stat-total', total);
    sv('#stat-revenue', '₹'+revenue.toLocaleString('en-IN',{maximumFractionDigits:0}));
    sv('#stat-cod', cod);
    sv('#stat-unshipped', unship);
    sv('#stat-fulfilled', fulfilled);

    if(refreshEl) refreshEl.textContent = total+' orders · '+new Date().toLocaleTimeString('en-IN');

    // Sidebar badge
    const badge = $('#sidebar-orders-count');
    if(badge && unship > 0) { badge.textContent=unship; badge.style.display=''; }
    else if(badge) badge.style.display='none';

  } catch(e) {
    if(tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#d72c0d;">Error: '+esc(e.message)+'</td></tr>';
    if(refreshEl) refreshEl.textContent = 'Error loading orders';
  }
};

function renderOrdersTable(orders) {
  const tbody = $('#orders-tbody');
  if(!tbody) return;
  if(!orders.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🛒</div><p>No orders found with these filters.</p></div></td></tr>';
    $('#orders-pagination').innerHTML = '';
    return;
  }

  const payBadge = (s) => {
    if(s==='paid') return '<span class="badge badge-paid">Paid</span>';
    if(s==='pending') return '<span class="badge badge-pending">Payment pending</span>';
    if(s==='refunded') return '<span class="badge badge-refunded">Refunded</span>';
    if(s==='partially_refunded') return '<span class="badge badge-partial">Partial refund</span>';
    return '<span class="badge badge-pending">'+(s||'Unknown')+'</span>';
  };
  const fulBadge = (s) => {
    if(s==='fulfilled') return '<span class="badge badge-fulfilled">Fulfilled</span>';
    if(s==='partial') return '<span class="badge badge-partial">Partial</span>';
    if(s==='on_hold') return '<span class="badge badge-onhold">On hold</span>';
    return '<span class="badge badge-unfulfilled">Unfulfilled</span>';
  };

  tbody.innerHTML = orders.map(o => {
    const customer = o.shipping_address?.name || ((o.customer?.first_name||'')+' '+(o.customer?.last_name||'')).trim() || 'Unknown';
    const city = o.shipping_address?.city || o.shipping_address?.province || '—';
    const phone = (o.shipping_address?.phone || o.customer?.phone || o.billing_address?.phone || '').replace(/\D/g,'');
    const total = '₹'+parseFloat(o.total_price).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const date = new Date(o.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const items = (o.line_items||[]).length;
    return `<tr onclick="openOrderDrawer('${o.id}')">
      <td><span class="order-link">${esc(o.name)}</span></td>
      <td>${date}</td>
      <td>${esc(customer)}</td>
      <td>${esc(city)}</td>
      <td style="font-weight:600;">${total}</td>
      <td>${payBadge(o.financial_status)}</td>
      <td>${fulBadge(o.fulfillment_status)}</td>
      <td>${items} item${items!==1?'s':''}</td>
      <td style="color:#1e2a4a;">${phone ? '+'+phone : '—'}</td>
    </tr>`;
  }).join('');

  $('#orders-pagination').innerHTML = `<span>${orders.length} orders shown</span>`;
}

window.filterOrdersLocal = function(q) {
  if(!q) { renderOrdersTable(allOrdersCache); return; }
  const lq = q.toLowerCase();
  const filtered = allOrdersCache.filter(o => {
    const customer = ((o.shipping_address?.name || (o.customer?.first_name||'')+' '+(o.customer?.last_name||'')) + ' ' + (o.name||'')).toLowerCase();
    const phone = (o.shipping_address?.phone || o.customer?.phone || '').replace(/\D/g,'');
    return customer.includes(lq) || phone.includes(lq.replace(/\D/g,''));
  });
  renderOrdersTable(filtered);
};

// ===== ORDER DRAWER =====
window.openOrderDrawer = async function(orderId) {
  const overlay = $('#order-drawer-overlay');
  const body = $('#drawer-body');
  overlay.classList.add('open');
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#8c9196;">Loading...</div>';

  try {
    const o = await api('/orders/'+orderId);
    const customer = o.shipping_address?.name || ((o.customer?.first_name||'')+' '+(o.customer?.last_name||'')).trim() || 'Unknown';
    const phone = (o.shipping_address?.phone || o.customer?.phone || '').replace(/\D/g,'');
    const addr = o.shipping_address ? [o.shipping_address.address1, o.shipping_address.address2, o.shipping_address.city, o.shipping_address.province, o.shipping_address.zip].filter(Boolean).join(', ') : 'N/A';
    const tracking = o.fulfillments?.[0]?.tracking_number;
    const trackingCo = o.fulfillments?.[0]?.tracking_company;
    const trackingUrl = o.fulfillments?.[0]?.tracking_url;

    $('#drawer-order-title').textContent = o.name;

    const itemsRows = (o.line_items||[]).map(li =>
      `<tr><td>${esc(li.title)}${li.variant_title?' ('+esc(li.variant_title)+')':''}</td><td>×${li.quantity}</td><td style="text-align:right;font-weight:600;">₹${parseFloat(li.price).toFixed(2)}</td></tr>`
    ).join('');

    body.innerHTML = `
      <div class="drawer-section">
        <h4>Order Info</h4>
        <div class="detail-row"><span class="detail-label">Order</span><span class="detail-value">${esc(o.name)}</span></div>
        <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${new Date(o.created_at).toLocaleString('en-IN')}</span></div>
        <div class="detail-row"><span class="detail-label">Payment</span><span class="detail-value">${o.financial_status||'—'}${o.payment_gateway?' ('+esc(o.payment_gateway)+')':''}</span></div>
        <div class="detail-row"><span class="detail-label">Fulfillment</span><span class="detail-value">${o.fulfillment_status||'Unfulfilled'}</span></div>
      </div>
      <div class="drawer-section">
        <h4>Customer</h4>
        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${esc(customer)}</span></div>
        ${phone?'<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">+'+phone+'</span></div>':''}
        <div class="detail-row"><span class="detail-label">Address</span><span class="detail-value" style="font-size:12px;">${esc(addr)}</span></div>
        ${o.customer?.email?'<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value" style="font-size:12px;">${esc(o.customer.email)}</span></div>':''}
      </div>
      <div class="drawer-section">
        <h4>Items</h4>
        <table class="items-table">
          <thead><tr><th>Product</th><th>Qty</th><th style="text-align:right;">Price</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <div style="margin-top:12px;">
          ${parseFloat(o.total_discounts)>0?'<div class="detail-row"><span class="detail-label">Discount</span><span class="detail-value" style="color:#d72c0d;">-₹'+parseFloat(o.total_discounts).toFixed(2)+'</span></div>':''}
          <div class="detail-row"><span class="detail-label" style="font-weight:700;font-size:14px;">Total</span><span class="detail-value" style="font-size:16px;font-weight:700;">₹${parseFloat(o.total_price).toFixed(2)}</span></div>
        </div>
      </div>
      ${tracking?'<div class="drawer-section"><div class="tracking-box"><h4>📦 Tracking</h4><div style="font-size:13px;margin-top:4px;">${esc(trackingCo||'Courier')}: ${esc(tracking)}</div>${trackingUrl?'<a href="'+trackingUrl+'" target="_blank" style="color:#1a6432;font-size:12px;margin-top:4px;display:block;">Track package →</a>':''}</div></div>':''}
      ${phone?'<button class="btn" style="width:100%;margin-top:8px;" onclick="switchPage('chats')">💬 Open WhatsApp Chat</button>':''}
    `;
  } catch(e) {
    body.innerHTML = '<div class="msg-error">Failed to load order: '+esc(e.message)+'</div>';
  }
};

window.closeOrderDrawer = function(e) {
  if(!e || e.target === $('#order-drawer-overlay')) {
    $('#order-drawer-overlay').classList.remove('open');
  }
};

// ===== CHATS =====
let activeChat = null;

async function loadConversations() {
  const list = await api('/conversations');
  const container = $('#conv-list');
  if(!list.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#8c9196;font-size:13px;">No conversations yet.</div>';
    return;
  }
  container.innerHTML = list.map(c => {
    const last = c.lastMessage;
    const preview = last ? (last.content||'').slice(0,55) : '';
    const time = c.updatedAt ? new Date(c.updatedAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    return `<div class="chat-item${activeChat===c.phone?' active':''}" onclick="openChat('${c.phone}')">
      <div class="chat-item-phone">+${c.phone}</div>
      <div class="chat-item-preview">${esc(preview)}</div>
      <div class="chat-item-time">${time}</div>
    </div>`;
  }).join('');
}

async function openChat(phone) {
  activeChat = phone;
  const empty = $('#chat-empty-state');
  const active = $('#chat-active-area');
  if(empty) empty.style.display = 'none';
  if(active) { active.style.display = 'flex'; }
  $('#chat-header-title').textContent = '+'+phone;
  await refreshChat();
  // Highlight active
  $$('.chat-item').forEach(el => el.classList.toggle('active', el.onclick?.toString().includes(phone)));
}

async function refreshChat() {
  if(!activeChat) return;
  const data = await api('/conversations/'+activeChat);
  const container = $('#chat-messages');
  if(!container) return;
  container.innerHTML = (data.messages||[]).map(m => {
    const isUser = m.role==='user';
    const time = new Date(m.timestamp).toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'});
    const typeLabel = m.type ? '<span class="msg-type">'+m.type.replace(/_/g,' ')+'</span>' : '';
    return `<div class="msg ${isUser?'user':'assistant'}">
      <div class="bubble">${esc(m.content||'')}</div>
      <div class="meta">${time}${typeLabel}${m.ai?' · AI':''}${m.manual?' · Manual':''}</div>
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

$('#btn-send-reply').addEventListener('click', async () => {
  const msg = $('#chat-reply').value.trim();
  if(!msg || !activeChat) return;
  $('#btn-send-reply').disabled = true;
  try {
    await api('/send-text', { method:'POST', body:JSON.stringify({ to:activeChat, message:msg }) });
    $('#chat-reply').value = '';
    await refreshChat();
    await loadConversations();
  } catch(e) { alert('Failed: '+e.message); }
  $('#btn-send-reply').disabled = false;
});

// ===== COD VERIFICATIONS =====
window.loadVerifications = async function(statusFilter, el) {
  if(el) { $$('#page-cod .filter-tab').forEach(b=>b.classList.remove('active')); el.classList.add('active'); }
  const container = $('#verif-list');
  container.innerHTML = '<div style="padding:20px;color:#8c9196;">Loading...</div>';
  try {
    const path = statusFilter ? '/verifications?status='+statusFilter : '/verifications';
    const list = await api(path);
    if(!list.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><p>No verifications found.</p></div>';
      return;
    }
    const badge = $('#sidebar-cod-count');
    const pending = list.filter(v=>v.status==='pending').length;
    if(badge && pending>0) { badge.textContent=pending; badge.style.display=''; } else if(badge) badge.style.display='none';

    container.innerHTML = list.map(v => {
      const statusColor = v.status==='confirmed'?'#1a6432':v.status==='cancelled'?'#8c1e1e':'#7a4d0a';
      const statusEmoji = v.status==='confirmed'?'✅':v.status==='cancelled'?'❌':'⏳';
      const time = new Date(v.createdAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
      return `<div class="verif-card">
        <div class="verif-card-header">
          <span class="verif-order">${esc(v.orderNumber)}</span>
          <span style="color:${statusColor};font-weight:600;">${statusEmoji} ${v.status.toUpperCase()}</span>
        </div>
        <div class="verif-meta">👤 ${esc(v.customerName)} · 📱 +${v.phone}</div>
        <div class="verif-meta">🛍️ ${esc(v.items||'')}</div>
        <div class="verif-meta">💰 ${v.total} · 🕐 ${time}</div>
        ${v.status==='pending'?'<div class="verif-actions"><button class="btn btn-sm" onclick="adminVerify(''+v.orderNumber+'','confirmed')">✅ Confirm</button><button class="btn btn-outline btn-sm" onclick="adminVerify(''+v.orderNumber+'','cancelled')">❌ Cancel</button></div>':''}
      </div>`;
    }).join('');
  } catch(e) { container.innerHTML = '<div class="msg-error">Error: '+esc(e.message)+'</div>'; }
};

window.adminVerify = async function(orderNumber, status) {
  try {
    await api('/verifications/'+encodeURIComponent(orderNumber)+'/status', { method:'POST', body:JSON.stringify({status}) });
    loadVerifications();
  } catch(e) { alert('Failed: '+e.message); }
};

// ===== TEMPLATES =====
$('#btn-send-template').addEventListener('click', async () => {
  const raw = $('#tpl-recipients').value.trim();
  const name = $('#tpl-name').value.trim();
  const lang = $('#tpl-lang').value.trim() || 'en_US';
  const vars = $('#tpl-vars').value.trim();
  if(!raw||!name) { alert('Please enter recipients and template name.'); return; }
  const recipients = raw.split('\n').map(r=>r.trim()).filter(Boolean);
  const varArr = vars ? vars.split(',').map(v=>v.trim()) : [];
  const components = varArr.length ? [{type:'body',parameters:varArr.map(v=>({type:'text',text:v}))}] : [];
  $('#btn-send-template').disabled = true;
  try {
    const result = await api('/send-template', { method:'POST', body:JSON.stringify({recipients,templateName:name,languageCode:lang,components}) });
    const div = $('#template-result');
    div.innerHTML = (result.results||[]).map(r=>'<div class="'+(r.success?'msg-success':'msg-error')+'">'+r.to+': '+(r.success?'Sent ✓':esc(r.error))+'</div>').join('');
  } catch(e) { alert('Error: '+e.message); }
  $('#btn-send-template').disabled = false;
});

// ===== SETTINGS =====
async function loadSettings() {
  const s = await api('/settings');
  const toggle = $('#toggle-ai'); if(toggle) toggle.checked = !!s.aiAutoReplyEnabled;
  const base = window.location.origin;
  const uc = $('#url-order-created'); if(uc) uc.textContent = base+'/shopify/order-created';
  const uf = $('#url-order-fulfilled'); if(uf) uf.textContent = base+'/shopify/order-fulfilled';
}

const toggleAi = $('#toggle-ai');
if(toggleAi) toggleAi.addEventListener('change', async () => {
  await api('/settings', { method:'POST', body:JSON.stringify({aiAutoReplyEnabled:toggleAi.checked}) });
});

// ===== INIT =====
function init() {
  switchPage('orders');
  setInterval(() => {
    const page = document.querySelector('.nav-item.active')?.dataset?.page || 'orders';
    if(page==='orders') loadOrders();
    if(page==='chats') { loadConversations(); if(activeChat) refreshChat(); }
    if(page==='cod') loadVerifications();
  }, 30000);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
if(getPassword()) tryLogin(getPassword());
