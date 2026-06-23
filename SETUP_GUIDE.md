# Sanganeri Moda - WhatsApp Desk - Setup Guide

This gives you a small server (deployed for free on Render) plus a dashboard website you "install" on your phone like an app. From it you can:

- Send approved WhatsApp template messages to one or many customers
- View live conversations with customers
- Turn on AI auto-reply - Claude answers order status / stock questions automatically by checking your Shopify store
- **NEW: Order Confirmation** - Auto WhatsApp message when a new Shopify order is placed
- **NEW: COD Verification** - Auto WhatsApp verification for Cash On Delivery orders (customer replies CONFIRM or CANCEL)
- **NEW: Order Tracking** - Auto WhatsApp message with tracking number when order is shipped

---

## Part 1 - Get your credentials

You need 4 sets of keys. Get all of these first, then move to Part 2.

### 1. WhatsApp Cloud API (Meta)
- Go to developers.facebook.com and log in with your Facebook account.
- Create an App -> choose Business type -> add the WhatsApp product.
- In WhatsApp > API Setup you'll see:
  - A temporary access token (valid 24h) - for testing only
  - A Phone number ID
- For a permanent token: go to Business Settings > System Users, create a system user, assign it to your WhatsApp app with whatsapp_business_messaging permission, and generate a permanent token. Save this.
- Note down:
  - WHATSAPP_TOKEN = the permanent token
  - WHATSAPP_PHONE_NUMBER_ID = the phone number ID
- Choose any random string yourself for WHATSAPP_VERIFY_TOKEN (e.g. sanganeri_verify_2026) - you'll enter this same value into Meta later.

### 2. Shopify Admin API token
- In your Shopify admin: Settings > Apps and sales channels > Develop apps.
- Click Allow custom app development (if first time), then Create an app.
- Name it e.g. "WhatsApp Desk".
- Under Configuration > Admin API integration, give it these scopes:
  - read_orders
  - read_products
  - read_customers
- Click Install app, then go to API credentials and reveal the Admin API access token. Save it.
- Your SHOPIFY_STORE is sanganeriprintedshirts.myshopify.com.

### 3. Anthropic (Claude) API key
- Go to console.anthropic.com.
- Go to API Keys and create a new key. Save it as ANTHROPIC_API_KEY.
- Add a small amount of credit ($5-10 is plenty to start).

### 4. Choose a dashboard password
- Pick any password for ADMIN_PASSWORD - this protects your dashboard.

---

## Part 2 - Deploy the server to Render (free)

1. Create a free account at render.com.
2. Push this project folder to a GitHub repository (or use Render's "Upload" option if available). Easiest way if you're not familiar with GitHub:
   - Create a new repo on github.com (e.g. sanganeri-whatsapp-bot)
   - Upload all the files from this folder using GitHub's web "Add file > Upload files" feature
3. In Render, click New > Web Service, connect your GitHub repo.
4. Settings:
   - Build Command: npm install
   - Start Command: npm start
   - Instance type: Free
5. Under Environment, add all the variables from .env.example with your real values:
   - ADMIN_PASSWORD
   - WHATSAPP_TOKEN
   - WHATSAPP_PHONE_NUMBER_ID
   - WHATSAPP_VERIFY_TOKEN
   - ANTHROPIC_API_KEY
   - AI_AUTOREPLY_ENABLED = true
   - SHOPIFY_STORE = sanganeriprintedshirts.myshopify.com
   - SHOPIFY_ACCESS_TOKEN
   - SHOPIFY_WEBHOOK_SECRET = (get this from Step below - see Part 4B)
6. Click Create Web Service. Wait for the build to finish - you'll get a URL like https://sanganeri-whatsapp-bot.onrender.com.

---

## Part 3 - Connect the WhatsApp webhook in Meta

1. In your Meta App, go to WhatsApp > Configuration.
2. Under Webhook, click Edit and enter:
   - Callback URL: https://YOUR-RENDER-URL.onrender.com/webhook
   - Verify token: the same WHATSAPP_VERIFY_TOKEN you set in Render
3. Click Verify and save - it should succeed instantly.
4. Under Webhook fields, subscribe to messages.

Now incoming WhatsApp messages will reach your server.

---

## Part 4A - Connect Shopify Webhooks (Order Confirmation + Tracking)

This enables automatic WhatsApp messages when orders are placed or shipped.

1. In your Shopify Admin, go to Settings > Notifications > Webhooks.
2. Click Create webhook:
   - **Order Confirmation & COD Verification:**
     - Event: Order creation
     - Format: JSON
     - URL: https://YOUR-RENDER-URL.onrender.com/shopify/order-created
   - **Order Tracking:**
     - Event: Order fulfillment creation (or "Fulfillments/create")
     - Format: JSON
     - URL: https://YOUR-RENDER-URL.onrender.com/shopify/order-fulfilled
3. After saving each webhook, Shopify shows a **Signing secret** - copy this value and set it as SHOPIFY_WEBHOOK_SECRET in your Render environment variables.

**You can also find your Shopify webhook URLs in the Settings tab of your dashboard app.**

---

## Part 4B - COD Verification Flow

When a customer places a Cash on Delivery order:
1. They automatically receive an Order Confirmation WhatsApp message.
2. They then receive a COD Verification message asking them to reply **CONFIRM** or **CANCEL**.
3. If they reply CONFIRM - order is confirmed and saved.
4. If they reply CANCEL - order is cancelled and saved.
5. You can view and manually manage all pending verifications in the **COD tab** of your dashboard.

---

## Part 5 - Create message templates (for the "Templates" tab)

WhatsApp requires templates to be pre-approved before you can send them to customers (except replies within 24h of a customer messaging you).

1. In Meta Business Manager, go to WhatsApp Manager > Message Templates.
2. Click Create Template, e.g.:
   - Name: order_shipped
   - Category: Utility
   - Body: Hi {{1}}, great news! Your Sanganeri Moda order {{2}} has been shipped. Track it here: {{3}}
3. Submit for approval (usually approved within minutes to a few hours).
4. Once approved, you can send it from the dashboard's Templates tab.

---

## Part 6 - Install the dashboard on your phone

1. Open https://YOUR-RENDER-URL.onrender.com in your phone's browser (Chrome on Android, Safari on iPhone).
2. Enter your ADMIN_PASSWORD to unlock.
3. Android (Chrome): tap the menu (⋮) > Add to Home screen / Install app.
4. iPhone (Safari): tap the Share icon > Add to Home Screen.

---

## Part 7 - Test it

1. **Test Order Confirmation:** Place a test order in Shopify with your phone number - you should get a WhatsApp confirmation.
2. **Test COD Verification:** Place a COD test order - you should get confirmation + verification message. Reply CONFIRM or CANCEL.
3. **Test Tracking:** Fulfill an order in Shopify and add a tracking number - you should get a tracking WhatsApp message.
4. **Test AI reply:** Send a WhatsApp message to your business number, e.g. "What's the status of order 1023?" - with AI ON, Claude should reply automatically.

---

## Troubleshooting

- **Webhook verification fails:** double-check WHATSAPP_VERIFY_TOKEN matches exactly in both Render and Meta, and that the server is awake (visit the URL once first).
- **No order confirmation messages:** Check that SHOPIFY_WEBHOOK_SECRET is set correctly in Render. Check Render logs for errors.
- **Template send fails with "template not found":** the template name/language must exactly match an approved template in WhatsApp Manager.
- **AI replies say "order not found":** confirm SHOPIFY_ACCESS_TOKEN has read_orders and read_products scopes.
- **No replies happen at all:** check Render's Logs tab for errors.

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| ADMIN_PASSWORD | Dashboard login password |
| WHATSAPP_TOKEN | Meta WhatsApp permanent access token |
| WHATSAPP_PHONE_NUMBER_ID | WhatsApp Phone Number ID from Meta |
| WHATSAPP_VERIFY_TOKEN | Any random string for webhook verification |
| ANTHROPIC_API_KEY | Claude API key from console.anthropic.com |
| AI_AUTOREPLY_ENABLED | true or false |
| SHOPIFY_STORE | Your store URL e.g. yourstore.myshopify.com |
| SHOPIFY_ACCESS_TOKEN | Shopify Admin API access token |
| SHOPIFY_WEBHOOK_SECRET | Shopify webhook signing secret (from webhook settings) |
| PORT | Server port (default: 3000, Render sets this automatically) |
