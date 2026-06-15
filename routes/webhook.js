const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsapp');
const store = require('../services/store');
const ai = require('../services/ai');

// Meta calls this once to verify your webhook URL
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta calls this whenever a customer sends a message
router.post('/', async (req, res) => {
  // Always ack quickly so Meta doesn't retry
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const incomingMessages = value?.messages;

    if (!incomingMessages) return;

    for (const msg of incomingMessages) {
      const from = msg.from; // customer's phone number
      const text =
        msg.text?.body ||
        msg.button?.text ||
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        '[unsupported message type]';

      store.addMessage(from, { role: 'user', content: text, timestamp: Date.now() });

      try {
        await whatsapp.markAsRead(msg.id);
      } catch (e) {
        console.error('Failed to mark as read:', e.response?.data || e.message);
      }

      const settings = store.getSettings();
      if (settings.aiAutoReplyEnabled) {
        const conv = store.getConversations()[from];
        const history = conv.messages.slice(-10);

        try {
          const replyText = await ai.generateReply(history, from);
          await whatsapp.sendTextMessage(from, replyText);
          store.addMessage(from, { role: 'assistant', content: replyText, timestamp: Date.now(), ai: true });
        } catch (e) {
          console.error('AI reply failed:', e.response?.data || e.message);
        }
      }
    }
  } catch (e) {
    console.error('Webhook processing error:', e.message);
  }
});

module.exports = router;
