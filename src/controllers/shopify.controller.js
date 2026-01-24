const logger = require('../services/logger');
const { processDraftOrder, processCancelledOrder } = require('../services/shopify.service');
const { buildPrintotecaOrderFromShopify } = require('../services/transform.service');
const printotecaService = require('../services/printoteca.service');
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

function handleTransformPreview(req, res) {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  try {
    const transformed = buildPrintotecaOrderFromShopify(payload);
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

  logger.info('Shopify orders-paid payload', payload);
  try {
    const draftOrder = payload?.draft_order;
    if (!draftOrder?.line_items?.length) {
      logger.warn('Shopify orders-paid missing draft_order.line_items');
      return res.status(400).json({ error: 'Missing draft_order line_items' });
    }

    const transformed = buildPrintotecaOrderFromShopify(payload);
    const requestMeta = printotecaService.buildCreateRequest(transformed, req.app.locals.env);

    logBox('SHOPIFY_WEBHOOK_RECEIVED', [
      `draft_order_id: ${draftOrder?.id || ''}`,
      `line_items: ${draftOrder?.line_items?.length || 0}`,
    ]);
    logJson('PRINTOTECA_TRANSFORMED', transformed);
    logBox('PRINTOTECA_REQUEST', [
      `url: ${requestMeta.urlMasked}`,
      `bodyLength: ${requestMeta.bodyLength}`,
      `bodySha1: ${requestMeta.bodySha1}`,
    ]);

    void printotecaService
      .createOrder(transformed, req.app.locals.env)
      .then((response) => {
        logJson('PRINTOTECA_RESPONSE', response);
      })
      .catch((error) => {
        logger.error('Printoteca create order failed', { error: error?.message });
      });
  } catch (error) {
    logger.error('Failed to send order to Printoteca', { error: error?.message });
  }
  return res.json({ status: 'ok' });
}

async function handleOrdersCancelled(req, res) {
  const payload = req.body;
  if (!payload) {
    logger.error('Failed to parse Shopify cancelled order payload');
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  try {
    await processCancelledOrder(payload, req.app.locals.env);
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
};
