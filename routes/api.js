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

// ===== ORDERS =====
router.get('/orders', async (req, res) => {
        try {
                const limit = parseInt(req.query.limit) || 50;
                const orders = await shopify.getOrders({ limit: limit, status: 'any' });
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

// ===== INVENTORY (flat items for card view) =====
router.get('/inventory', async (req, res) => {
        try {
                const limit = parseInt(req.query.limit) || 250;
                const products = await shopify.getProducts({ limit: limit });
                const orders = await shopify.getOrders({ limit: 250, status: 'any' });

                const bookedMap = {};
                for (const order of orders) {
                        if (order.fulfillment_status === 'fulfilled') continue;
                        for (const li of (order.line_items || [])) {
                                const vid = li.variant_id;
                                if (vid) bookedMap[vid] = (bookedMap[vid] || 0) + li.quantity;
                        }
                }

                const items = [];
                for (const product of products) {
                        const image = product.images && product.images.length > 0 ? product.images[0].src : null;
                        for (const variant of (product.variants || [])) {
                                const avail = variant.inventory_quantity || 0;
                                const booked = bookedMap[variant.id] || 0;
                                const net = avail - booked;
                                items.push({
                                        product_id: product.id,
                                        product_title: product.title,
                                        variant_id: variant.id,
                                        variant_title: variant.title,
                                        sku: variant.sku,
                                        price: variant.price,
                                        image: image,
                                        available_qty: avail,
                                        booked_qty: booked,
                                        net_qty: net,
                                        stock_qty: avail
                                });
                        }
                }

                res.json({ items, total: items.length });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== INVENTORY TABLE VIEW =====
router.get('/inventory/table', async (req, res) => {
        try {
                const limit = parseInt(req.query.limit) || 250;
                const products = await shopify.getProducts({ limit: limit });
                const orders = await shopify.getOrders({ limit: 250, status: 'any' });

                const bookedMap = {};
                for (const order of orders) {
                        if (order.fulfillment_status === 'fulfilled') continue;
                        for (const li of (order.line_items || [])) {
                                const vid = li.variant_id;
                                if (vid) bookedMap[vid] = (bookedMap[vid] || 0) + li.quantity;
                        }
                }

                function parseVariant(title) {
                        if (!title) return null;
                        const parts = title.split('/');
                        if (parts.length < 2) return null;
                        const sleeveRaw = parts[1].trim().toLowerCase();
                        const sizeRaw = parts[0].trim().toUpperCase();
                        let size = sizeRaw.split('-')[0].trim();
                        if (size === 'XXL') size = '2XL';
                        const sleeve = sleeveRaw.includes('full') ? 'full' : sleeveRaw.includes('half') ? 'half' : null;
                        if (!sleeve) return null;
                        return { size, sleeve };
                }

                const rows = [];
                let srNo = 1;

                for (const product of products) {
                        const image = product.images && product.images.length > 0 ? product.images[0].src : null;
                        const firstVariant = (product.variants || [])[0];
                        const baseSku = firstVariant ? (firstVariant.sku || '').replace(/_FS_.*|_HS_.*/, '').replace(/_M$|_L$|_XL$|_XXL$|_2XL$|_3XL$|_4XL$|_5XL$/, '') : '';

                        const fullStock = {};
                        const halfStock = {};
                        let hasAnyVariant = false;

                        for (const variant of (product.variants || [])) {
                                const parsed = parseVariant(variant.title);
                                if (!parsed) continue;
                                hasAnyVariant = true;
                                const avail = variant.inventory_quantity || 0;
                                const booked = bookedMap[variant.id] || 0;
                                const net = avail - booked;
                                if (parsed.sleeve === 'full') {
                                        fullStock[parsed.size] = net;
                                } else if (parsed.sleeve === 'half') {
                                        halfStock[parsed.size] = net;
                                }
                        }

                        if (!hasAnyVariant) continue;

                        const hsn = product.variants[0] ? (product.variants[0].harmonized_system_code || '') : '';
                        const costingAvg = firstVariant ? parseFloat(firstVariant.price || 0) : 0;

                        rows.push({
                                sr_no: srNo++,
                                product_id: product.id,
                                product_title: product.title,
                                sku: baseSku || (firstVariant ? firstVariant.sku : ''),
                                image: image,
                                full: {
                                        M: fullStock['M'] !== undefined ? fullStock['M'] : null,
                                        L: fullStock['L'] !== undefined ? fullStock['L'] : null,
                                        XL: fullStock['XL'] !== undefined ? fullStock['XL'] : null,
                                        '2XL': fullStock['2XL'] !== undefined ? fullStock['2XL'] : null,
                                        '3XL': fullStock['3XL'] !== undefined ? fullStock['3XL'] : null,
                                        '4XL': fullStock['4XL'] !== undefined ? fullStock['4XL'] : null,
                                        '5XL': fullStock['5XL'] !== undefined ? fullStock['5XL'] : null,
                                },
                                half: {
                                        M: halfStock['M'] !== undefined ? halfStock['M'] : null,
                                        L: halfStock['L'] !== undefined ? halfStock['L'] : null,
                                        XL: halfStock['XL'] !== undefined ? halfStock['XL'] : null,
                                        '2XL': halfStock['2XL'] !== undefined ? halfStock['2XL'] : null,
                                        '3XL': halfStock['3XL'] !== undefined ? halfStock['3XL'] : null,
                                        '4XL': halfStock['4XL'] !== undefined ? halfStock['4XL'] : null,
                                        '5XL': halfStock['5XL'] !== undefined ? halfStock['5XL'] : null,
                                },
                                hsn: hsn,
                                costing_avg: costingAvg
                        });
                }

                res.json({ rows, total: rows.length });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== PACKING QUEUE (sorted by courier pickup time) =====
router.get('/packing/queue', async (req, res) => {
        try {
                const orders = await shopify.getOrders({ limit: 250, status: 'any' });

                // Filter unfulfilled orders only
                const pending = orders.filter(o =>
                        o.fulfillment_status !== 'fulfilled' &&
                        o.financial_status !== 'refunded'
                );

                // Courier priority rules: COD + nearby = surface (pickup later), prepaid + far = air (pickup earlier)
                // We assign a pseudo pickup time based on payment method and tags
                const COURIER_RULES = [
                        { name: 'Bluedart', priority: 1, pickupTime: '14:00', zones: ['air'] },
                        { name: 'Delhivery', priority: 2, pickupTime: '15:00', zones: ['surface', 'air'] },
                        { name: 'DTDC', priority: 3, pickupTime: '16:00', zones: ['surface'] },
                        { name: 'Shiprocket', priority: 4, pickupTime: '17:00', zones: ['surface'] },
                ];

                function detectCourier(order) {
                        const tags = (order.tags || '').toLowerCase();
                        const note = (order.note || '').toLowerCase();
                        for (const c of COURIER_RULES) {
                                if (tags.includes(c.name.toLowerCase()) || note.includes(c.name.toLowerCase())) {
                                        return c;
                                }
                        }
                        // Default: prepaid = Bluedart, COD = Delhivery
                        return order.financial_status === 'paid' ? COURIER_RULES[0] : COURIER_RULES[1];
                }

                function detectAlteration(lineItems) {
                        // Virtual/manipulated sizes have tags like "Alteration:", "Alt:", or variant notes
                        const alterations = [];
                        for (const li of lineItems) {
                                const props = li.properties || [];
                                for (const p of props) {
                                        if ((p.name || '').toLowerCase().includes('alter') ||
                                                (p.name || '').toLowerCase().includes('custom') ||
                                                (p.name || '').toLowerCase().includes('tailor')) {
                                                alterations.push({
                                                        item: li.title,
                                                        variant: li.variant_title,
                                                        instruction: p.name + ': ' + p.value
                                                });
                                        }
                                }
                                // Check if variant title has alteration hints
                                const vt = (li.variant_title || '').toLowerCase();
                                if (vt.includes('custom') || vt.includes('alter') || vt.includes('adjust')) {
                                        alterations.push({
                                                item: li.title,
                                                variant: li.variant_title,
                                                instruction: 'Custom alteration required'
                                        });
                                }
                        }
                        return alterations;
                }

                const queue = pending.map(o => {
                        const courier = detectCourier(o);
                        const alterations = detectAlteration(o.line_items || []);
                        const customerName = o.customer ? ((o.customer.first_name || '') + ' ' + (o.customer.last_name || '')).trim() : 'Guest';
                        const phone = o.customer ? (o.customer.phone || (o.billing_address && o.billing_address.phone) || '') : '';
                        const city = o.shipping_address ? (o.shipping_address.city || '') : '';
                        const state = o.shipping_address ? (o.shipping_address.province || '') : '';
                        const pincode = o.shipping_address ? (o.shipping_address.zip || '') : '';
                        const address = o.shipping_address ? [
                                o.shipping_address.name,
                                o.shipping_address.address1,
                                o.shipping_address.address2,
                                o.shipping_address.city,
                                o.shipping_address.province,
                                o.shipping_address.zip,
                                o.shipping_address.country
                        ].filter(Boolean).join(', ') : '';

                        return {
                                order_id: o.id,
                                order_name: o.name,
                                customer_name: customerName,
                                phone: phone,
                                city: city,
                                state: state,
                                pincode: pincode,
                                address: address,
                                total: o.total_price,
                                payment: o.financial_status,
                                courier: courier.name,
                                pickup_time: courier.pickupTime,
                                priority: courier.priority,
                                line_items: (o.line_items || []).map(li => ({
                                        title: li.title,
                                        variant: li.variant_title,
                                        qty: li.quantity,
                                        sku: li.sku,
                                        price: li.price
                                })),
                                alterations: alterations,
                                has_alteration: alterations.length > 0,
                                packed: false,
                                created_at: o.created_at
                        };
                });

                // Sort by courier priority (earlier pickup first)
                queue.sort((a, b) => a.priority - b.priority);

                res.json({ queue, total: queue.length });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== PACKING SLIP (3-in-1 PDF data) =====
router.get('/packing/slip/:orderId', async (req, res) => {
        try {
                const order = await shopify.getOrderById(req.params.orderId);
                if (!order) return res.status(404).json({ error: 'Order not found' });

                const customerName = order.customer ? ((order.customer.first_name || '') + ' ' + (order.customer.last_name || '')).trim() : 'Guest';
                const phone = order.customer ? (order.customer.phone || (order.billing_address && order.billing_address.phone) || '') : '';

                const shippingAddr = order.shipping_address || {};
                const addressLines = [
                        shippingAddr.name || customerName,
                        shippingAddr.address1,
                        shippingAddr.address2,
                        shippingAddr.city,
                        shippingAddr.province,
                        shippingAddr.zip,
                        shippingAddr.country
                ].filter(Boolean);

                const fulfillment = order.fulfillments && order.fulfillments.length > 0 ? order.fulfillments[0] : null;
                const awb = fulfillment ? fulfillment.tracking_number : null;
                const courierName = fulfillment ? (fulfillment.tracking_company || 'Courier') : 'Pending';

                // Detect alterations from line item properties
                const alterations = [];
                for (const li of (order.line_items || [])) {
                        const props = li.properties || [];
                        for (const p of props) {
                                if ((p.name || '').toLowerCase().includes('alter') ||
                                        (p.name || '').toLowerCase().includes('tailor') ||
                                        (p.name || '').toLowerCase().includes('custom')) {
                                        alterations.push({
                                                item: li.title,
                                                variant: li.variant_title,
                                                qty: li.quantity,
                                                instruction: p.name + ': ' + p.value
                                        });
                                }
                        }
                }

                const slipData = {
                        // Shipping label section
                        shipping_label: {
                                awb: awb || 'PENDING',
                                courier: courierName,
                                to_name: shippingAddr.name || customerName,
                                to_phone: phone,
                                to_address: addressLines.join(', '),
                                to_pincode: shippingAddr.zip || '',
                                from_name: 'Sanganeri Moda',
                                from_address: 'Jaipur, Rajasthan - 302001',
                                from_phone: process.env.BUSINESS_PHONE || '',
                                payment_type: order.financial_status === 'paid' ? 'PREPAID' : 'COD',
                                cod_amount: order.financial_status !== 'paid' ? order.total_price : null,
                                weight: '0.5 kg',
                                order_name: order.name
                        },
                        // Packing slip section
                        packing_slip: {
                                order_name: order.name,
                                order_date: order.created_at,
                                customer_name: customerName,
                                phone: phone,
                                address: addressLines.join(', '),
                                items: (order.line_items || []).map(li => ({
                                        title: li.title,
                                        variant: li.variant_title,
                                        qty: li.quantity,
                                        price: li.price,
                                        sku: li.sku
                                })),
                                subtotal: order.subtotal_price,
                                shipping: order.total_shipping_price_set ? order.total_shipping_price_set.shop_money.amount : '0',
                                total: order.total_price,
                                payment_status: order.financial_status,
                                note: order.note || ''
                        },
                        // Alteration ticket section
                        alteration_ticket: alterations.length > 0 ? {
                                has_alteration: true,
                                order_name: order.name,
                                items: alterations,
                                tailor_sign_required: true
                        } : {
                                has_alteration: false,
                                message: 'No Alteration Required'
                        }
                };

                res.json(slipData);
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== MARK ORDER AS PACKED =====
router.post('/packing/mark-packed/:orderId', async (req, res) => {
        try {
                const { awb } = req.body;
                // In a real system, this would update Shopify fulfillment status
                // For now, we store it in the local store
                const packed = store.getConversations ? (store.packedOrders || {}) : {};
                packed[req.params.orderId] = {
                        packed_at: new Date().toISOString(),
                        awb: awb || 'manual',
                        order_id: req.params.orderId
                };
                if (store.setPacked) store.setPacked(packed);
                res.json({ success: true, message: 'Order marked as packed', order_id: req.params.orderId });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== CONVERSATIONS =====
router.get('/conversations', async (req, res) => {
        try {
                const convs = await Object.values(store.getConversations() || {});
                res.json(convs);
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

router.get('/conversations/:phone', async (req, res) => {
        try {
                const conv = await (store.getConversations() || {})[req.params.phone];
                res.json(conv || { phone: req.params.phone, messages: [] });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== SEND TEXT =====
router.post('/send-text', async (req, res) => {
        try {
                const { to, message } = req.body;
                if (!to || !message) return res.status(400).json({ error: 'Missing to or message' });
                await whatsapp.sendText(to, message);
                res.json({ success: true });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== SEND TEMPLATE =====
router.post('/send-template', async (req, res) => {
        try {
                const { to, templateName, languageCode, components } = req.body;
                if (!to || !templateName) return res.status(400).json({ error: 'Missing to or templateName' });
                const toList = Array.isArray(to) ? to : [to];
                const results = [];
                for (const phone of toList) {
                        try {
                                await whatsapp.sendTemplate(phone, templateName, languageCode || 'en', components || []);
                                results.push({ phone, success: true });
                        } catch (err) {
                                results.push({ phone, success: false, error: err.message });
                        }
                }
                res.json({ results });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

// ===== VERIFICATIONS =====
router.get('/verifications', async (req, res) => {
        try {
                const verifications = await Object.values(store.getPendingVerifications() || {});
                res.json(verifications || []);
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

router.post('/verifications/:orderId/resend', async (req, res) => {
        try {
                const v = await (store.getPendingVerifications() || {})[req.params.orderId];
                if (!v) return res.status(404).json({ error: 'Not found' });
                await whatsapp.sendVerification(v);
                res.json({ success: true });
        } catch (e) {
                res.status(500).json({ error: e.message });
        }
});

module.exports = router;
