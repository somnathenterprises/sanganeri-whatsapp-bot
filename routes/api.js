const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsapp');
const store = require('../services/store');
const shopify = require('../services/shopify');

// ============================================================
// LOGIN - Public route (no auth required)
// ============================================================
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ success: true, message: 'Login successful' });
});

// ============================================================
// AUTH MIDDLEWARE - Applied to all routes below
// ============================================================
function checkAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.password;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!pass || pass !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(checkAuth);

// ============================================================
// HEALTH CHECK
// ============================================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// CONVERSATIONS
// ============================================================

// List all conversations, most recently active first
router.get('/conversations', (req, res) => {
  const conversations = store.getConversations();
  const list = Object.values(conversations)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((c) => ({
      phone: c.phone,
      updatedAt: c.updatedAt,
      lastMessage: c.messages[c.messages.length - 1],
      messageCount: c.messages.length,
    }));
  res.json(list);
});

// Full message history for one phone number
router.get('/conversations/:phone', (req, res) => {
  const conversations = store.getConversations();
  res.json(conversations[req.params.phone] || { phone: req.params.phone, messages: [] });
});

// Send a plain text reply manually from the dashboard
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

// Send a pre-approved WhatsApp template to one or more recipients
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

// ============================================================
// COD VERIFICATIONS
// ============================================================
router.get('/verifications', (req, res) => {
  const verifications = store.getPendingVerifications();
  res.json(Object.values(verifications));
});

router.post('/verifications/:orderId/resend', async (req, res) => {
  try {
    const verifications = store.getPendingVerifications();
    const v = verifications[req.params.orderId];
    if (!v) return res.status(404).json({ error: 'Verification not found' });
    const msg = `Hi ${v.customerName}! Please reply CONFIRM to confirm your COD order #${v.orderId} of ₹${v.amount}, or CANCEL to cancel it.`;
    await whatsapp.sendTextMessage(v.phone, msg);
    v.lastSent = Date.now();
    store.savePendingVerifications(verifications);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// SHOPIFY ORDERS
// ============================================================
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

module.exports = router;
