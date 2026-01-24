# Shopify → Printoteca Bridge

Node.js + Express (CommonJS) service that receives Shopify **Orders Paid** webhooks, maps line item properties into Printoteca’s order format, sends the order to Printoteca, and keeps Shopify updated with tags/metafields and fulfillment tracking.

## Quick start

1. Install Node.js 20+.
2. Clone this repository.
3. Copy `.env.example` to `.env` and fill in the values from Shopify and Printoteca.
4. Install dependencies and start:

```bash
npm install
npm run dev
```

The server listens on `PORT` (defaults to `8080`).

## Environment variables

All variables are required unless a default is indicated:

- `PORT` (default `8080`)
- `NODE_ENV` (`development` | `production`)
- `SHOPIFY_WEBHOOK_SECRET` (from Shopify webhook configuration; HMAC verification is currently disabled)
- `SHOPIFY_STORE_DOMAIN` (e.g., `your-store.myshopify.com`)
- `SHOPIFY_ADMIN_ACCESS_TOKEN` (Shopify Admin REST token with Orders/Fulfillment scopes)
- `PRINTOTECA_APP_ID` (from Printoteca)
- `PRINTOTECA_SECRET_KEY` (from Printoteca)
- `PRINTOTECA_BRAND_NAME` (used for legacy flows; current Printoteca payloads set `brand` to `Hugs & Mugs` by design)
- `PRINTOTECA_BASE_URL` (default `https://printoteca.ro/api`)
- `PRINTOTECA_DEFAULT_SHIPPING_METHOD` (`regular` | `recorded` | `courier` | `collection`, default `courier`)
- `PRINTOTECA_ENABLE_SANDBOX` (`true` | `false`; when true, orders are **not** sent to Printoteca and requests are only logged)
- `PRINTO_TECA_WEBHOOK_SECRET` (optional, shared secret to verify Printoteca status webhooks)

Compatibility aliases supported by the app (for teams that already use them elsewhere):
- `DEFAULT_SHIPPING_METHOD` → used when `PRINTOTECA_DEFAULT_SHIPPING_METHOD` is not set
- `PRINTOTECA_API_BASE` → used when `PRINTOTECA_BASE_URL` is not set

## Endpoints

### Shopify webhooks
- `POST /webhooks/shopify/orders-paid` — Receives Shopify paid order payload (either top-level order or `{ order: ... }`). Responds `200` immediately, then:
  - normalizes payload
  - builds Printoteca payload with `external_id = Shopify order id`
  - sends to Printoteca (idempotent based on `printoteca.order_id` metafield)
  - updates Shopify tags/metafields for pipeline status
- `POST /webhooks/shopify/orders-cancelled` — Cancels the linked Printoteca order using the stored `printoteca.order_id` metafield.
- `POST /webhooks/shopify/draft-orders` — Existing draft-order handler (legacy flow).

### Printoteca webhooks
- `POST /webhooks/printoteca/order-status` — Syncs Printoteca status updates to Shopify.
- `POST /webhooks/printoteca/orders-shipped` — Marks Shopify order as shipped and creates a Shopify fulfillment using tracking info (if present).
- `POST /webhooks/printoteca/orders-deleted` — Marks Shopify order as deleted in tags/metafields.

### Internal/debug endpoints
- `POST /debug/transform` — Returns the transformed Printoteca payload without sending to Printoteca.
- `POST /admin/printoteca/resend/:shopifyOrderId` — Reprocesses an existing Shopify order to Printoteca.
  - Default behavior is idempotent; if `printoteca.order_id` exists, it returns `action: "skipped"`.
  - Use `?force=true` to create a new Printoteca order and overwrite the metafield.

### Observability
- `GET /api/logs` — List recent transaction logs.
- `GET /api/logs/:id` — Inspect a specific transaction log.
- `DELETE /api/logs/:id` — Delete a log entry.

### Warehouse helpers
- `GET /api/warehouse/orders/:id` — Fetch Printoteca order status.
- `DELETE /api/warehouse/orders/:id` — Cancel/delete a Printoteca order.

### Health
- `GET /health` — Basic health check.

## Shopify setup (Orders Paid webhook)

1. In Shopify admin, go to **Settings → Notifications → Webhooks**.
2. Create a webhook:
   - Event: **Orders paid (orders/paid)**
   - Format: **JSON**
   - URL: `https://<render-service-name>.onrender.com/webhooks/shopify/orders-paid`
3. Copy the **Webhook signing secret** and set it as `SHOPIFY_WEBHOOK_SECRET` in Render's environment variables (HMAC verification is currently disabled; keep the value for future re-enable).
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

## Project structure (current)

```
render.yaml           # Suggested Render configuration
.env.example          # Sample environment values
src/
  app.js                   # Express app setup
  server.js                # Entrypoint
  routes/
    shopify.routes.js      # Shopify webhooks + admin resend/debug
    warehouse.routes.js    # Printoteca webhooks + logs + warehouse helpers
  controllers/
    shopify.controller.js  # Shopify webhook handling
    admin.controller.js    # Resend endpoint
    printoteca.controller.js # Printoteca shipped webhook
    printotecaDeleted.controller.js # Printoteca deleted webhook
    warehouse.controller.js# Warehouse helpers + logs
  services/
    env.js                 # Env loading + validation
    logger.js              # Simple timestamped logger
    transform.service.js   # Shopify → Printoteca builder
    printoteca.service.js  # Printoteca API client + signing
    shopifyAdminClient.js  # Shopify Admin API helper
    shopifyStatus.service.js # Shopify tags/metafields helper
  models/
    TransactionLog.js      # Transaction log storage
  utils/
    prettyLog.js           # Pretty logging helpers
src/__tests__/transform.test.js # Jest test for Printoteca transform
```

## How mapping works (Printoteca payload)

- Uses `external_id = Shopify order id` to link orders between Shopify and Printoteca.
- Each line item maps to a Printoteca item with:
  - `pn` from `line_item.sku`
  - `title` from `line_item.title`
  - `designs.front` from `_tib_design_link_1`
  - `designs.back` from `_tib_design_link_2` (if present)
  - `mockups.front` from `_customization_image` (if present)
- Optional fields with `null` values are omitted from the final payload.

## Testing

Run Jest tests (after installing dependencies):

```bash
npm test
```

## Notes

- Set `PRINTOTECA_ENABLE_SANDBOX=true` while testing so orders are logged but not sent to Printoteca.
- The orders-paid webhook responds `200` immediately to avoid Shopify retries and then processes asynchronously.
- Printoteca status is visible in Shopify via tags:
  `printoteca:pending`, `printoteca:sent`, `printoteca:failed`, `printoteca:deleted`, `printoteca:shipped`.
