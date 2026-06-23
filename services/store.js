const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CONV_FILE = path.join(DATA_DIR, 'conversations.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const VERIFICATIONS_FILE = path.join(DATA_DIR, 'verifications.json');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getConversations() {
  return readJSON(CONV_FILE, {});
}

function saveConversations(data) {
  writeJSON(CONV_FILE, data);
}

function addMessage(phone, message) {
  const conversations = getConversations();
  if (!conversations[phone]) {
    conversations[phone] = { phone, messages: [], updatedAt: Date.now() };
  }
  conversations[phone].messages.push(message);
  conversations[phone].updatedAt = Date.now();
  saveConversations(conversations);
  return conversations[phone];
}

function getSettings() {
  return readJSON(SETTINGS_FILE, {
    aiAutoReplyEnabled: process.env.AI_AUTOREPLY_ENABLED === 'true',
  });
}

function saveSettings(settings) {
  writeJSON(SETTINGS_FILE, settings);
}

// Pending COD Verifications
function getPendingVerifications() {
  return readJSON(VERIFICATIONS_FILE, {});
}

function savePendingVerifications(data) {
  writeJSON(VERIFICATIONS_FILE, data);
}

module.exports = {
  getConversations,
  saveConversations,
  addMessage,
  getSettings,
  saveSettings,
  getPendingVerifications,
  savePendingVerifications,
};
