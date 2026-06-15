const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsapp');
const store = require('../services/store');

// Simple password check for all dashboard API calls
function checkAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.password;
  if (!process.env.ADMIN_PASSWORD || pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(checkAuth);

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
// body: { recipients: ["91XXXXXXXXXX", ...], templateName, languageCode, components }
router.post('/send-template', async (req, res) => {
  try {
    const { recipients, templateName, languageCode, components } = req.body;
    if (!Array.isArray(recipients) || !templateName) {
      return res.status(400).json({ error: 'recipients (array) and templateName are required' });
    }

    const results = [];
    for (const to of recipients) {
      try {
        await whatsapp.sendTemplateMessage(to, templateName, languageCode || 'en_US', components || []);
        store.addMessage(to, {
          role: 'assistant',
          content: `[Template sent: ${templateName}]`,
          timestamp: Date.now(),
          manual: true,
        });
        results.push({ to, success: true });
      } catch (e) {
        results.push({ to, success: false, error: e.response?.data?.error?.message || e.message });
      }
    }
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get / update settings (e.g. AI auto-reply toggle)
router.get('/settings', (req, res) => {
  res.json(store.getSettings());
});

router.post('/settings', (req, res) => {
  const current = store.getSettings();
  const updated = { ...current, ...req.body };
  store.saveSettings(updated);
  res.json(updated);
});

module.exports = router;
