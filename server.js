require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');
const shopifyWebhookRoutes = require('./routes/shopify-webhook');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WhatsApp incoming message webhook (from Meta)
app.use('/webhook', webhookRoutes);

// Dashboard API
app.use('/api', apiRoutes);

// Shopify webhooks (order created, fulfilled)
app.use('/shopify', shopifyWebhookRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sanganeri WhatsApp bot running on port ${PORT}`));
