const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsapp');
const store = require('../services/store');
const shopify = require('../services/shopify');

router.post('/login', (req, res) => {
        const { password } = req.body;
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        if (!password || password !== adminPassword) {
                  return res.status(401).json({ error: 'Unauthorized' });
        }
        res.json({ success: true, message: 'Login successful' });h
});

function checkAuth(req, res, next) {
        const pass = req.headers['x-admin-password'] || req.query.password;
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        if (!pass || pass !== adminPassword) {
                  return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
}

router.use(checkAuth);

// ===== ORDERS =====
router.get('/orders', async (req, res) => {
        try {
                  const limit = parseInt(req.query.limit) || 50;
                  const orders = await shopify.getOrders({ limit: limit, status: 'any' });
                  res.json(orders);
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

router.get('/orders/:id', async (req, res) => {
        try {
                  const order = await shopify.getOrder(req.params.id);
                  res.json(order);
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

// ===== INVENTORY (flat items for card view) =====
router.get('/inventory', async (req, res) => {
        try {
                  const limit = parseInt(req.query.limit) || 250;
                                  const products = await shopify.getProducts({ limit: limit });
                  const orders = await shopify.getOrders({ limit: 250, status: 'any' });

          // Count booked qty per variant from unfulfilled orders
          const bookedMap = {};
                  for (const order of orders) {
                              if (order.fulfillment_status === 'fulfilled') continue;
                              for (const li of (order.line_items || [])) {
                                            const vid = li.variant_id;
                                            if (vid) bookedMap[vid] = (bookedMap[vid] || 0) + li.quantity;
                              }
                  }

          const items = [];
                  for (const product of products) {
                              const image = product.images && product.images.length > 0 ? product.images[0].src : null;
                              for (const variant of (product.variants || [])) {
                                            const avail = variant.inventory_quantity || 0;
                                            const booked = bookedMap[variant.id] || 0;
                                            const net = avail - booked;
                                            items.push({
                                                            product_id: product.id,
                                                            product_title: product.title,
                                                            variant_id: variant.id,
                                                            variant_title: variant.title,
                                                            sku: variant.sku,
                                                            price: variant.price,
                                                            image: image,
                                                            available_qty: avail,
                                                            booked_qty: booked,
                                                            net_qty: net,
                                                            stock_qty: avail
                                            });
                              }
                  }

          res.json({ items, total: items.length });
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

// ===== INVENTORY TABLE VIEW (grouped by product with size columns) =====
router.get('/inventory/table', async (req, res) => {
        try {
                  const limit = parseInt(req.query.limit) || 250;
                                  const products = await shopify.getProducts({ limit: limit });
                  const orders = await shopify.getOrders({ limit: 250, status: 'any' });

          // Count booked qty per variant from unfulfilled orders
          const bookedMap = {};
                  for (const order of orders) {
                              if (order.fulfillment_status === 'fulfilled') continue;
                              for (const li of (order.line_items || [])) {
                                            const vid = li.variant_id;
                                            if (vid) bookedMap[vid] = (bookedMap[vid] || 0) + li.quantity;
                              }
                  }

          // Size columns in order
          const fullSizes = ['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
                  const halfSizes = ['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

          // Map variant title to size and sleeve type
          // Variant titles like "M-38 / Full", "L-40 / Half", "XXL-44 / Full", "3XL-46 / Half"
          function parseVariant(title) {
                      if (!title) return null;
                      const parts = title.split('/');
                      if (parts.length < 2) return null;
                      const sleeveRaw = parts[1].trim().toLowerCase();
                      const sizeRaw = parts[0].trim().toUpperCase();
                      // Normalize size: M-38->M, L-40->L, XL-42->XL, XXL-44->2XL, 3XL-46->3XL, 4XL-48->4XL, 5XL-50->5XL
                    let size = sizeRaw.split('-')[0].trim();
                      if (size === 'XXL') size = '2XL';
                      const sleeve = sleeveRaw.includes('full') ? 'full' : sleeveRaw.includes('half') ? 'half' : null;
                      if (!sleeve) return null;
                      return { size, sleeve };
          }

          const rows = [];
                  let srNo = 1;

          for (const product of products) {
                      const image = product.images && product.images.length > 0 ? product.images[0].src : null;
                      // Get base SKU from first variant
                    const firstVariant = (product.variants || [])[0];
                      const baseSku = firstVariant ? (firstVariant.sku || '').replace(/_FS_.*|_HS_.*/,'').replace(/_M$|_L$|_XL$|_XXL$|_2XL$|_3XL$|_4XL$|_5XL$/,'') : '';

                    const fullStock = {};
                      const halfStock = {};
                      let hasAnyVariant = false;

                    for (const variant of (product.variants || [])) {
                                  const parsed = parseVariant(variant.title);
                                  if (!parsed) continue;
                                  hasAnyVariant = true;
                                  const avail = variant.inventory_quantity || 0;
                                  const booked = bookedMap[variant.id] || 0;
                                  const net = avail - booked;
                                  if (parsed.sleeve === 'full') {
                                                  fullStock[parsed.size] = net;
                                  } else if (parsed.sleeve === 'half') {
                                                  halfStock[parsed.size] = net;
                                  }
                    }

                    if (!hasAnyVariant) continue;

                    // HSN from metafields (not available via REST without extra call, use empty for now)
                    const hsn = product.variants[0] ? (product.variants[0].harmonized_system_code || '') : '';
                      // Costing avg = price of first variant as proxy
                    const costingAvg = firstVariant ? parseFloat(firstVariant.price || 0) : 0;

                    rows.push({
                                  sr_no: srNo++,
                                  product_id: product.id,
                                  product_title: product.title,
                                  sku: baseSku || (firstVariant ? firstVariant.sku : ''),
                                  image: image,
                                  full: {
                                                  M: fullStock['M'] !== undefined ? fullStock['M'] : null,
                                                  L: fullStock['L'] !== undefined ? fullStock['L'] : null,
                                                  XL: fullStock['XL'] !== undefined ? fullStock['XL'] : null,
                                                  '2XL': fullStock['2XL'] !== undefined ? fullStock['2XL'] : null,
                                                  '3XL': fullStock['3XL'] !== undefined ? fullStock['3XL'] : null,
                                                  '4XL': fullStock['4XL'] !== undefined ? fullStock['4XL'] : null,
                                                  '5XL': fullStock['5XL'] !== undefined ? fullStock['5XL'] : null,
                                  },
                                  half: {
                                                  M: halfStock['M'] !== undefined ? halfStock['M'] : null,
                                                  L: halfStock['L'] !== undefined ? halfStock['L'] : null,
                                                  XL: halfStock['XL'] !== undefined ? halfStock['XL'] : null,
                                                  '2XL': halfStock['2XL'] !== undefined ? halfStock['2XL'] : null,
                                                  '3XL': halfStock['3XL'] !== undefined ? halfStock['3XL'] : null,
                                                  '4XL': halfStock['4XL'] !== undefined ? halfStock['4XL'] : null,
                                                  '5XL': halfStock['5XL'] !== undefined ? halfStock['5XL'] : null,
                                  },
                                  hsn: hsn,
                                  costing_avg: costingAvg
                    });
          }

          res.json({ rows, total: rows.length });
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

// ===== CONVERSATIONS =====
router.get('/conversations', async (req, res) => {
        try {
                  const convs = await Object.values(store.getConversations() || {});
                  res.json(convs);
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

router.get('/conversations/:phone', async (req, res) => {
        try {
                  const conv = await (store.getConversations() || {})[req.params.phone];
                  res.json(conv || { phone: req.params.phone, messages: [] });
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

// ===== SEND TEXT =====
router.post('/send-text', async (req, res) => {
        try {
                  const { to, message } = req.body;
                  if (!to || !message) return res.status(400).json({ error: 'Missing to or message' });
                  await whatsapp.sendText(to, message);
                  res.json({ success: true });
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

// ===== SEND TEMPLATE =====
router.post('/send-template', async (req, res) => {
        try {
                  const { to, templateName, languageCode, components } = req.body;
                  if (!to || !templateName) return res.status(400).json({ error: 'Missing to or templateName' });
                  const toList = Array.isArray(to) ? to : [to];
                  const results = [];
                  for (const phone of toList) {
                              try {
                                            await whatsapp.sendTemplate(phone, templateName, languageCode || 'en', components || []);
                                            results.push({ phone, success: true });
                              } catch (err) {
                                            results.push({ phone, success: false, error: err.message });
                              }
                  }
                  res.json({ results });
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

// ===== VERIFICATIONS =====
router.get('/verifications', async (req, res) => {
        try {
                  const verifications = await Object.values(store.getPendingVerifications() || {});
                  res.json(verifications || []);
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

router.post('/verifications/:orderId/resend', async (req, res) => {
        try {
                  const v = await (store.getPendingVerifications() || {})[req.params.orderId];
                  if (!v) return res.status(404).json({ error: 'Not found' });
                  await whatsapp.sendVerification(v);
                  res.json({ success: true });
        } catch (e) {
                  res.status(500).json({ error: e.message });
        }
});

module.exports = router;
