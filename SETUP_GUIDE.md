# Sanganeri Moda - WhatsApp Desk - Setup Guide

This gives you a small server (deployed for free on Render) plus a dashboard
website you "install" on your phone like an app. From it you can:

- Send approved WhatsApp **template messages** to one or many customers
- View live **conversations** with customers
- Turn on **AI auto-reply** - Claude answers order status / stock questions
  automatically by checking your Shopify store

---

## Part 1 - Get your credentials

You need 4 sets of keys. Get all of these first, then move to Part 2.

### 1. WhatsApp Cloud API (Meta)

1. Go to [developers.facebook.com](https://developers.facebook.com) and log in
   with your Facebook account.
2. Create an App -> choose **Business** type -> add the **WhatsApp** product.
3. In **WhatsApp > API Setup** you'll see:
   - A **temporary access token** (valid 24h) - for testing only
   - A **Phone number ID**
4. For a permanent token: go to **Business Settings > System Users**, create a
   system user, assign it to your WhatsApp app with `whatsapp_business_messaging`
   permission, and generate a **permanent token**. Save this.
5. Note down:
   - `WHATSAPP_TOKEN` = the permanent token
   - `WHATSAPP_PHONE_NUMBER_ID` = the phone number ID
6. Choose any random string yourself for `WHATSAPP_VERIFY_TOKEN`
   (e.g. `sanganeri_verify_2026`) - you'll enter this same value into Meta later.

### 2. Shopify Admin API token

1. In your Shopify admin: **Settings > Apps and sales channels > Develop apps**.
2. Click **Allow custom app development** (if first time), then **Create an app**.
3. Name it e.g. "WhatsApp Desk".
4. Under **Configuration > Admin API integration**, give it these scopes:
   - `read_orders`
   - `read_products`
   - `read_customers`
5. Click **Install app**, then go to **API credentials** and reveal the
   **Admin API access token**. Save it.
6. Your `SHOPIFY_STORE` is `sanganeriprintedshirts.myshopify.com`.

### 3. Anthropic (Claude) API key

1. Go to [console.anthropic.com](https://console.anthropic.com).
2. Go to **API Keys** and create a new key. Save it as `ANTHROPIC_API_KEY`.
3. Add a small amount of credit ($5-10 is plenty to start).

### 4. Choose a dashboard password

Pick any password for `ADMIN_PASSWORD` - this protects your dashboard.

---

## Part 2 - Deploy the server to Render (free)

1. Create a free account at [render.com](https://render.com).
2. Push this project folder to a GitHub repository (or use Render's "Upload"
   option if available). Easiest way if you're not familiar with GitHub:
   - Create a new repo on github.com (e.g. `sanganeri-whatsapp-bot`)
   - Upload all the files from this folder using GitHub's web "Add file >
     Upload files" feature
3. In Render, click **New > Web Service**, connect your GitHub repo.
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance type**: Free
5. Under **Environment**, add all the variables from `.env.example` with your
   real values:
   - `ADMIN_PASSWORD`
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN`
   - `ANTHROPIC_API_KEY`
   - `AI_AUTOREPLY_ENABLED` = `true`
   - `SHOPIFY_STORE` = `sanganeriprintedshirts.myshopify.com`
   - `SHOPIFY_ACCESS_TOKEN`
6. Click **Create Web Service**. Wait for the build to finish - you'll get a
   URL like `https://sanganeri-whatsapp-bot.onrender.com`.

> **Note on the free tier**: Render's free service "sleeps" after ~15 minutes
> of inactivity and wakes up on the next request (takes ~30-50 seconds). This
> is fine for WhatsApp - Meta will retry the webhook. If you want it always-on
> later, upgrade to Render's paid starter plan (~$7/month).

> **Note on storage**: conversation history is stored in a JSON file on the
> server. On Render's free tier this file is wiped on redeploys/restarts.
> This is fine to start with - if you want permanent history later, that can
> be upgraded to a small database.

---

## Part 3 - Connect the webhook in Meta

1. In your Meta App, go to **WhatsApp > Configuration**.
2. Under **Webhook**, click **Edit** and enter:
   - **Callback URL**: `https://YOUR-RENDER-URL.onrender.com/webhook`
   - **Verify token**: the same `WHATSAPP_VERIFY_TOKEN` you set in Render
3. Click **Verify and save** - it should succeed instantly.
4. Under **Webhook fields**, subscribe to **messages**.

Now incoming WhatsApp messages will reach your server.

---

## Part 4 - Create message templates (for the "Templates" tab)

WhatsApp requires templates to be **pre-approved** before you can send them to
customers (except replies within 24h of a customer messaging you).

1. In Meta Business Manager, go to **WhatsApp Manager > Message Templates**.
2. Click **Create Template**, e.g.:
   - Name: `order_shipped`
   - Category: Utility
   - Body: `Hi {{1}}, great news! Your Sanganeri Moda order {{2}} has been
     shipped. Track it here: {{3}}`
3. Submit for approval (usually approved within minutes to a few hours).
4. Once approved, you can send it from the dashboard's **Templates** tab -
   enter the template name (`order_shipped`), language code (e.g. `en_US`),
   and the variable values in order (e.g. `Madhav, #1023, https://tracking...`).

---

## Part 5 - Install the dashboard on your phone

1. Open `https://YOUR-RENDER-URL.onrender.com` in your phone's browser
   (Chrome on Android, Safari on iPhone).
2. Enter your `ADMIN_PASSWORD` to unlock.
3. **Android (Chrome)**: tap the menu (⋮) > **Add to Home screen** / **Install app**.
4. **iPhone (Safari)**: tap the Share icon > **Add to Home Screen**.
5. The app icon will appear on your home screen and open full-screen like a
   normal app.

---

## Part 6 - Test it

1. Send a WhatsApp message from your personal phone to your business number,
   e.g. "What's the status of order 1023?"
2. With AI auto-reply ON (toggle in **Settings**), Claude should look up the
   order in Shopify and reply automatically.
3. Open the **Chats** tab in your dashboard - you should see the conversation
   appear, and you can reply manually any time.
4. Try sending a template from the **Templates** tab to your own number to
   confirm template sending works.

---

## Troubleshooting

- **Webhook verification fails**: double-check `WHATSAPP_VERIFY_TOKEN` matches
  exactly in both Render and Meta, and that the server is awake (visit the URL
  once first).
- **Template send fails with "template not found"**: the template name/language
  must exactly match an *approved* template in WhatsApp Manager.
- **AI replies say "order not found"**: confirm `SHOPIFY_ACCESS_TOKEN` has
  `read_orders` and `read_products` scopes, and that the order number format
  matches (e.g. `1023` or `#1023`).
- **No replies happen at all**: check Render's **Logs** tab for errors -
  usually a missing/incorrect environment variable.
