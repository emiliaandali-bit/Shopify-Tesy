const logger = require('../services/logger');
const { processDraftOrder, processPaidOrder, processCancelledOrder } = require('../services/shopify.service');
const { safeJsonParse } = require('../utils/safeAccess');

function parseShopifyPayload(req) {
  if (Buffer.isBuffer(req.body)) {
    const rawText = req.body.toString('utf8');
    return safeJsonParse(rawText, null);
  }
  return req.body;
}

async function handleDraftOrder(req, res) {
  const payload = parseShopifyPayload(req);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const result = await processDraftOrder(payload, req.app.locals.env);
  if (result.error) {
    return res.status(422).json({ error: result.error, logId: result.logId });
  }
  return res.status(202).json({ status: 'queued', logId: result.logId });
}

async function handleOrdersPaid(req, res) {
  const payload = parseShopifyPayload(req);
  if (!payload) {
    logger.error('Failed to parse Shopify paid order payload');
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  await processPaidOrder(payload, req.app.locals.env);
  return res.json({ status: 'ok' });
}

async function handleOrdersCancelled(req, res) {
  const payload = parseShopifyPayload(req);
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
  handleOrdersPaid,
  handleOrdersCancelled,
};
