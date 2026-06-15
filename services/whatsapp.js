const axios = require('axios');

const GRAPH_VERSION = 'v19.0';

function baseUrl() {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function sendTextMessage(to, body) {
  return axios.post(
    baseUrl(),
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    },
    { headers: headers() }
  );
}

// components example for a template with one body variable:
// [{ type: "body", parameters: [{ type: "text", text: "Madhav" }] }]
async function sendTemplateMessage(to, templateName, languageCode = 'en', components = []) {
  return axios.post(
    baseUrl(),
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    },
    { headers: headers() }
  );
}

async function markAsRead(messageId) {
  return axios.post(
    baseUrl(),
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
    { headers: headers() }
  );
}

module.exports = { sendTextMessage, sendTemplateMessage, markAsRead };
