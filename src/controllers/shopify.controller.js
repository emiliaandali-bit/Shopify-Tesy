const logger = require('../services/logger');
const { processDraftOrder, processCancelledOrder } = require('../services/shopify.service');
const { buildPrintotecaOrderFromShopify } = require('../services/transform.service');
const printotecaService = require('../services/printoteca.service');
const {
  savePrintotecaOrderIdMetafield,
  savePrintotecaExternalIdMetafield,
} = require('../services/shopifyAdminClient');
const {
  upsertOrderMetafield,
  addRemoveOrderTags,
  getOrderMetafield,
} = require('../services/shopifyStatus.service');
const { logBox, logJson } = require('../utils/prettyLog');

async function handleDraftOrder(req, res) {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const result = await processDraftOrder(payload, req.app.locals.env);
  if (result.error) {
    return res.status(422).json({ error: result.error, logId: result.logId });
  }
  return res.status(202).json({ status: 'queued', logId: result.logId });
}

function normalizeShopifyOrder(body) {
  const order = body?.order ? body.order : body;
  return {
    shopifyOrderId: order?.id,
    createdAt: order?.created_at,
    shippingAddress: order?.shipping_address,
    lineItems: order?.line_items || [],
    tags: order?.tags || '',
    customerEmail: order?.email,
    raw: order,
  };
}

function handleTransformPreview(req, res) {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  try {
    const normalized = normalizeShopifyOrder(payload);
    const transformed = buildPrintotecaOrderFromShopify(normalized);
    return res.json(transformed);
  } catch (error) {
    logger.error('Failed to transform preview payload', { error: error?.message });
    return res.status(400).json({ error: error?.message || 'Invalid payload' });
  }
}

async function handleOrdersPaid(req, res) {
  const payload = req.body;
  if (!payload) {
    logger.error('Failed to parse Shopify paid order payload');
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      const normalized = normalizeShopifyOrder(payload);
      if (!normalized?.lineItems?.length) {
        logger.warn('Shopify orders-paid missing line_items');
        return;
      }

      const shopifyOrderId = normalized.shopifyOrderId;
      if (!shopifyOrderId) {
        logger.warn('Shopify orders-paid missing order id');
        return;
      }

      await addRemoveOrderTags(
        shopifyOrderId,
        ['printoteca:pending'],
        ['printoteca:failed', 'printoteca:sent', 'printoteca:deleted', 'printoteca:shipped'],
        req.app.locals.env
      );
      await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'pending', req.app.locals.env);
      await upsertOrderMetafield(
        shopifyOrderId,
        'printoteca',
        'external_id',
        String(shopifyOrderId),
        req.app.locals.env
      );

      const existingPrintotecaId = await getOrderMetafield(
        shopifyOrderId,
        'printoteca',
        'order_id',
        req.app.locals.env
      );
      if (existingPrintotecaId) {
        logger.info(`Already linked to Printoteca id ${existingPrintotecaId}, skipping create`);
        await addRemoveOrderTags(
          shopifyOrderId,
          ['printoteca:sent'],
          ['printoteca:pending', 'printoteca:failed'],
          req.app.locals.env
        );
        await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'sent', req.app.locals.env);
        return;
      }

      const transformed = buildPrintotecaOrderFromShopify(normalized);
      const requestMeta = printotecaService.buildCreateRequest(transformed, req.app.locals.env);

      logBox('SHOPIFY_WEBHOOK_RECEIVED', [
        `shopify_order_id: ${shopifyOrderId}`,
        `line_items: ${normalized?.lineItems?.length || 0}`,
        `email: ${normalized?.customerEmail || ''}`,
        `ship_country: ${normalized?.shippingAddress?.country || ''}`,
      ]);
      logJson('PRINTOTECA_TRANSFORMED', transformed);
      logBox('PRINTOTECA_REQUEST', [
        `url: ${requestMeta.urlMasked}`,
        `bodyLength: ${requestMeta.bodyLength}`,
        `bodySha1: ${requestMeta.bodySha1}`,
      ]);

      try {
        const response = await printotecaService.createOrder(transformed, req.app.locals.env);
        logJson('PRINTOTECA_RESPONSE', response);
        const printotecaId = response?.id;
        if (printotecaId) {
          await savePrintotecaOrderIdMetafield(shopifyOrderId, String(printotecaId), req.app.locals.env);
          await savePrintotecaExternalIdMetafield(
            shopifyOrderId,
            String(shopifyOrderId),
            req.app.locals.env
          );
          await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'sent', req.app.locals.env);
          await upsertOrderMetafield(
            shopifyOrderId,
            'printoteca',
            'last_sent_at',
            new Date().toISOString(),
            req.app.locals.env
          );
          await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'last_error', '', req.app.locals.env);
          await addRemoveOrderTags(
            shopifyOrderId,
            ['printoteca:sent'],
            ['printoteca:pending', 'printoteca:failed'],
            req.app.locals.env
          );
        }
      } catch (error) {
        const errorMessage = error?.message || 'Printoteca create failed';
        await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'failed', req.app.locals.env);
        await upsertOrderMetafield(
          shopifyOrderId,
          'printoteca',
          'last_error',
          errorMessage,
          req.app.locals.env
        );
        await addRemoveOrderTags(
          shopifyOrderId,
          ['printoteca:failed'],
          ['printoteca:pending'],
          req.app.locals.env
        );
        logger.error('Printoteca create order failed', { error: errorMessage });
      }
    } catch (error) {
      logger.error('Failed to send order to Printoteca', { error: error?.message });
    }
  });

  return undefined;
}

async function handleOrdersCancelled(req, res) {
  const payload = req.body;
  if (!payload) {
    logger.error('Failed to parse Shopify cancelled order payload');
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  try {
    const normalized = normalizeShopifyOrder(payload);
    await processCancelledOrder(normalized?.shopifyOrderId, req.app.locals.env);
  } catch (error) {
    logger.error('Failed to process Shopify cancelled order', { error: error?.message });
  }

  return res.json({ status: 'ok' });
}

module.exports = {
  handleDraftOrder,
  handleTransformPreview,
  handleOrdersPaid,
  handleOrdersCancelled,
  normalizeShopifyOrder,
};
