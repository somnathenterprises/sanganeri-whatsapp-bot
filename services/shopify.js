const axios = require('axios');

const API_VERSION = '2025-01';

function client() {
  return axios.create({
    baseURL: `https://${process.env.SHOPIFY_STORE}/admin/api/${API_VERSION}`,
    headers: {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
  });
}

// Look up a single order by its order number, e.g. "1023" or "#1023"
async function getOrderByName(orderNumber) {
  const name = orderNumber.toString().startsWith('#') ? orderNumber : `#${orderNumber}`;
  const res = await client().get('/orders.json', {
    params: { name, status: 'any' },
  });
  return res.data.orders?.[0] || null;
}

// Find recent orders placed with a given WhatsApp phone number
async function getOrdersByPhone(phone) {
  const res = await client().get('/orders.json', {
    params: { status: 'any', limit: 20, order: 'created_at DESC' },
  });
  const orders = res.data.orders || [];
  const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
  return orders.filter((o) => {
    const candidates = [o.phone, o.customer?.phone, o.shipping_address?.phone, o.billing_address?.phone];
    return candidates.some((p) => (p || '').replace(/\D/g, '').slice(-10) === cleanPhone);
  });
}

// Search products by title/keyword and return stock + price info
async function checkStock(productTitle) {
  const res = await client().get('/products.json', {
    params: { title: productTitle, limit: 5 },
  });
  const products = res.data.products || [];
  return products.map((p) => ({
    title: p.title,
    status: p.status,
    variants: p.variants.map((v) => ({
      title: v.title,
      sku: v.sku,
      price: v.price,
      inventory_quantity: v.inventory_quantity,
    })),
  }));
}

// Fetch orders with flexible params for live orders dashboard
async function getOrders(params = {}) {
  const res = await client().get('/orders.json', { params });
  return res.data.orders || [];
}

// Fetch a single order by Shopify order ID
async function getOrderById(orderId) {
  const res = await client().get(`/orders/${orderId}.json`);
  return res.data.order || null;
}

module.exports = { getOrderByName, getOrdersByPhone, checkStock, getOrders, getOrderById };
