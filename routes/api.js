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
      res.json({ success: true, message: 'Login successful' });
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

router.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/conversations', (req, res) => {
      const conversations = store.getConversations();
      const list = Object.values(conversations)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((c) => ({ phone: c.phone, updatedAt: c.updatedAt, lastMessage: c.messages[c.messages.length - 1], messageCount: c.messages.length }));
      res.json(list);
});

router.get('/conversations/:phone', (req, res) => {
      const conversations = store.getConversations();
      res.json(conversations[req.params.phone] || { phone: req.params.phone, messages: [] });
});

router.post('/send-text', async (req, res) => {
      try {
              const { to, message } = req.body;
              if (!to || !message) return res.status(400).json({ error: 'to and message are required' });
              await whatsapp.sendTextMessage(to, message);
              store.addMessage(to, { role: 'assistant', content: message, timestamp: Date.now(), manual: true });
              res.json({ success: true });
      } catch (e) {
              res.status(500).json({ error: e.response?.data?.error || e.message });
      }
});

router.post('/send-template', async (req, res) => {
      try {
              const { to, templateName, languageCode, components } = req.body;
              if (!to || !templateName) return res.status(400).json({ error: 'to and templateName are required' });
              const recipients = Array.isArray(to) ? to : [to];
              const results = [];
              for (const phone of recipients) {
                        const result = await whatsapp.sendTemplateMessage(phone, templateName, languageCode || 'en', components || []);
                        results.push({ phone, result });
              }
              res.json({ success: true, results });
      } catch (e) {
              res.status(500).json({ error: e.response?.data?.error || e.message });
      }
});

router.get('/verifications', (req, res) => {
      const verifications = store.getPendingVerifications();
      res.json(Object.values(verifications));
});

router.post('/verifications/:orderId/resend', async (req, res) => {
      try {
              const verifications = store.getPendingVerifications();
              const v = verifications[req.params.orderId];
              if (!v) return res.status(404).json({ error: 'Verification not found' });
              const msg = 'Hi ' + v.customerName + '! Please reply CONFIRM to confirm COD order #' + v.orderId + ' of Rs.' + v.amount + ', or CANCEL.';
              await whatsapp.sendTextMessage(v.phone, msg);
              v.lastSent = Date.now();
              store.savePendingVerifications(verifications);
              res.json({ success: true });
      } catch (e) {
              res.status(500).json({ error: e.message });
      }
});

router.get('/orders', async (req, res) => {
      try {
              const limit = parseInt(req.query.limit) || 50;
              const orders = await shopify.getOrders({ limit, status: 'any' });
              res.json(orders);
      } catch (e) {
                      res.status(500).json({ error: e.message });
      }
});

router.get('/orders/:id', async (req, res) => {
      try {
              const order = await shopify.getOrderById(req.params.id);
              res.json(order);
      } catch (e) {
              res.status(500).json({ error: e.message });
      }
});

router.get('/inventory', async (req, res) => {
      try {
              const limit = parseInt(req.query.limit) || 250;
              const products = await shopify.getProducts({ limit, status: 'active', fields: 'id,title,image,images,variants' });
              const openOrders = await shopify.getOrders({ limit: 250, fulfillment_status: 'unfulfilled', status: 'open', fields: 'line_items' });

        const bookedMap = {};
              for (const order of openOrders) {
                        for (const item of (order.line_items || [])) {
                                    bookedMap[item.variant_id] = (bookedMap[item.variant_id] || 0) + item.quantity;
                        }
              }

        const items = [];
              for (const product of products) {
                        const image = product.image?.src || product.images?.[0]?.src || null;
                        for (const v of (product.variants || [])) {
                                    const stock = v.inventory_quantity || 0;
                                    const booked = bookedMap[v.id] || 0;
                                    const available = Math.max(0, stock - booked);
                                    const net = stock - booked;
                                    items.push({
                                                  product_id: product.id,
                                                  product_title: product.title,
                                                  variant_id: v.id,
                                                  variant_title: v.title,
                                                  sku: v.sku,
                                                  price: v.price,
                                                  image,
                                                  available_qty: available,
                                                  booked_qty: booked,
                                                  net_qty: net,
                                                  stock_qty: stock
                                    });
                        }
              }

        res.json({ items, total: items.length });
      } catch (e) {
              res.status(500).json({ error: e.message });
      }
});

module.exports = router;
