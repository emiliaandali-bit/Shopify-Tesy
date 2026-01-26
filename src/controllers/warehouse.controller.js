const logger = require('../services/logger');
const TransactionLog = require('../models/TransactionLog');
const { syncFulfillmentFromPrintotecaStatus } = require('../services/shopifyAdminClient');
const printotecaService = require('../services/printoteca.service');

async function handlePrintotecaStatus(req, res) {
  const env = req.app.locals.env;
  const payload = req.body;

  if (env.PRINTO_TECA_WEBHOOK_SECRET) {
    const providedSecret = req.get('x-printoteca-secret');
    if (providedSecret !== env.PRINTO_TECA_WEBHOOK_SECRET) {
      logger.warn('Invalid Printoteca webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const shopifyOrderIdValue = payload?.external_id ?? payload?.id;
  const shopifyOrderId = Number(shopifyOrderIdValue);
  if (!shopifyOrderIdValue || Number.isNaN(shopifyOrderId)) {
    logger.warn('[WARN] Printoteca webhook missing external_id/id, cannot sync to Shopify');
    return res.json({ status: 'ok' });
  }

  try {
    await syncFulfillmentFromPrintotecaStatus(shopifyOrderId, payload, env);
  } catch (error) {
    logger.error('Failed to sync Printoteca webhook to Shopify', { error: error?.message });
  }

  return res.json({ status: 'ok' });
}

async function listLogs(req, res) {
  const limit = Number(req.query.limit || 20);
  const logs = await TransactionLog.list(limit);
  return res.json({ logs });
}

async function getLog(req, res) {
  const log = await TransactionLog.findById(req.params.id);
  if (!log) {
    return res.status(404).json({ error: 'Log not found' });
  }
  return res.json({ log });
}

async function deleteLog(req, res) {
  const removed = await TransactionLog.deleteById(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Log not found' });
  }
  return res.status(204).send();
}

async function getWarehouseOrderStatus(req, res) {
  try {
    const response = await printotecaService.getOrderStatus(req.params.id, req.app.locals.env);
    return res.json({ status: response });
  } catch (error) {
    logger.error('Failed to fetch warehouse order status', { error: error?.message });
    return res.status(502).json({ error: 'Warehouse unavailable' });
  }
}

async function cancelWarehouseOrder(req, res) {
  try {
    const response = await printotecaService.cancelOrder(req.params.id, req.app.locals.env);
    return res.json({ status: response });
  } catch (error) {
    logger.error('Failed to cancel warehouse order', { error: error?.message });
    return res.status(502).json({ error: 'Warehouse unavailable' });
  }
}

module.exports = {
  handlePrintotecaStatus,
  listLogs,
  getLog,
  deleteLog,
  getWarehouseOrderStatus,
  cancelWarehouseOrder,
};
