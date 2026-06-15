const axios = require('axios');
const shopify = require('./shopify');

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a friendly WhatsApp customer support assistant for Sanganeri Moda, an e-commerce brand selling Sanganeri print cotton shirts, based in Jaipur, India (Somnath Enterprises).

Guidelines:
- Reply in whatever language/style the customer uses (Hindi, English, or Hinglish), keep it natural.
- Keep replies short and warm - 2 to 4 sentences, suitable for WhatsApp.
- For questions about order status or product stock, ALWAYS use the provided tools to get real data before answering. Never guess or make up order details, prices, or stock numbers.
- If an order or product can't be found, say so politely and offer to connect them with the team.
- For complaints, returns, exchanges, or anything sensitive, be empathetic, do not make promises about refunds/policy, and say a team member will follow up shortly.
- Do not discuss anything unrelated to Sanganeri Moda's products and orders.`;

const tools = [
  {
    name: 'get_order_status',
    description: 'Look up a Shopify order by order number (e.g. 1023 or #1023) to get its status, items, payment status, and tracking info.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: { type: 'string', description: 'The order number, with or without #' },
      },
      required: ['order_number'],
    },
  },
  {
    name: 'get_orders_by_phone',
    description: "Find recent Shopify orders placed using the customer's WhatsApp phone number. Use this when the customer asks about 'my order' without giving an order number.",
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Customer phone number with country code' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'check_stock',
    description: 'Check stock availability and price for a product by name or partial name/keyword.',
    input_schema: {
      type: 'object',
      properties: {
        product_title: { type: 'string', description: 'Product name or keyword to search for, e.g. "blue sanganeri shirt"' },
      },
      required: ['product_title'],
    },
  },
];

async function callClaude(messages) {
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      tools,
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );
  return res.data;
}

async function executeTool(name, input, customerPhone) {
  try {
    if (name === 'get_order_status') {
      const order = await shopify.getOrderByName(input.order_number);
      if (!order) return JSON.stringify({ error: 'Order not found' });
      return JSON.stringify({
        order_number: order.name,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        total_price: order.total_price,
        currency: order.currency,
        items: order.line_items.map((li) => ({ title: li.title, qty: li.quantity })),
        tracking_number: order.fulfillments?.[0]?.tracking_number || null,
        tracking_company: order.fulfillments?.[0]?.tracking_company || null,
      });
    }
    if (name === 'get_orders_by_phone') {
      const orders = await shopify.getOrdersByPhone(input.phone || customerPhone);
      return JSON.stringify(
        orders.slice(0, 5).map((o) => ({
          order_number: o.name,
          fulfillment_status: o.fulfillment_status,
          financial_status: o.financial_status,
          total_price: o.total_price,
          created_at: o.created_at,
        }))
      );
    }
    if (name === 'check_stock') {
      const products = await shopify.checkStock(input.product_title);
      return JSON.stringify(products);
    }
    return JSON.stringify({ error: 'Unknown tool' });
  } catch (e) {
    return JSON.stringify({ error: e.response?.data?.errors || e.message });
  }
}

// conversationHistory: array of { role: 'user'|'assistant', content: string }
async function generateReply(conversationHistory, customerPhone) {
  let messages = conversationHistory.map((m) => ({ role: m.role, content: m.content }));
  let data = await callClaude(messages);

  let loops = 0;
  while (data.stop_reason === 'tool_use' && loops < 4) {
    loops++;
    const toolUses = data.content.filter((c) => c.type === 'tool_use');
    messages.push({ role: 'assistant', content: data.content });

    const toolResults = [];
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input, customerPhone);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
    data = await callClaude(messages);
  }

  const textBlock = data.content.find((c) => c.type === 'text');
  return textBlock ? textBlock.text : "Sorry, I couldn't process that right now. Our team will follow up with you shortly.";
}

module.exports = { generateReply };
