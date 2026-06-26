// ===== HELPERS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function getPassword() { return localStorage.getItem('wa_admin_password') || ''; }

async function api(path, opts) {
  if (!opts) opts = {};
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({'Content-Type':'application/json','X-Admin-Password':getPassword()}, opts.headers || {}),
    body: opts.body
  });
  if (res.status === 401) {
    localStorage.removeItem('wa_admin_password');
    showLogin('Session expired. Please log in again.');
    throw new Error('Unauthorized');
  }
  return res.json();
}

// ===== AUTH =====
function showLogin(err) {
  const appShell = document.getElementById('app-shell');
  const loginView = document.getElementById('view-login');
  if (appShell) appShell.style.display = 'none';
  if (loginView) loginView.style.display = 'flex';
  if (err) {
    const e = document.getElementById('login-error');
    if (e) { e.textContent = err; e.style.display = 'block'; }
  }
}

function hideLogin() {
  const appShell = document.getElementById('app-shell');
  const loginView = document.getElementById('view-login');
  if (loginView) loginView.style.display = 'none';
  if (appShell) appShell.style.display = 'flex';
}

async function handleLogin() {
  const pwEl = document.getElementById('password');
  if (!pwEl) return;
  const pw = pwEl.value.trim();
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
      const e = document.getElementById('login-error');
      if (e) { e.textContent = data.error || 'Wrong password'; e.style.display = 'block'; }
    }
  } catch(ex) {
    const e = document.getElementById('login-error');
    if (e) { e.textContent = 'Connection error. Try again.'; e.style.display = 'block'; }
  }
}

// ===== NAVIGATION =====
let currentPage = 'orders';

window.switchPage = function(page) {
  currentPage = page;
  document.querySelectorAll('.page-section').forEach(function(s) { s.style.display = 'none'; });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  const section = document.getElementById('page-' + page);
  if (section) section.style.display = 'block';
  const navItem = document.querySelector('.nav-item[data-page="' + page + '"]');
  if (navItem) navItem.classList.add('active');
  const titles = { orders:'Orders', chats:'WhatsApp Chats', cod:'COD Verifications', templates:'Send Templates', settings:'Settings' };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[page] || page;
  if (page === 'orders') loadOrders();
  if (page === 'chats') loadChats();
    if (page === 'cod') loadVerifications();
    if (page === 'inventory') loadInventory();
};
// ===== ORDERS =====
let allOrders = [];

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#666;">Loading orders...</td></tr>';
  try {
    const limit = (document.getElementById('filter-limit')||{value:'50'}).value || 50;
    const orders = await api('/orders?limit=' + limit);
    allOrders = orders;
    renderOrdersTable(orders);
    renderStats(orders);
    const lastRefresh = document.getElementById('orders-last-refresh');
    if (lastRefresh) lastRefresh.textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');
  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#d82c0d;">Failed to load orders. Connect Shopify API first.</td></tr>';
  }
}

function renderStats(orders) {
  const total = orders.length;
  const revenue = orders.reduce(function(s,o) { return s + parseFloat(o.total_price||0); }, 0);
  const cod = orders.filter(function(o) { return o.financial_status !== 'paid'; }).length;
  const fulfilled = orders.filter(function(o) { return o.fulfillment_status === 'fulfilled'; }).length;
  const setEl = function(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('stat-total', total);
  setEl('stat-revenue', 'Rs.' + revenue.toFixed(0));
  setEl('stat-cod', cod);
  setEl('stat-fulfilled', fulfilled);
  setEl('stat-unshipped', orders.filter(function(o) { return o.fulfillment_status !== 'fulfilled'; }).length);
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#666;">No orders found.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(function(o) {
    const name = o.customer ? ((o.customer.first_name||'') + ' ' + (o.customer.last_name||'')).trim() : 'Guest';
    const city = o.shipping_address ? (o.shipping_address.city||'') : '';
    const date = new Date(o.created_at).toLocaleString('en-IN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const payBadge = o.financial_status === 'paid' ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-pending">COD</span>';
    const fulBadge = o.fulfillment_status === 'fulfilled' ? '<span class="badge badge-fulfilled">Fulfilled</span>' : '<span class="badge badge-unfulfilled">Unfulfilled</span>';
    const items = (o.line_items||[]).length;
    const phone = o.customer ? (o.customer.phone||(o.billing_address&&o.billing_address.phone)||'-') : '-';
    return '<tr onclick="openOrderDrawer(' + o.id + ')" style="cursor:pointer;">' +
      '<td><b style="color:#1a73e8;">' + esc(o.name) + '</b></td>' +
      '<td style="color:#666;font-size:13px;">' + esc(date) + '</td>' +
      '<td>' + esc(name) + '</td>' +
      '<td style="color:#666;">' + esc(city) + '</td>' +
      '<td style="font-weight:600;">Rs.' + parseFloat(o.total_price).toFixed(2) + '</td>' +
      '<td>' + payBadge + '</td>' +
      '<td>' + fulBadge + '</td>' +
      '<td>' + items + ' item' + (items!==1?'s':'') + '</td>' +
      '<td style="color:#666;font-size:13px;">' + esc(phone) + '</td>' +
      '</tr>';
  }).join('');
}

window.setStatusFilter = function(status, btn) {
  document.querySelectorAll('.filter-tab').forEach(function(t) { if(t.closest('#page-orders')) t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  loadOrders();
};

window.filterOrdersLocal = function(q) {
  if (!q) { renderOrdersTable(allOrders); return; }
  const filtered = allOrders.filter(function(o) {
    const n = o.customer ? ((o.customer.first_name||'')+(o.customer.last_name||'')).toLowerCase() : '';
    return n.includes(q.toLowerCase()) || (o.name||'').toLowerCase().includes(q.toLowerCase());
  });
  renderOrdersTable(filtered);
};

window.openOrderDrawer = async function(orderId) {
  const drawer = document.getElementById('order-drawer');
  const overlay = document.getElementById('order-drawer-overlay');
  const body = document.getElementById('drawer-body');
  if (!drawer) return;
  if (overlay) overlay.style.display = 'block';
  drawer.style.display = 'flex';
  if (body) body.innerHTML = '<div style="padding:32px;text-align:center;color:#666;">Loading...</div>';
  try {
    const o = await api('/orders/' + orderId);
    const titleEl = document.getElementById('drawer-order-title');
    if (titleEl) titleEl.textContent = o.name;
    const customerName = o.customer ? ((o.customer.first_name||'')+' '+(o.customer.last_name||'')).trim() : 'Guest';
    const phone = o.customer ? (o.customer.phone||(o.billing_address&&o.billing_address.phone)||'') : '';
    const addrParts = o.shipping_address ? [o.shipping_address.address1, o.shipping_address.address2, o.shipping_address.city, o.shipping_address.province, o.shipping_address.zip].filter(Boolean) : [];
    const fulfillment = o.fulfillments && o.fulfillments.length > 0 ? o.fulfillments[0] : null;
    const tracking = fulfillment ? fulfillment.tracking_number : null;
    const trackingCo = fulfillment ? (fulfillment.tracking_company||'Courier') : null;
    const trackingUrl = fulfillment ? fulfillment.tracking_url : null;
    const payBadge = o.financial_status==='paid' ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-pending">COD Pending</span>';
    const fulBadge = o.fulfillment_status==='fulfilled' ? '<span class="badge badge-fulfilled">Fulfilled</span>' : '<span class="badge badge-unfulfilled">Unfulfilled</span>';
    const lineItemsHtml = (o.line_items||[]).map(function(li) {
      return '<tr><td>'+esc(li.title)+(li.variant_title?' ('+esc(li.variant_title)+')':'')+'</td><td>x'+li.quantity+'</td><td style="text-align:right;">Rs.'+parseFloat(li.price).toFixed(2)+'</td></tr>';
    }).join('');
    if (body) body.innerHTML =
      '<div class="drawer-section">' +
      '<div style="margin-bottom:8px;">'+payBadge+' '+fulBadge+'</div>' +
      '<div class="detail-row"><span class="detail-label">Order#</span><span>'+esc(o.name)+'</span></div>' +
      '<div class="detail-row"><span class="detail-label">Date</span><span>'+new Date(o.created_at).toLocaleString('en-IN')+'</span></div>' +
      '<div class="detail-row"><span class="detail-label">Payment</span><span>'+esc(o.financial_status||'-')+' via '+esc(o.payment_gateway||'-')+'</span></div>' +
      '</div>' +
      '<div class="drawer-section">' +
      '<div class="detail-row"><span class="detail-label">Customer</span><span>'+esc(customerName)+'</span></div>' +
      (phone?'<div class="detail-row"><span class="detail-label">Phone</span><span>+'+esc(phone)+'</span></div>':'') +
      (addrParts.length?'<div class="detail-row"><span class="detail-label">Address</span><span style="font-size:12px;">'+esc(addrParts.join(', '))+'</span></div>':'') +
      '</div>' +
      '<div class="drawer-section">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="border-bottom:1px solid #eee;"><th style="text-align:left;">Item</th><th>Qty</th><th style="text-align:right;">Price</th></tr></thead><tbody>'+lineItemsHtml+'</tbody></table>' +
      '<div class="detail-row" style="margin-top:8px;border-top:1px solid #eee;padding-top:6px;"><b>Total</b><b style="color:#1a73e8;">Rs.'+parseFloat(o.total_price).toFixed(2)+'</b></div>' +
      '</div>' +
      (tracking?'<div class="drawer-section"><b>Tracking:</b> '+esc(trackingCo)+' - '+esc(tracking)+(trackingUrl?'<br><a href="'+esc(trackingUrl)+'" target="_blank">Track Order</a>':'')+'</div>':'') +
      (phone?'<div class="drawer-section"><button onclick="switchPage("chats")" style="width:100%;padding:10px;background:#25D366;color:#fff;border:none;border-radius:6px;cursor:pointer;">Open WhatsApp Chat</button></div>':'');
  } catch(e) {
    if (body) body.innerHTML = '<div style="padding:24px;color:#d82c0d;">Failed to load order.</div>';
  }
};

window.closeOrderDrawer = function() {
  const drawer = document.getElementById('order-drawer');
  const overlay = document.getElementById('order-drawer-overlay');
  if (drawer) drawer.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
};

// ===== INVENTORY =====
let allInventory = [];
let invStatusFilter = 'all';

async function loadInventory() {
  const grid = document.getElementById('inv-grid');
  if (grid) grid.innerHTML = '<div style="text-align:center;padding:60px;color:#8c9196;">Loading inventory from Shopify...</div>';
  try {
    const data = await api('/inventory?limit=250');
    allInventory = data.items || [];
    renderInventoryStats(allInventory);
    renderInventoryGrid(allInventory);
    const el = document.getElementById('inv-last-refresh');
    if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');
  } catch(e) {
    if (grid) grid.innerHTML = '<div style="text-align:center;padding:60px;color:#d82c0d;">Failed to load inventory: ' + esc(e.message) + '</div>';
  }
}

function renderInventoryStats(items) {
  const products = new Set(items.map(function(i) { return i.product_id; })).size;
  const totalAvail = items.reduce(function(s,i) { return s + (i.available_qty||0); }, 0);
  const totalBooked = items.reduce(function(s,i) { return s + (i.booked_qty||0); }, 0);
  const totalNet = items.reduce(function(s,i) { return s + (i.net_qty||0); }, 0);
  const setEl = function(id,v) { const el = document.getElementById(id); if(el) el.textContent = v; };
  setEl('inv-stat-products', products);
  setEl('inv-stat-variants', items.length);
  setEl('inv-stat-available', totalAvail);
  setEl('inv-stat-booked', totalBooked);
  setEl('inv-stat-net', totalNet);
}

function renderInventoryGrid(items) {
  const grid = document.getElementById('inv-grid');
  if (!grid) return;
  if (!items || items.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:60px;color:#8c9196;">No inventory items found.</div>';
    return;
  }
  grid.innerHTML = items.map(function(item) {
    const imgHtml = item.image
      ? '<img src="' + esc(item.image) + '" alt="' + esc(item.product_title) + '" class="inv-card-img" onerror="this.style.display=\'none\'""/>'
      : '<div class="inv-card-img-placeholder"><span style="font-size:32px;">👕</span></div>';
    const netClass = item.net_qty <= 0 ? 'inv-qty-out' : item.net_qty <= 5 ? 'inv-qty-low' : 'inv-qty-ok';
    const netLabel = item.net_qty <= 0 ? 'Out of Stock' : item.net_qty <= 5 ? 'Low Stock' : 'In Stock';
    const skuHtml = item.sku ? '<div class="inv-sku">SKU: ' + esc(item.sku) + '</div>' : '';
    const variantHtml = (item.variant_title && item.variant_title !== 'Default Title') ? '<div class="inv-variant">' + esc(item.variant_title) + '</div>' : '';
    return '<div class="inv-card">' +
      '<div class="inv-card-image">' + imgHtml + '</div>' +
      skuHtml +
      '<div class="inv-card-title">' + esc(item.product_title) + '</div>' +
      variantHtml +
      '<div class="inv-card-price">Rs.' + parseFloat(item.price||0).toFixed(2) + '</div>' +
      '<div class="inv-stock-row">' +
        '<div class="inv-stock-block inv-avail">' +
          '<div class="inv-stock-num">' + item.available_qty + '</div>' +
          '<div class="inv-stock-label">Available</div>' +
        '</div>' +
        '<div class="inv-stock-divider"></div>' +
        '<div class="inv-stock-block inv-booked">' +
          '<div class="inv-stock-num">' + item.booked_qty + '</div>' +
          '<div class="inv-stock-label">Booked</div>' +
        '</div>' +
        '<div class="inv-stock-divider"></div>' +
        '<div class="inv-stock-block inv-net ' + netClass + '">' +
          '<div class="inv-stock-num">' + item.net_qty + '</div>' +
          '<div class="inv-stock-label">Net</div>' +
        '</div>' +
      '</div>' +
      '<div class="inv-status-badge ' + netClass + '">' + netLabel + '</div>' +
    '</div>';
  }).join('');
}

window.filterInventory = function(q) {
  let filtered = allInventory;
  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(function(i) {
      return (i.product_title||'').toLowerCase().includes(lower) ||
             (i.sku||'').toLowerCase().includes(lower) ||
             (i.variant_title||'').toLowerCase().includes(lower);
    });
  }
  filtered = applyInvStatusFilter(filtered);
  renderInventoryGrid(filtered);
};

window.filterInvStatus = function(status, btn) {
  invStatusFilter = status;
  document.querySelectorAll('#page-inventory .filter-tab').forEach(function(t) { t.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  const q = (document.getElementById('inv-search')||{value:''}).value;
  window.filterInventory(q);
};

function applyInvStatusFilter(items) {
  if (invStatusFilter === 'low') return items.filter(function(i) { return i.net_qty > 0 && i.net_qty <= 5; });
  if (invStatusFilter === 'out') return items.filter(function(i) { return i.net_qty <= 0; });
  if (invStatusFilter === 'booked') return items.filter(function(i) { return i.booked_qty > 0; });
  return items;
      }

// ===== CHATS =====
let activePhone = null;

async function loadChats() {
  const el = document.getElementById('conv-list');
  if (!el) return;
  el.innerHTML = '<div style="padding:24px;color:#666;">Loading chats...</div>';
  try {
    const convs = await api('/conversations');
    if (!convs || convs.length === 0) {
      el.innerHTML = '<div style="padding:24px;color:#666;">No WhatsApp conversations yet.</div>';
      return;
    }
    el.innerHTML = convs.map(function(c) {
      const last = c.lastMessage ? esc((c.lastMessage.content||'').substring(0,60)) : '';
      const time = c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString('en-IN') : '';
      return '<div class="chat-item" onclick="loadConversation(' + JSON.stringify(c.phone) + ')">' +
        '<div style="width:36px;height:36px;background:#1e2a4a;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;flex-shrink:0;">'+esc((c.phone||'?').slice(-2))+'</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">+'+esc(c.phone)+'</div><div style="font-size:12px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+last+'</div></div>' +
        '<div style="font-size:11px;color:#999;">'+esc(time)+'</div>' +
        '</div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="padding:24px;color:#d82c0d;">Error loading chats.</div>';
  }
}

window.loadConversation = async function(phone) {
  activePhone = phone;
  const activeArea = document.getElementById('chat-active-area');
  const emptyState = document.getElementById('chat-empty-state');
  const msgs = document.getElementById('chat-messages');
  const title = document.getElementById('chat-header-title');
  if (activeArea) activeArea.style.display = 'flex';
  if (emptyState) emptyState.style.display = 'none';
  if (title) title.textContent = '+' + phone;
  if (!msgs) return;
  msgs.innerHTML = '<div style="padding:16px;color:#666;">Loading messages...</div>';
  try {
    const conv = await api('/conversations/' + phone);
    const messages = conv.messages || [];
    msgs.innerHTML = messages.map(function(m) {
      const isUser = m.role === 'user';
      return '<div class="msg '+(isUser?'user':'assistant')+'">' +
        '<div class="bubble">'+esc(m.content||'')+'</div>' +
        '<div class="meta">'+(m.timestamp?new Date(m.timestamp).toLocaleTimeString('en-IN'):'')+'</div>' +
        '</div>';
    }).join('');
    msgs.scrollTop = msgs.scrollHeight;
  } catch(e) {
    msgs.innerHTML = '<div style="padding:16px;color:#d82c0d;">Error loading messages.</div>';
  }
};

window.sendReply = async function() {
  const input = document.getElementById('chat-reply');
  if (!input || !activePhone) return;
  const message = input.value.trim();
  if (!message) return;
  try {
    await api('/send-text', { method: 'POST', body: JSON.stringify({ to: activePhone, message: message }) });
    input.value = '';
    window.loadConversation(activePhone);
  } catch(e) { alert('Failed to send: ' + e.message); }
};

// ===== COD VERIFICATIONS =====
async function loadVerifications() {
  const el = document.getElementById('verif-list');
  if (!el) return;
  el.innerHTML = '<div style="padding:24px;color:#666;">Loading...</div>';
  try {
    const verifications = await api('/verifications');
    if (!verifications || verifications.length === 0) {
      el.innerHTML = '<div style="padding:24px;color:#666;">No pending COD verifications.</div>';
      return;
    }
    el.innerHTML = verifications.map(function(v) {
      const statusColor = v.status==='confirmed'?'#2e7d32':v.status==='cancelled'?'#d82c0d':'#b57c00';
      return '<div class="g-card" style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;"><b>'+esc(v.orderId||'')+'</b><span style="color:'+statusColor+';">'+esc(v.status||'pending')+'</span></div>' +
        '<div style="margin:4px 0;color:#666;">'+esc(v.customerName||'')+' +'+esc(v.phone||'')+'</div>' +
        '<div style="font-weight:600;">Rs.'+esc(String(v.amount||''))+'</div>' +
        (v.status==='pending'?'<button onclick="resendVerification('+JSON.stringify(v.orderId)+')" class="btn btn-sm" style="margin-top:8px;">Resend</button>':'') +
        '</div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="padding:24px;color:#d82c0d;">Error loading verifications.</div>';
  }
}

window.resendVerification = async function(orderId) {
  try {
    await api('/verifications/' + orderId + '/resend', { method: 'POST' });
    alert('Verification message resent!');
  } catch(e) { alert('Error: ' + e.message); }
};

// ===== TEMPLATES =====
window.sendTemplate = async function() {
  const name = (document.getElementById('tpl-name')||{value:''}).value.trim();
  const phones = (document.getElementById('tpl-recipients')||{value:''}).value.trim();
  const lang = (document.getElementById('tpl-lang')||{value:'en'}).value.trim();
  const resultEl = document.getElementById('template-result');
  if (!name || !phones) { if(resultEl){resultEl.textContent='Fill template name and phone numbers';resultEl.style.color='#d82c0d';} return; }
  const toList = phones.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
  try {
    await api('/send-template', { method: 'POST', body: JSON.stringify({ to: toList, templateName: name, languageCode: lang, components: [] }) });
    if(resultEl){ resultEl.textContent='Sent to '+toList.length+' recipient(s)!'; resultEl.style.color='#2e7d32'; }
  } catch(e) {
    if(resultEl){ resultEl.textContent='Error: '+e.message; resultEl.style.color='#d82c0d'; }
  }
};

// ===== SETTINGS =====
function loadSettings() {
  const c = document.getElementById('url-order-created');
  const f = document.getElementById('url-order-fulfilled');
  if (c) c.textContent = window.location.origin + '/shopify/webhook';
  if (f) f.textContent = window.location.origin + '/webhook';
}

// ===== INIT =====
function initApp() {
  window.switchPage('orders');
  loadSettings();
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function() {
      const page = item.getAttribute('data-page');
      if (page) window.switchPage(page);
    });
  });
  document.querySelectorAll('.mobile-tabbar button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const page = btn.getAttribute('data-page');
      if (page) window.switchPage(page);
    });
  });
  const sendBtn = document.getElementById('btn-send-reply');
  if (sendBtn) sendBtn.addEventListener('click', window.sendReply);
  const chatReply = document.getElementById('chat-reply');
  if (chatReply) chatReply.addEventListener('keypress', function(e) { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); window.sendReply(); } });
  const sendTemplBtn = document.getElementById('btn-send-template');
  if (sendTemplBtn) sendTemplBtn.addEventListener('click', window.sendTemplate);
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', function() { localStorage.removeItem('wa_admin_password'); location.reload(); });
}

// Start
document.addEventListener('DOMContentLoaded', function() {
  const loginBtn = document.getElementById('btn-login');
  const loginPw = document.getElementById('password');
  if (loginBtn) loginBtn.addEventListener('click', handleLogin);
  if (loginPw) loginPw.addEventListener('keypress', function(e) { if (e.key==='Enter') handleLogin(); });
  const pw = getPassword();
  if (pw) {
    hideLogin();
    initApp();
  } else {
    showLogin();
  }
});
