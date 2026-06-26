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

async function getOrdersByPhone(phone) {
    const res = await client().get('/orders.json', {
          params: { status: 'any', limit: 10 },
    });
    const allOrders = res.data.orders || [];
    const normalized = phone.replace(/\D/g, '').slice(-10);
    return allOrders.filter((o) => {
          const p = (o.phone || o.billing_address?.phone || o.shipping_address?.phone || '').replace(/\D/g, '').slice(-10);
          return p === normalized;
    });
}

// Check stock for a product by title
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

// Fetch all products with variants and inventory quantity
async function getProducts(params = {}) {
    try {
          const res = await client().get('/products.json', { params });
          return res.data.products || [];
    } catch (err) {
          const shopifyError = err.response?.data;
          const status = err.response?.status;
          console.error('Shopify getProducts error:', status, JSON.stringify(shopifyError));
          const msg = shopifyError?.errors || shopifyError?.error || err.message;
          throw new Error(`Shopify ${status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }
}

module.exports = { getOrderByName, getOrdersByPhone, checkStock, getOrders, getOrderById, getProducts };
