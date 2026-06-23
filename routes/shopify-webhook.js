const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const whatsapp = require('../services/whatsapp');
const store = require('../services/store');

// Shopify Webhook Signature Verification
function verifyShopifyWebhook(req, res, next) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return next();
  const body = JSON.stringify(req.body);
  const digest = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  if (digest !== hmac) {
    console.warn('Shopify webhook signature mismatch - ignoring');
    return res.sendStatus(401);
  }
  next();
}

// Get customer phone from order
function getCustomerPhone(order) {
  const raw =
    order.shipping_address?.phone ||
    order.billing_address?.phone ||
    order.customer?.phone ||
    order.phone ||
    null;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

// Build item summary
function buildItemsSummary(lineItems) {
  return (lineItems || [])
    .map((item) => `${item.title} (x${item.quantity})`)
    .join(', ');
}

const VERIFICATION_KEYWORD = 'CONFIRM';
const CANCEL_KEYWORD = 'CANCEL';

// ORDER CREATED - send confirmation + COD verification
router.post('/order-created', verifyShopifyWebhook, async (req, res) => {
  res.sendStatus(200);
  try {
    const order = req.body;
    const phone = getCustomerPhone(order);
    const customerName = order.customer?.first_name || order.shipping_address?.first_name || 'Customer';
    const orderNumber = order.name || `#${order.order_number}`;
    const total = `Rs. ${parseFloat(order.total_price).toFixed(2)}`;
    const items = buildItemsSummary(order.line_items);
    const paymentMethod = (order.payment_gateway || '').toLowerCase();
    const isCOD = paymentMethod.includes('cod') || paymentMethod.includes('cash') || order.financial_status === 'pending';

    if (!phone) {
      console.warn(`Order ${orderNumber}: no phone number found, skipping WhatsApp`);
      return;
    }

    // 1. Order Confirmation
    const confirmMsg =
      `✅ *Order Confirmed! - Sanganeri Moda*\n\n` +
      `Namaste ${customerName}! 🙏\n` +
      `Aapka order place ho gaya hai.\n\n` +
      `📦 *Order:* ${orderNumber}\n` +
      `🛍️ *Items:* ${items}\n` +
      `💰 *Total:* ${total}\n` +
      `💳 *Payment:* ${isCOD ? 'Cash on Delivery (COD)' : 'Prepaid'}\n\n` +
      `Hum aapka order jald hi dispatch karenge. Koi bhi sawaal ho toh yahan message karen! 😊`;

    await whatsapp.sendTextMessage(phone, confirmMsg);
    store.addMessage(phone, {
      role: 'assistant', content: confirmMsg, timestamp: Date.now(),
      type: 'order_confirmation', orderNumber,
    });

    // 2. COD Verification
    if (isCOD) {
      await new Promise((r) => setTimeout(r, 2000));
      const verifyMsg =
        `🔔 *COD Order Verification - Sanganeri Moda*\n\n` +
        `${customerName} ji, aapne *Cash on Delivery* order diya hai:\n` +
        `📦 *Order:* ${orderNumber}\n` +
        `💰 *Amount:* ${total}\n\n` +
        `Kripya apna order confirm karne ke liye reply karen:\n` +
        `✅ *CONFIRM* - Order confirm karna hai\n` +
        `❌ *CANCEL* - Order cancel karna hai\n\n` +
        `(24 ghante mein response nahi aaya toh order cancel ho jayega)`;

      await whatsapp.sendTextMessage(phone, verifyMsg);
      store.addMessage(phone, {
        role: 'assistant', content: verifyMsg, timestamp: Date.now(),
        type: 'cod_verification', orderNumber,
      });

      const verifications = store.getPendingVerifications();
      verifications[orderNumber] = {
        orderNumber, phone, customerName, total, items,
        createdAt: Date.now(), status: 'pending', orderId: order.id,
      };
      store.savePendingVerifications(verifications);
      console.log(`COD verification sent for order ${orderNumber} to ${phone}`);
    }
    console.log(`Order confirmation sent for ${orderNumber} to ${phone}`);
  } catch (e) {
    console.error('Order created webhook error:', e.response?.data || e.message);
  }
});

// ORDER FULFILLED - send tracking message
router.post('/order-fulfilled', verifyShopifyWebhook, async (req, res) => {
  res.sendStatus(200);
  try {
    const order = req.body;
    const phone = getCustomerPhone(order);
    const customerName = order.customer?.first_name || order.shipping_address?.first_name || 'Customer';
    const orderNumber = order.name || `#${order.order_number}`;

    if (!phone) {
      console.warn(`Order ${orderNumber}: no phone found, skipping tracking message`);
      return;
    }

    const fulfillment = order.fulfillments?.[0];
    const trackingNumber = fulfillment?.tracking_number || null;
    const trackingCompany = fulfillment?.tracking_company || null;
    const trackingUrl = fulfillment?.tracking_url || null;

    let trackingMsg =
      `🚚 *Order Shipped! - Sanganeri Moda*\n\n` +
      `Khushkhabri! ${customerName} ji, aapka order *${orderNumber}* dispatch ho gaya hai! 🎉\n\n`;

    if (trackingNumber) {
      trackingMsg += `📮 *Courier:* ${trackingCompany || 'Courier Partner'}\n`;
      trackingMsg += `🔍 *Tracking No:* ${trackingNumber}\n`;
    }
    if (trackingUrl) {
      trackingMsg += `🔗 *Track here:* ${trackingUrl}\n`;
    }

    trackingMsg +=
      `\n📅 2-5 business days mein delivery expected hai.\n` +
      `Koi bhi sawaal ho toh yahan message karen! 😊\n` +
      `- Team Sanganeri Moda`;

    await whatsapp.sendTextMessage(phone, trackingMsg);
    store.addMessage(phone, {
      role: 'assistant', content: trackingMsg, timestamp: Date.now(),
      type: 'order_tracking', orderNumber, trackingNumber,
    });
    console.log(`Tracking message sent for ${orderNumber} to ${phone}`);
  } catch (e) {
    console.error('Order fulfilled webhook error:', e.response?.data || e.message);
  }
});

// Handle customer replies for COD verification (called from webhook.js)
async function handleVerificationReply(phone, text) {
  const verifications = store.getPendingVerifications();
  const upperText = text.trim().toUpperCase();
  const pending = Object.values(verifications).find(
    (v) => v.phone === phone && v.status === 'pending'
  );
  if (!pending) return false;

  if (upperText === VERIFICATION_KEYWORD) {
    verifications[pending.orderNumber].status = 'confirmed';
    verifications[pending.orderNumber].confirmedAt = Date.now();
    store.savePendingVerifications(verifications);
    const replyMsg =
      `✅ *Order Confirmed! - Sanganeri Moda*\n\n` +
      `Shukriya ${pending.customerName} ji! Aapka order *${pending.orderNumber}* confirm ho gaya hai.\n` +
      `Hum jald hi aapka parcel dispatch karenge. 🚚\n` +
      `- Team Sanganeri Moda`;
    await whatsapp.sendTextMessage(phone, replyMsg);
    store.addMessage(phone, {
      role: 'assistant', content: replyMsg, timestamp: Date.now(),
      type: 'verification_confirmed', orderNumber: pending.orderNumber,
    });
    console.log(`COD order ${pending.orderNumber} CONFIRMED by customer`);
    return true;
  }

  if (upperText === CANCEL_KEYWORD) {
    verifications[pending.orderNumber].status = 'cancelled';
    verifications[pending.orderNumber].cancelledAt = Date.now();
    store.savePendingVerifications(verifications);
    const replyMsg =
      `❌ *Order Cancelled - Sanganeri Moda*\n\n` +
      `${pending.customerName} ji, aapka order *${pending.orderNumber}* cancel kar diya gaya hai.\n` +
      `Agar koi problem tha toh humein batayein, hum help karenge! 😊\n` +
      `- Team Sanganeri Moda`;
    await whatsapp.sendTextMessage(phone, replyMsg);
    store.addMessage(phone, {
      role: 'assistant', content: replyMsg, timestamp: Date.now(),
      type: 'verification_cancelled', orderNumber: pending.orderNumber,
    });
    console.log(`COD order ${pending.orderNumber} CANCELLED by customer`);
    return true;
  }

  return false;
}

module.exports = router;
module.exports.handleVerificationReply = handleVerificationReply;
