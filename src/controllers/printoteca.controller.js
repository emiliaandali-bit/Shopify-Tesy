const logger = require('../services/logger');
const TransactionLog = require('../models/TransactionLog');
const { sendTrackingFulfillment } = require('../services/shopifyAdminClient');

async function handleOrderShipped(req, res) {
  const payload = req.body;
  const printotecaOrderId = payload?.printoteca_order_id || payload?.id;
  if (!printotecaOrderId) {
    logger.warn('Printoteca orders/shipped missing printoteca_order_id');
    return res.status(400).json({ error: 'Missing printoteca_order_id' });
  }

  try {
    const logEntry = await TransactionLog.findByWarehouseOrderId(printotecaOrderId);
    const shopifyOrderId = logEntry?.rawShopifyPayload?.id || logEntry?.transformedPayload?.external_id;
    if (!shopifyOrderId) {
      logger.warn('Unable to resolve Shopify order for Printoteca shipment', { printotecaOrderId });
      return res.status(404).json({ error: 'Shopify order not found' });
    }

    const trackingPayload = {
      tracking_number: payload?.tracking_number || payload?.trackingNumber,
      tracking_url: payload?.tracking_url || payload?.trackingUrl,
      tracking_company: payload?.tracking_company || payload?.trackingCompany || 'Other',
    };

    await sendTrackingFulfillment(Number(shopifyOrderId), trackingPayload, req.app.locals.env);
    return res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Failed to handle Printoteca orders/shipped', { error: error?.message });
    return res.status(500).json({ error: 'Failed to sync shipment' });
  }
}

module.exports = {
  handleOrderShipped,
};
