// ==== HELPERS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function getPassword() { return localStorage.getItem('wa_admin_password') || ''; }
async function api(path, opts) {
  if (!opts) opts = {};
  const res = await fetch('/api' + path, { method: opts.method || 'GET', headers: Object.assign({'Content-Type':'application/json','X-Admin-Password':getPassword()}, opts.headers || {}), body: opts.body });
  if (res.status === 401) { localStorage.removeItem('wa_admin_password'); showLogin('Session expired.'); throw new Error('Unauthorized'); }
  return res.json();
}
function showLogin(err) { const s=document.getElementById('app-shell'),l=document.getElementById('view-login'); if(s)s.style.display='none'; if(l)l.style.display='flex'; if(err){const e=document.getElementById('login-error');if(e){e.textContent=err;e.style.display='block';}} }
function hideLogin() { const s=document.getElementById('app-shell'),l=document.getElementById('view-login'); if(l)l.style.display='none'; if(s)s.style.display='flex'; }
async function handleLogin() {
  const pwEl=document.getElementById('password'); if(!pwEl)return; const pw=pwEl.value.trim(); if(!pw)return;
  try { const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})}); const data=await res.json();
    if(res.ok&&data.success){localStorage.setItem('wa_admin_password',pw);hideLogin();initApp();}
    else{const e=document.getElementById('login-error');if(e){e.textContent=data.error||'Wrong password';e.style.display='block';}}
  }catch(ex){const e=document.getElementById('login-error');if(e){e.textContent='Connection error.';e.style.display='block';}}
}
// ===== NAVIGATION =====
let currentPage = 'orders';
window.switchPage = function(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(function(s){s.style.display='none';});
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  const section=document.getElementById('page-'+page); if(section)section.style.display='block';
  const navItem=document.querySelector('.nav-item[data-page="'+page+'"]'); if(navItem)navItem.classList.add('active');
  const titles={orders:'Orders',chats:'WhatsApp Chats',cod:'COD Verifications',templates:'Send Templates',inventory:'Inventory',dispatch:'Dispatch & Packing',settings:'Settings'};
  const titleEl=document.getElementById('topbar-title'); if(titleEl)titleEl.textContent=titles[page]||page;
  if(page==='orders')loadOrders(); if(page==='chats')loadChats(); if(page==='cod')loadVerifications();
  if(page==='inventory')loadInventory(); if(page==='dispatch')loadDispatchQueue();
};
window.handleTopbarRefresh=function(){if(currentPage==='orders')loadOrders();if(currentPage==='inventory')loadInventory();if(currentPage==='dispatch')loadDispatchQueue();};

// ===== ORDERS =====
let allOrders=[];
async function loadOrders(){
  const tbody=document.getElementById('orders-tbody');
  if(tbody)tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:24px;color:#666;">Loading orders...</td></tr>';
  try{
    const limit=(document.getElementById('filter-limit')||{value:'50'}).value||50;
    const fromDate=document.getElementById('filter-date-from')?document.getElementById('filter-date-from').value:'';
          const toDate=document.getElementById('filter-date-to')?document.getElementById('filter-date-to').value:'';
          let ordersUrl='/orders?limit='+limit;
          if(fromDate)ordersUrl+='&created_at_min='+fromDate+'T00:00:00';
          if(toDate)ordersUrl+='&created_at_max='+toDate+'T23:59:59';
          const orders=await api(ordersUrl);
    allOrders=orders; renderOrdersTable(orders); renderStats(orders);
    const lr=document.getElementById('orders-last-refresh'); if(lr)lr.textContent='Updated: '+new Date().toLocaleTimeString('en-IN');
  }catch(e){if(tbody)tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:24px;color:#d82c0d;">Failed to load orders.</td></tr>';}
}
function renderStats(orders){
  const total=orders.length, revenue=orders.reduce(function(s,o){return s+parseFloat(o.total_price||0);},0),
    cod=orders.filter(function(o){return o.financial_status!=='paid';}).length,
    fulfilled=orders.filter(function(o){return o.fulfillment_status==='fulfilled';}).length;
  const setEl=function(id,val){const el=document.getElementById(id);if(el)el.textContent=val;};
  setEl('stat-total',total); setEl('stat-revenue','Rs.'+revenue.toFixed(0)); setEl('stat-cod',cod);
  setEl('stat-fulfilled',fulfilled); setEl('stat-unshipped',orders.filter(function(o){return o.fulfillment_status!=='fulfilled';}).length);
}
function renderOrdersTable(orders){
  const tbody=document.getElementById('orders-tbody'); if(!tbody)return;
  if(!orders||orders.length===0){tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:24px;color:#666;">No orders found.</td></tr>';return;}
  tbody.innerHTML=orders.map(function(o){
    const name=o.customer?((o.customer.first_name||'')+' '+(o.customer.last_name||'')).trim():'Guest';
    const city=o.shipping_address?(o.shipping_address.city||''):'';
    const date=new Date(o.created_at).toLocaleString('en-IN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const payBadge=o.financial_status==='paid'?'<span class="badge badge-paid">Paid</span>':'<span class="badge badge-pending">COD</span>';
    const fulBadge=o.fulfillment_status==='fulfilled'?'<span class="badge badge-fulfilled">Fulfilled</span>':'<span class="badge badge-unfulfilled">Unfulfilled</span>';
    const items=(o.line_items||[]).length;
    const phone=o.customer?(o.customer.phone||(o.billing_address&&o.billing_address.phone)||'-'):'-';
    return '<tr onclick="openOrderDrawer('+o.id+')" style="cursor:pointer;">'+
      '<td><b style="color:#1a73e8;">'+esc(o.name)+'</b></td>'+
      '<td style="color:#666;font-size:13px;">'+esc(date)+'</td>'+
      '<td>'+esc(name)+'</td><td style="color:#666;">'+esc(city)+'</td>'+
      '<td style="font-weight:600;">Rs.'+parseFloat(o.total_price).toFixed(2)+'</td>'+
      '<td>'+payBadge+'</td><td>'+fulBadge+'</td>'+
      '<td>'+items+' item'+(items!==1?'s':'')+'</td>'+
      '<td style="color:#666;font-size:13px;">'+esc(phone)+'</td></tr>';
  }).join('');
}
window.setStatusFilter=function(status,btn){document.querySelectorAll('.filter-tab').forEach(function(t){if(t.closest('#page-orders'))t.classList.remove('active');});if(btn)btn.classList.add('active');loadOrders();};
window.filterOrdersLocal=function(q){if(!q){renderOrdersTable(allOrders);return;}const filtered=allOrders.filter(function(o){const n=o.customer?((o.customer.first_name||'')+(o.customer.last_name||'')).toLowerCase():'';return n.includes(q.toLowerCase())||(o.name||'').toLowerCase().includes(q.toLowerCase());});renderOrdersTable(filtered);};
window.applyDateFilter=function(){const fromEl=document.getElementById('filter-date-from');const toEl=document.getElementById('filter-date-to');const clearBtn=document.getElementById('btn-clear-date');const hasFilter=(fromEl&&fromEl.value)||(toEl&&toEl.value);if(clearBtn)clearBtn.style.display=hasFilter?'inline-flex':'none';loadOrders();};
window.clearDateFilter=function(){const fromEl=document.getElementById('filter-date-from');const toEl=document.getElementById('filter-date-to');const clearBtn=document.getElementById('btn-clear-date');if(fromEl)fromEl.value='';if(toEl)toEl.value='';if(clearBtn)clearBtn.style.display='none';loadOrders();};
window.openOrderDrawer=async function(orderId){
  const drawer=document.getElementById('order-drawer'),overlay=document.getElementById('order-drawer-overlay'),body=document.getElementById('drawer-body');
  if(!drawer)return; if(overlay)overlay.style.display='block'; drawer.style.display='flex';
  if(body)body.innerHTML='<div style="padding:32px;text-align:center;color:#666;">Loading...</div>';
  try{
    const o=await api('/orders/'+orderId);
    const titleEl=document.getElementById('drawer-order-title'); if(titleEl)titleEl.textContent=o.name;
    const customerName=o.customer?((o.customer.first_name||'')+' '+(o.customer.last_name||'')).trim():'Guest';
    const phone=o.customer?(o.customer.phone||(o.billing_address&&o.billing_address.phone)||''):'';
    const addrParts=o.shipping_address?[o.shipping_address.address1,o.shipping_address.address2,o.shipping_address.city,o.shipping_address.province,o.shipping_address.zip].filter(Boolean):[];
    const fulfillment=o.fulfillments&&o.fulfillments.length>0?o.fulfillments[0]:null;
    const tracking=fulfillment?fulfillment.tracking_number:null, trackingCo=fulfillment?(fulfillment.tracking_company||'Courier'):null, trackingUrl=fulfillment?fulfillment.tracking_url:null;
    const payBadge=o.financial_status==='paid'?'<span class="badge badge-paid">Paid</span>':'<span class="badge badge-pending">COD Pending</span>';
    const fulBadge=o.fulfillment_status==='fulfilled'?'<span class="badge badge-fulfilled">Fulfilled</span>':'<span class="badge badge-unfulfilled">Unfulfilled</span>';
    const lineItemsHtml=(o.line_items||[]).map(function(li){return '<tr><td>'+esc(li.title)+(li.variant_title?' ('+esc(li.variant_title)+')':'')+'</td><td>x'+li.quantity+'</td><td style="text-align:right;">Rs.'+parseFloat(li.price).toFixed(2)+'</td></tr>';}).join('');
    if(body)body.innerHTML=
      '<div class="drawer-section"><div style="margin-bottom:8px;">'+payBadge+' '+fulBadge+'</div>'+
      '<div class="detail-row"><span class="detail-label">Order#</span><span>'+esc(o.name)+'</span></div>'+
      '<div class="detail-row"><span class="detail-label">Date</span><span>'+new Date(o.created_at).toLocaleString('en-IN')+'</span></div>'+
      '<div class="detail-row"><span class="detail-label">Payment</span><span>'+esc(o.financial_status||'-')+' via '+esc(o.payment_gateway||'-')+'</span></div></div>'+
      '<div class="drawer-section">'+
      '<div class="detail-row"><span class="detail-label">Customer</span><span>'+esc(customerName)+'</span></div>'+
      (phone?'<div class="detail-row"><span class="detail-label">Phone</span><span>+'+esc(phone)+'</span></div>':'')+
      (addrParts.length?'<div class="detail-row"><span class="detail-label">Address</span><span style="font-size:12px;">'+esc(addrParts.join(', '))+'</span></div>':'')+
      '</div>'+
      '<div class="drawer-section"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="border-bottom:1px solid #eee;"><th style="text-align:left;">Item</th><th>Qty</th><th style="text-align:right;">Price</th></tr></thead><tbody>'+lineItemsHtml+'</tbody></table>'+
      '<div class="detail-row" style="margin-top:8px;border-top:1px solid #eee;padding-top:6px;"><b>Total</b><b style="color:#1a73e8;">Rs.'+parseFloat(o.total_price).toFixed(2)+'</b></div></div>'+
      (tracking?'<div class="drawer-section"><b>Tracking:</b> '+esc(trackingCo)+' - '+esc(tracking)+(trackingUrl?'<br><a href="'+esc(trackingUrl)+'" target="_blank">Track Order</a>':'')+'</div>':'')+
      '<div class="drawer-section"><button onclick="openPackingSlip('+orderId+')" style="width:100%;padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Print Packing Slip</button></div>';
  }catch(e){if(body)body.innerHTML='<div style="padding:24px;color:#d82c0d;">Failed to load order.</div>';}
};
window.closeOrderDrawer=function(){const d=document.getElementById('order-drawer'),o=document.getElementById('order-drawer-overlay');if(d)d.style.display='none';if(o)o.style.display='none';};
// ===== INVENTORY =====
let allInventory=[],invStatusFilter='all',allTableRows=[],invViewMode='card';
async function loadInventory(){
  const grid=document.getElementById('inv-grid');
  if(grid)grid.innerHTML='<div style="text-align:center;padding:60px;color:#8c9196;">Loading inventory from Shopify...</div>';
  try{
    const data=await api('/inventory?limit=250'); allInventory=data.items||[];
    renderInventoryStats(allInventory); injectInvViewButtons();
    if(invViewMode==='table'){loadTableView();}else{renderInventoryGrid(allInventory);}
    const el=document.getElementById('inv-last-refresh'); if(el)el.textContent='Updated: '+new Date().toLocaleTimeString('en-IN');
  }catch(e){if(grid)grid.innerHTML='<div style="text-align:center;padding:60px;color:#d82c0d;">Failed to load inventory: '+esc(e.message)+'</div>';}
}
function renderInventoryStats(items){
  const products=new Set(items.map(function(i){return i.product_id;})).size;
  const totalAvail=items.reduce(function(s,i){return s+(i.available_qty||0);},0);
  const totalBooked=items.reduce(function(s,i){return s+(i.booked_qty||0);},0);
  const totalNet=items.reduce(function(s,i){return s+(i.net_qty||0);},0);
  const setEl=function(id,v){const el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('inv-stat-products',products); setEl('inv-stat-variants',items.length);
  setEl('inv-stat-available',totalAvail); setEl('inv-stat-booked',totalBooked); setEl('inv-stat-net',totalNet);
}
function renderInventoryGrid(items){
  const grid=document.getElementById('inv-grid'); if(!grid)return; grid.style.display='';
  if(!items||items.length===0){grid.innerHTML='<div style="text-align:center;padding:60px;color:#8c9196;">No inventory items found.</div>';return;}
  grid.innerHTML=items.map(function(item){
    const imgHtml=item.image?'<img src="'+esc(item.image)+'" alt="'+esc(item.product_title)+'" class="inv-card-img" onerror="this.hidden=1">':'<div class="inv-card-img-placeholder"><span style="font-size:32px;">&#x1F455;</span></div>';
    const netClass=item.net_qty<=0?'inv-qty-out':item.net_qty<=5?'inv-qty-low':'inv-qty-ok';
    const netLabel=item.net_qty<=0?'Out of Stock':item.net_qty<=5?'Low Stock':'In Stock';
    const skuHtml=item.sku?'<div class="inv-sku">SKU: '+esc(item.sku)+'</div>':'';
    const variantHtml=(item.variant_title&&item.variant_title!=='Default Title')?'<div class="inv-variant">'+esc(item.variant_title)+'</div>':'';
    return '<div class="inv-card"><div class="inv-card-image">'+imgHtml+'</div>'+skuHtml+'<div class="inv-card-title">'+esc(item.product_title)+'</div>'+variantHtml+'<div class="inv-card-price">Rs.'+parseFloat(item.price||0).toFixed(2)+'</div>'+
      '<div class="inv-stock-row"><div class="inv-stock-block inv-avail"><div class="inv-stock-num">'+item.available_qty+'</div><div class="inv-stock-label">Available</div></div>'+
      '<div class="inv-stock-divider"></div><div class="inv-stock-block inv-booked"><div class="inv-stock-num">'+item.booked_qty+'</div><div class="inv-stock-label">Booked</div></div>'+
      '<div class="inv-stock-divider"></div><div class="inv-stock-block inv-net '+netClass+'"><div class="inv-stock-num">'+item.net_qty+'</div><div class="inv-stock-label">Net</div></div></div>'+
      '<div class="inv-status-badge '+netClass+'">'+netLabel+'</div></div>';
  }).join('');
}
async function loadTableView(){
  const grid=document.getElementById('inv-grid');
  if(grid)grid.innerHTML='<div style="text-align:center;padding:60px;color:#8c9196;">Loading table view...</div>';
  try{const data=await api('/inventory/table?limit=250');allTableRows=data.rows||[];renderInventoryTable(allTableRows);}
  catch(e){if(grid)grid.innerHTML='<div style="text-align:center;padding:60px;color:#d82c0d;">Failed to load table: '+esc(e.message)+'</div>';}
}
window.switchInvView=function(mode,btn){
  invViewMode=mode;
  document.querySelectorAll('.inv-view-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  if(mode==='table'){loadTableView();}else{renderInventoryGrid(applyInvStatusFilter(allInventory));}
};
function renderInventoryTable(rows){
  const grid=document.getElementById('inv-grid'); if(!grid)return; grid.style.display='block';
  if(!rows||rows.length===0){grid.innerHTML='<div style="text-align:center;padding:60px;color:#8c9196;">No inventory items found.</div>';return;}
  const sizes=['M','L','XL','2XL','3XL','4XL','5XL'];
  const cs='text-align:center;padding:6px 4px;font-size:12px;border:1px solid #e1e4e8;min-width:36px;';
  const hs='text-align:center;padding:6px 4px;font-size:11px;font-weight:600;background:#f6f8fa;border:1px solid #e1e4e8;white-space:nowrap;';
  const html='<div style="overflow-x:auto;width:100%;"><table style="border-collapse:collapse;font-size:12px;width:100%;min-width:900px;">'+
    '<thead><tr><th rowspan="2" style="'+hs+'min-width:40px;">Sr.<br>No.</th><th rowspan="2" style="'+hs+'min-width:60px;">Photo</th><th rowspan="2" style="'+hs+'min-width:60px;">SKU</th>'+
    '<th colspan="7" style="'+hs+'background:#e8f0fe;border-bottom:2px solid #1a73e8;">Full Sleeve</th>'+
    '<th colspan="7" style="'+hs+'background:#fce8e6;border-bottom:2px solid #d93025;">Half Sleeve</th>'+
    '<th rowspan="2" style="'+hs+'min-width:60px;">HSN</th><th rowspan="2" style="'+hs+'min-width:70px;">Costing<br>Avg.</th></tr><tr>'+
    sizes.map(function(s){return '<th style="'+hs+'background:#e8f0fe;">'+s+'</th>';}).join('')+
    sizes.map(function(s){return '<th style="'+hs+'background:#fce8e6;">'+s+'</th>';}).join('')+
    '</tr></thead><tbody>'+
    rows.map(function(row){
      const imgH=row.image?'<img src="'+esc(row.image)+'" style="width:48px;height:48px;object-fit:cover;border-radius:4px;" onerror="this.hidden=1">':'<div style="width:48px;height:48px;background:#f6f8fa;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;">&#x1F455;</div>';
      const fc=sizes.map(function(s){const v=row.full[s];const t=v===null?'-':v;const c=v===null?'#999':v<=0?'#d82c0d':v<=5?'#b57c00':'#2e7d32';return '<td style="'+cs+'color:'+c+';font-weight:'+(v!==null?'600':'400')+';">'+t+'</td>';}).join('');
      const hc=sizes.map(function(s){const v=row.half[s];const t=v===null?'-':v;const c=v===null?'#999':v<=0?'#d82c0d':v<=5?'#b57c00':'#2e7d32';return '<td style="'+cs+'color:'+c+';font-weight:'+(v!==null?'600':'400')+';">'+t+'</td>';}).join('');
      return '<tr style="border-bottom:1px solid #e1e4e8;"><td style="'+cs+'font-weight:600;">'+row.sr_no+'</td><td style="'+cs+'">'+imgH+'</td><td style="'+cs+'font-size:11px;color:#1a73e8;font-weight:600;">'+esc(row.sku)+'</td>'+fc+hc+'<td style="'+cs+'color:#666;">'+esc(String(row.hsn||'-'))+'</td><td style="'+cs+'font-weight:600;">Rs.'+parseFloat(row.costing_avg||0).toFixed(0)+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  grid.innerHTML=html;
}
function injectInvViewButtons(){
  if(document.querySelector('.inv-view-btn'))return;
  const fb=document.querySelector('#page-inventory .filter-bar'); if(!fb)return;
  const cardsBtn=document.createElement('button'); cardsBtn.className='filter-tab inv-view-btn active'; cardsBtn.style.fontSize='11px'; cardsBtn.textContent='☷ Cards';
  cardsBtn.addEventListener('click',function(){window.switchInvView('card',cardsBtn);});
  const tableBtn=document.createElement('button'); tableBtn.className='filter-tab inv-view-btn'; tableBtn.style.fontSize='11px'; tableBtn.textContent='☷ Table';
  tableBtn.addEventListener('click',function(){window.switchInvView('table',tableBtn);});
  const wrapper=document.createElement('div'); wrapper.style.cssText='display:flex;gap:4px;margin-left:8px;';
  wrapper.appendChild(cardsBtn); wrapper.appendChild(tableBtn);
  const refresh=fb.querySelector('.refresh-info'); if(refresh){fb.insertBefore(wrapper,refresh);}else{fb.appendChild(wrapper);}
}
window.filterInventory=function(q){let filtered=allInventory;if(q){const lower=q.toLowerCase();filtered=filtered.filter(function(i){return(i.product_title||'').toLowerCase().includes(lower)||(i.sku||'').toLowerCase().includes(lower)||(i.variant_title||'').toLowerCase().includes(lower);});}filtered=applyInvStatusFilter(filtered);renderInventoryGrid(filtered);};
window.filterInvStatus=function(status,btn){invStatusFilter=status;document.querySelectorAll('#page-inventory .filter-tab').forEach(function(t){t.classList.remove('active');});if(btn)btn.classList.add('active');const q=(document.getElementById('inv-search')||{value:''}).value;window.filterInventory(q);};
function applyInvStatusFilter(items){if(invStatusFilter==='low')return items.filter(function(i){return i.net_qty>0&&i.net_qty<=5;});if(invStatusFilter==='out')return items.filter(function(i){return i.net_qty<=0;});if(invStatusFilter==='booked')return items.filter(function(i){return i.booked_qty>0;});return items;}
// ===== DISPATCH & PACKING =====
let allDispatchQueue=[],dispatchViewFilter='all',scannedOrderId=null;

async function loadDispatchQueue(){
  const container=document.getElementById('dispatch-queue');
  if(container)container.innerHTML='<div style="text-align:center;padding:40px;color:#8c9196;">Loading packing queue...</div>';
  try{
    const data=await api('/packing/queue'); allDispatchQueue=data.queue||[];
    renderDispatchStats(allDispatchQueue); renderDispatchQueue(allDispatchQueue);
    const el=document.getElementById('disp-last-refresh'); if(el)el.textContent='Updated: '+new Date().toLocaleTimeString('en-IN');
    const badge=document.getElementById('sidebar-dispatch-count');
    if(badge&&allDispatchQueue.length>0){badge.textContent=allDispatchQueue.length;badge.style.display='inline-block';}
  }catch(e){if(container)container.innerHTML='<div style="text-align:center;padding:40px;color:#d82c0d;">Failed to load queue: '+esc(e.message)+'</div>';}
}

function renderDispatchStats(queue){
  const setEl=function(id,v){const el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('disp-stat-pending',queue.length);
  setEl('disp-stat-alteration',queue.filter(function(q){return q.has_alteration;}).length);
  setEl('disp-stat-cod',queue.filter(function(q){return q.payment!=='paid';}).length);
  setEl('disp-stat-prepaid',queue.filter(function(q){return q.payment==='paid';}).length);
}

function renderDispatchQueue(queue){
  const container=document.getElementById('dispatch-queue'); if(!container)return;
  if(!queue||queue.length===0){container.innerHTML='<div style="text-align:center;padding:40px;color:#8c9196;">No pending orders to pack. All caught up!</div>';return;}
  const byCourier={};
  queue.forEach(function(item){if(!byCourier[item.courier])byCourier[item.courier]=[];byCourier[item.courier].push(item);});
  let html='';
  Object.keys(byCourier).forEach(function(courier){
    const items=byCourier[courier], pickupTime=items[0].pickup_time;
    const cc=courier==='Bluedart'?'#1a73e8':courier==='Delhivery'?'#e65100':'#2e7d32';
    html+='<div style="margin-bottom:2px;padding:8px 14px;background:'+cc+';color:#fff;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:10px;">'+
      '<span style="font-size:18px;">&#x1F69A;</span><b style="font-size:14px;">'+esc(courier)+'</b>'+
      '<span style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:20px;font-size:12px;">Pickup: '+esc(pickupTime)+'</span>'+
      '<span style="margin-left:auto;background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:20px;font-size:12px;">'+items.length+' orders</span>'+
      '</div>';
    items.forEach(function(item){
      const payStyle=item.payment==='paid'?'background:#e8f5e9;color:#2e7d32;':'background:#fff8e1;color:#e65100;';
      const payLabel=item.payment==='paid'?'PREPAID':'COD Rs.'+parseFloat(item.total||0).toFixed(0);
      const altBadge=item.has_alteration?'<span style="background:#fce4ec;color:#c62828;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">&#x2702; ALTERATION</span>':'';
      const itemsList=item.line_items.map(function(li){
        return '<div style="display:flex;gap:6px;align-items:center;padding:3px 0;">'+
          '<span style="font-size:10px;background:#f0f0f0;padding:1px 6px;border-radius:4px;">x'+li.qty+'</span>'+
          '<span style="font-size:12px;">'+esc(li.title)+(li.variant?' <span style="color:#666;">('+esc(li.variant)+')</span>':'')+'</span>'+
          (li.sku?'<span style="font-size:10px;color:#999;">SKU:'+esc(li.sku)+'</span>':'')+'</div>';
      }).join('');
      const alterationHtml=item.has_alteration?
        '<div style="background:#fce4ec;border-left:3px solid #c62828;padding:8px 12px;margin-top:8px;border-radius:0 6px 6px 0;">'+
        '<b style="font-size:12px;color:#c62828;">&#x2702; Tailor Instructions:</b>'+
        item.alterations.map(function(a){return '<div style="font-size:12px;margin-top:4px;color:#333;">'+esc(a.item)+': <b>'+esc(a.instruction)+'</b></div>';}).join('')+
        '<div style="margin-top:8px;border-top:1px solid #f8bbd0;padding-top:6px;font-size:11px;color:#999;">Tailor Sign: _______________________  Date: _________</div></div>':'';
      html+='<div class="g-card" style="border-radius:0;margin-bottom:2px;border-left:3px solid '+cc+';">'+
        '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">'+
        '<div style="flex:1;min-width:200px;">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">'+
        '<b style="color:#1a73e8;font-size:14px;">'+esc(item.order_name)+'</b>'+
        '<span style="'+payStyle+'padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">'+esc(payLabel)+'</span>'+altBadge+'</div>'+
        '<div style="font-size:13px;font-weight:600;margin-bottom:2px;">'+esc(item.customer_name)+'</div>'+
        '<div style="font-size:12px;color:#666;margin-bottom:8px;">'+esc(item.city)+', '+esc(item.state)+' - '+esc(item.pincode)+' | '+esc(item.phone||'No phone')+'</div>'+
        '<div style="background:#f6f8fa;padding:8px;border-radius:6px;">'+itemsList+'</div>'+alterationHtml+'</div>'+
        '<div style="display:flex;flex-direction:column;gap:6px;min-width:120px;">'+
        '<button onclick="openPackingSlip('+item.order_id+')" style="padding:7px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">&#x1F4C4; Print Slip</button>'+
        '<button onclick="markPacked('+item.order_id+','+JSON.stringify(item.order_name)+')" style="padding:7px 12px;background:#2e7d32;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">&#x2713; Mark Packed</button>'+
        '</div></div></div>';
    });
    html+='<div style="height:16px;"></div>';
  });
  container.innerHTML=html;
}

window.filterDispatchView=function(filter,btn){
  dispatchViewFilter=filter;
  document.querySelectorAll('#page-dispatch .filter-tab').forEach(function(t){t.classList.remove('active');});
  if(btn)btn.classList.add('active');
  let filtered=allDispatchQueue;
  if(filter==='bluedart')filtered=allDispatchQueue.filter(function(q){return q.courier.toLowerCase().includes('bluedart');});
  if(filter==='delhivery')filtered=allDispatchQueue.filter(function(q){return q.courier.toLowerCase().includes('delhivery');});
  if(filter==='alteration')filtered=allDispatchQueue.filter(function(q){return q.has_alteration;});
  renderDispatchQueue(filtered);
};

window.handleAwbScan=function(val){
  const resultEl=document.getElementById('awb-scan-result');
  if(!val){if(resultEl)resultEl.textContent='';scannedOrderId=null;return;}
  const found=allDispatchQueue.find(function(q){return q.order_name.toLowerCase()===val.toLowerCase()||String(q.order_id)===val.trim();});
  if(found){scannedOrderId=found.order_id;if(resultEl)resultEl.innerHTML='<span style="color:#2e7d32;font-weight:600;">&#x2713; Found: '+esc(found.order_name)+' - '+esc(found.customer_name)+'</span>';}
  else{scannedOrderId=null;if(resultEl)resultEl.innerHTML='<span style="color:#999;">No match yet...</span>';}
};

window.confirmAwbPack=async function(){
  const input=document.getElementById('awb-scanner-input'),resultEl=document.getElementById('awb-scan-result');
  const val=input?input.value.trim():'';
  if(!val){if(resultEl)resultEl.innerHTML='<span style="color:#d82c0d;">Enter AWB or order number first</span>';return;}
  const orderId=scannedOrderId||val;
  try{
    if(resultEl)resultEl.innerHTML='<span style="color:#666;">Marking packed...</span>';
    await api('/packing/mark-packed/'+orderId,{method:'POST',body:JSON.stringify({awb:val})});
    if(resultEl)resultEl.innerHTML='<span style="color:#2e7d32;font-weight:600;">&#x2713; Packed! Refreshing...</span>';
    if(input)input.value=''; scannedOrderId=null;
    setTimeout(loadDispatchQueue,1500);
  }catch(e){if(resultEl)resultEl.innerHTML='<span style="color:#d82c0d;">Error: '+esc(e.message)+'</span>';}
};

window.markPacked=async function(orderId,orderName){
  try{await api('/packing/mark-packed/'+orderId,{method:'POST',body:JSON.stringify({awb:'manual'})});alert(orderName+' marked as Packed!');loadDispatchQueue();}
  catch(e){alert('Error: '+e.message);}
};

window.openPackingSlip=async function(orderId){
  const modal=document.getElementById('slip-modal'),content=document.getElementById('slip-content');
  if(!modal||!content)return; modal.style.display='block';
  content.innerHTML='<div style="padding:40px;text-align:center;color:#666;">Loading slip data...</div>';
  try{const slip=await api('/packing/slip/'+orderId);renderPackingSlip(slip);}
  catch(e){content.innerHTML='<div style="padding:24px;color:#d82c0d;">Failed to load slip: '+esc(e.message)+'</div>';}
};
window.closeSlipModal=function(){const m=document.getElementById('slip-modal');if(m)m.style.display='none';};
window.printPackingSlip=function(){
  const content=document.getElementById('slip-content'); if(!content)return;
  const win=window.open('','_blank');
  win.document.write('<html><head><title>Packing Slip</title><style>body{font-family:Arial,sans-serif;margin:0;padding:16px;}table{width:100%;border-collapse:collapse;}@page{margin:10mm;}</style></head><body>');
  win.document.write(content.innerHTML);
  win.document.write('</body></html>');
  win.document.close(); win.focus(); setTimeout(function(){win.print();},500);
};

function renderPackingSlip(slip){
  const content=document.getElementById('slip-content'); if(!content)return;
  const sl=slip.shipping_label, ps=slip.packing_slip, at=slip.alteration_ticket;
  const bd='border:1px dashed #ccc;';
  const itemRows=(ps.items||[]).map(function(item){
    return '<tr><td style="padding:5px 8px;border-bottom:1px solid #eee;">'+esc(item.title)+(item.variant?'<br><small style="color:#666;">'+esc(item.variant)+'</small>':'')+'</td>'+
      '<td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:center;">'+item.qty+'</td>'+
      '<td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">Rs.'+parseFloat(item.price||0).toFixed(2)+'</td>'+
      '<td style="padding:5px 8px;border-bottom:1px solid #eee;font-size:11px;color:#666;">'+esc(item.sku||'')+'</td></tr>';
  }).join('');
  content.innerHTML=
    '<div style="padding:20px;'+bd+'border-bottom:3px solid #000;">'+
    '<div style="text-align:center;font-size:10px;color:#666;margin-bottom:8px;letter-spacing:1px;">[ COURIER SHIPPING LABEL ]</div>'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">'+
    '<div style="flex:1;"><div style="font-size:11px;color:#666;margin-bottom:4px;">FROM:</div><div style="font-weight:700;font-size:13px;">'+esc(sl.from_name)+'</div><div style="font-size:12px;color:#444;">'+esc(sl.from_address)+'</div></div>'+
    '<div style="text-align:center;min-width:140px;"><div style="font-size:22px;font-weight:900;color:#1a73e8;">'+esc(sl.order_name)+'</div>'+
    '<div style="font-size:11px;background:'+(sl.payment_type==='COD'?'#fff3cd':'#d4edda')+';padding:3px 10px;border-radius:12px;font-weight:700;color:'+(sl.payment_type==='COD'?'#856404':'#155724')+';display:inline-block;">'+esc(sl.payment_type)+(sl.cod_amount?' | Rs.'+parseFloat(sl.cod_amount).toFixed(0):'')+'</div>'+
    '<div style="font-size:11px;color:#666;margin-top:4px;">AWB: <b>'+esc(sl.awb)+'</b></div><div style="font-size:11px;color:#666;">Via: '+esc(sl.courier)+'</div></div>'+
    '<div style="flex:1;text-align:right;"><div style="font-size:11px;color:#666;margin-bottom:4px;">TO:</div><div style="font-weight:700;font-size:14px;">'+esc(sl.to_name)+'</div><div style="font-size:12px;color:#444;">'+esc(sl.to_address)+'</div>'+
    '<div style="font-size:12px;font-weight:700;">PIN: '+esc(sl.to_pincode)+'</div>'+(sl.to_phone?'<div style="font-size:12px;">Ph: '+esc(sl.to_phone)+'</div>':'')+'</div>'+
    '</div></div>'+
    '<div style="padding:16px 20px;'+bd+'border-bottom:3px solid #000;">'+
    '<div style="text-align:center;font-size:10px;color:#666;margin-bottom:8px;letter-spacing:1px;">[ CUSTOMER PACKING SLIP ]</div>'+
    '<div style="display:flex;justify-content:space-between;margin-bottom:10px;"><div><b>'+esc(ps.order_name)+'</b> | '+new Date(ps.order_date).toLocaleDateString('en-IN')+'</div><div>'+esc(ps.customer_name)+' | '+esc(ps.phone||'')+'</div></div>'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f6f8fa;"><th style="padding:5px 8px;text-align:left;border-bottom:2px solid #ddd;">Item</th><th style="padding:5px 8px;text-align:center;border-bottom:2px solid #ddd;">Qty</th><th style="padding:5px 8px;text-align:right;border-bottom:2px solid #ddd;">Price</th><th style="padding:5px 8px;border-bottom:2px solid #ddd;">SKU</th></tr></thead><tbody>'+itemRows+'</tbody></table>'+
    '<div style="display:flex;justify-content:flex-end;margin-top:8px;gap:24px;font-size:13px;"><span>Total: <b>Rs.'+parseFloat(ps.total||0).toFixed(2)+'</b></span><span>'+(ps.payment_status==='paid'?'<span style="color:#2e7d32;">PREPAID &#x2713;</span>':'<span style="color:#e65100;">COD PENDING</span>')+'</span></div>'+
    (ps.note?'<div style="margin-top:8px;padding:6px;background:#fff8e1;border-radius:4px;font-size:12px;"><b>Note:</b> '+esc(ps.note)+'</div>':'')+
    '</div>'+
    '<div style="padding:16px 20px;">'+
    '<div style="text-align:center;font-size:10px;color:#666;margin-bottom:8px;letter-spacing:1px;">[ ALTERATION TICKET ]</div>'+
    (at.has_alteration?
      '<div style="background:#fce4ec;border:2px solid #c62828;border-radius:6px;padding:12px;">'+
      '<div style="font-weight:700;color:#c62828;font-size:14px;margin-bottom:8px;">&#x2702; ALTERATION REQUIRED - Order: '+esc(at.order_name)+'</div>'+
      at.items.map(function(a){return '<div style="margin-bottom:8px;padding:8px;background:#fff;border-radius:4px;"><div><b>'+esc(a.item)+'</b>'+(a.variant?' - '+esc(a.variant):'')+'</div><div style="color:#c62828;font-size:13px;margin-top:4px;">&#x2794; '+esc(a.instruction)+'</div>'+(a.qty?'<div style="font-size:11px;color:#666;">Qty: '+a.qty+'</div>':'')+'</div>';}).join('')+
      '<div style="margin-top:12px;border-top:1px dashed #c62828;padding-top:10px;font-size:12px;">Tailor: _________________________ Sign: _________________ Date: __________</div></div>'
      :'<div style="text-align:center;padding:16px;background:#e8f5e9;border-radius:6px;color:#2e7d32;font-weight:600;font-size:14px;">&#x2713; No Alteration Required - Ready to Dispatch</div>')+
    '</div>';
}
// ===== CHATS =====
let activePhone=null;
async function loadChats(){
  const el=document.getElementById('conv-list'); if(!el)return;
  el.innerHTML='<div style="padding:24px;color:#666;">Loading chats...</div>';
  try{
    const convs=await api('/conversations');
    if(!convs||convs.length===0){el.innerHTML='<div style="padding:24px;color:#666;">No WhatsApp conversations yet.</div>';return;}
    el.innerHTML=convs.map(function(c){
      const last=c.lastMessage?esc((c.lastMessage.content||'').substring(0,60)):'', time=c.updatedAt?new Date(c.updatedAt).toLocaleTimeString('en-IN'):'';
      return '<div class="chat-item" onclick="loadConversation('+JSON.stringify(c.phone)+')">' +
        '<div style="width:36px;height:36px;background:#1e2a4a;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;flex-shrink:0;">'+esc((c.phone||'?').slice(-2))+'</div>'+
        '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">+'+esc(c.phone)+'</div><div style="font-size:12px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+last+'</div></div>'+
        '<div style="font-size:11px;color:#999;">'+esc(time)+'</div></div>';
    }).join('');
  }catch(e){el.innerHTML='<div style="padding:24px;color:#d82c0d;">Error loading chats.</div>';}
}
window.loadConversation=async function(phone){
  activePhone=phone;
  const activeArea=document.getElementById('chat-active-area'),emptyState=document.getElementById('chat-empty-state'),msgs=document.getElementById('chat-messages'),title=document.getElementById('chat-header-title');
  if(activeArea)activeArea.style.display='flex'; if(emptyState)emptyState.style.display='none'; if(title)title.textContent='+'+phone;
  if(!msgs)return; msgs.innerHTML='<div style="padding:16px;color:#666;">Loading messages...</div>';
  try{
    const conv=await api('/conversations/'+phone); const messages=conv.messages||[];
    msgs.innerHTML=messages.map(function(m){const isUser=m.role==='user';return '<div class="msg '+(isUser?'user':'assistant')+'"><div class="bubble">'+esc(m.content||'')+'</div><div class="meta">'+(m.timestamp?new Date(m.timestamp).toLocaleTimeString('en-IN'):'')+'</div></div>';}).join('');
    msgs.scrollTop=msgs.scrollHeight;
  }catch(e){msgs.innerHTML='<div style="padding:16px;color:#d82c0d;">Error loading messages.</div>';}
};
window.sendReply=async function(){
  const input=document.getElementById('chat-reply'); if(!input||!activePhone)return; const message=input.value.trim(); if(!message)return;
  try{await api('/send-text',{method:'POST',body:JSON.stringify({to:activePhone,message:message})});input.value='';window.loadConversation(activePhone);}
  catch(e){alert('Failed to send: '+e.message);}
};

// ===== COD VERIFICATIONS =====
async function loadVerifications(){
  const el=document.getElementById('verif-list'); if(!el)return;
  el.innerHTML='<div style="padding:24px;color:#666;">Loading...</div>';
  try{
    const verifications=await api('/verifications');
    if(!verifications||verifications.length===0){el.innerHTML='<div style="padding:24px;color:#666;">No pending COD verifications.</div>';return;}
    el.innerHTML=verifications.map(function(v){
      const statusColor=v.status==='confirmed'?'#2e7d32':v.status==='cancelled'?'#d82c0d':'#b57c00';
      return '<div class="g-card" style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;"><b>'+esc(v.orderId||'')+'</b><span style="color:'+statusColor+';">'+esc(v.status||'pending')+'</span></div>'+
        '<div style="margin:4px 0;color:#666;">'+esc(v.customerName||'')+' +'+esc(v.phone||'')+'</div>'+
        '<div style="font-weight:600;">Rs.'+esc(String(v.amount||''))+'</div>'+
        (v.status==='pending'?'<button onclick="resendVerification('+JSON.stringify(v.orderId)+')" class="btn btn-sm" style="margin-top:8px;">Resend</button>':'')+
        '</div>';
    }).join('');
  }catch(e){el.innerHTML='<div style="padding:24px;color:#d82c0d;">Error loading verifications.</div>';}
}
window.resendVerification=async function(orderId){
  try{await api('/verifications/'+orderId+'/resend',{method:'POST'});alert('Verification message resent!');}
  catch(e){alert('Error: '+e.message);}
};

// ===== TEMPLATES =====
window.sendTemplate=async function(){
  const name=(document.getElementById('tpl-name')||{value:''}).value.trim(),phones=(document.getElementById('tpl-recipients')||{value:''}).value.trim(),lang=(document.getElementById('tpl-lang')||{value:'en'}).value.trim(),resultEl=document.getElementById('template-result');
  if(!name||!phones){if(resultEl){resultEl.textContent='Fill template name and phone numbers';resultEl.style.color='#d82c0d';}return;}
  const toList=phones.split(',').map(function(p){return p.trim();}).filter(Boolean);
  try{await api('/send-template',{method:'POST',body:JSON.stringify({to:toList,templateName:name,languageCode:lang,components:[]})});if(resultEl){resultEl.textContent='Sent to '+toList.length+' recipient(s)!';resultEl.style.color='#2e7d32';}}
  catch(e){if(resultEl){resultEl.textContent='Error: '+e.message;resultEl.style.color='#d82c0d';}}
};

// ===== SETTINGS =====
function loadSettings(){
  const c=document.getElementById('url-order-created'),f=document.getElementById('url-order-fulfilled');
  if(c)c.textContent=window.location.origin+'/shopify/webhook'; if(f)f.textContent=window.location.origin+'/webhook';
}

// ===== INIT =====
function initApp(){
  window.switchPage('orders'); loadSettings();
  document.querySelectorAll('.nav-item').forEach(function(item){item.addEventListener('click',function(){const page=item.getAttribute('data-page');if(page)window.switchPage(page);});});
  const sendBtn=document.getElementById('btn-send-reply'); if(sendBtn)sendBtn.addEventListener('click',window.sendReply);
  const chatReply=document.getElementById('chat-reply'); if(chatReply)chatReply.addEventListener('keypress',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();window.sendReply();}});
  const sendTemplBtn=document.getElementById('btn-send-template'); if(sendTemplBtn)sendTemplBtn.addEventListener('click',window.sendTemplate);
  const logoutBtn=document.getElementById('btn-logout'); if(logoutBtn)logoutBtn.addEventListener('click',function(){localStorage.removeItem('wa_admin_password');location.reload();});
}

document.addEventListener('DOMContentLoaded',function(){
  const loginBtn=document.getElementById('btn-login'),loginPw=document.getElementById('password');
  if(loginBtn)loginBtn.addEventListener('click',handleLogin);
  if(loginPw)loginPw.addEventListener('keypress',function(e){if(e.key==='Enter')handleLogin();});
  const pw=getPassword(); if(pw){hideLogin();initApp();}else{showLogin();}
});
