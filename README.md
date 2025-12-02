# Shopify → Printoteca Bridge

Node.js + TypeScript service that receives Shopify **Order Paid** webhooks, extracts Teeinblue design links from line items, maps them to Printoteca's order format, and sends them to Printoteca.

## Quick start

1. Install Node.js 20+.
2. Clone this repository.
3. Copy `.env.example` to `.env` and fill in the values from Shopify and Printoteca.
4. Install dependencies and start in watch mode:

```bash
npm install
npm run dev
```

The server listens on `PORT` (defaults to `8080`).

## Environment variables

All variables are required unless a default is indicated:

- `PORT` (default `8080`)
- `NODE_ENV` (`development` | `production`)
- `SHOPIFY_WEBHOOK_SECRET` (from Shopify webhook configuration)
- `PRINTOTECA_APP_ID` (from Printoteca)
- `PRINTOTECA_SECRET_KEY` (from Printoteca)
- `PRINTOTECA_BRAND_NAME`
- `PRINTOTECA_BASE_URL` (default `https://printoteca.ro/api`)
- `PRINTOTECA_DEFAULT_SHIPPING_METHOD` (`regular` | `recorded` | `courier` | `collection`, default `courier`)
- `PRINTOTECA_ENABLE_SANDBOX` (`true` | `false`; when true, orders are **not** sent to Printoteca and requests are only logged)

Compatibility aliases supported by the app (for teams that already use them elsewhere):
- `DEFAULT_SHIPPING_METHOD` → used when `PRINTOTECA_DEFAULT_SHIPPING_METHOD` is not set
- `PRINTOTECA_API_BASE` → used when `PRINTOTECA_BASE_URL` is not set

## Endpoints

- `POST /webhooks/shopify/orders-paid` — Shopify webhook endpoint. It validates the HMAC header and triggers order mapping and submission.
- `GET /health` — Basic health check.
- `GET /debug/order-schema` — Example Printoteca order payload for quick reference.

## Shopify setup (Orders Paid webhook)

1. In Shopify admin, go to **Settings → Notifications → Webhooks**.
2. Create a webhook:
   - Event: **Orders paid (orders/paid)**
   - Format: **JSON**
   - URL: `https://<render-service-name>.onrender.com/webhooks/shopify/orders-paid`
3. Copy the **Webhook signing secret** and set it as `SHOPIFY_WEBHOOK_SECRET` in Render's environment variables.
4. Create or update Shopify products so that:
   - The SKU matches the Printoteca product code.
   - The `vendor` or `product_type` field is set to `Printoteca` (used to filter which items to send).
   - Teeinblue adds design URLs to line item properties (e.g., `_tib_design_link_1`, `_tib_design_link_2`, or `_customization_image`).
5. Place a test order. In Render logs you should see:
   - The webhook received
   - Mapping performed
   - Either sandbox output or a real API response from Printoteca

## Deployment on Render.com

1. Push this repository to GitHub.
2. In Render, create a **Web Service** linked to the repo.
3. Use these commands:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
4. Add the environment variables from `.env.example` to the Render service.
5. Enable auto-deploy on new commits (optional).
6. After deploy, set the Shopify webhook URL to the Render service address.

## Project structure

```
render.yaml           # Suggested Render configuration
.env.example          # Sample environment values
src/
  index.ts            # Entrypoint (loads env + starts server)
  server.ts           # Express app setup
  routes/
    shopifyWebhooks.ts# Webhook endpoint with HMAC verification
    health.ts         # Health + debug routes
  services/
    env.ts            # Env loading + validation
    logger.ts         # Simple timestamped logger
    shopifyVerifier.ts# HMAC verification helper
    mapping.ts        # Shopify → Printoteca mapper
    printotecaClient.ts# API client with signing
    orderHandler.ts   # Orchestrates mapping + sending
  types/
    shopify.ts        # Minimal Shopify types used
    printoteca.ts     # Printoteca payload types
src/__tests__/mapping.test.ts # Jest tests for mapping helpers
```

## How mapping works

- Only line items with a SKU **and** vendor/product_type `Printoteca` are sent.
- Design links are read from line item properties in this order:
  1. `_tib_design_link_1` → `designs.front`
  2. `_tib_design_link_2` → `designs.back`
  3. `_customization_image` → fallback for `designs.front` and also stored as a mockup
- Personalization properties are concatenated into the item description for easy reference.
- Shipping method is inferred from the first Shopify shipping line; if nothing matches, the default shipping method is used.

## Testing

Run Jest tests (after installing dependencies):

```bash
npm test
```

## Notes

- Set `PRINTOTECA_ENABLE_SANDBOX=true` while testing so orders are logged but not sent to Printoteca.
- The webhook route always responds `200` after HMAC validation to keep Shopify satisfied, even if internal processing fails (errors are logged).
