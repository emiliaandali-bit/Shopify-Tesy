const logger = require('../services/logger');
const TransactionLog = require('../models/TransactionLog');
const { sendTrackingFulfillment } = require('../services/shopifyAdminClient');
const {
  upsertOrderMetafield,
  addRemoveOrderTags,
  getOrderMetafield,
} = require('../services/shopifyStatus.service');

async function handleOrderShipped(req, res) {
  const payload = req.body;
  try {
    const shopifyOrderId = Number(payload?.external_id);
    if (!shopifyOrderId) {
      logger.warn('Printoteca orders/shipped missing external_id');
      return res.status(400).json({ error: 'Missing external_id' });
    }

    const existingFulfillmentId = await getOrderMetafield(
      shopifyOrderId,
      'printoteca',
      'fulfillment_id',
      req.app.locals.env
    );
    if (existingFulfillmentId) {
      logger.info('Shopify fulfillment already exists, skipping', {
        shopifyOrderId,
        fulfillmentId: existingFulfillmentId,
      });
      return res.json({ status: 'ok', skipped: true });
    }

    const printotecaOrderId = payload?.id || payload?.printoteca_order_id;
    if (printotecaOrderId) {
      const logEntry = await TransactionLog.findByWarehouseOrderId(printotecaOrderId);
      if (!logEntry) {
        logger.info('No transaction log found for Printoteca shipment', { printotecaOrderId });
      }
    }

    const trackingPayload = {
      tracking_number: payload?.tracking_number || payload?.trackingNumber,
      tracking_url: payload?.tracking_url || payload?.trackingUrl,
      tracking_company: payload?.tracking_company || payload?.trackingCompany || 'Other',
    };

    const trackingNumber = trackingPayload.tracking_number;
    if (trackingNumber) {
      const response = await sendTrackingFulfillment(
        Number(shopifyOrderId),
        trackingPayload,
        req.app.locals.env
      );
      const fulfillmentId = response?.fulfillment?.id || response?.id;
      if (fulfillmentId) {
        await upsertOrderMetafield(
          shopifyOrderId,
          'printoteca',
          'fulfillment_id',
          String(fulfillmentId),
          req.app.locals.env
        );
      }
    }

    await addRemoveOrderTags(
      shopifyOrderId,
      ['printoteca:shipped'],
      ['printoteca:pending', 'printoteca:sent', 'printoteca:failed'],
      req.app.locals.env
    );
    await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'shipped', req.app.locals.env);
    return res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Failed to handle Printoteca orders/shipped', { error: error?.message });
    return res.status(500).json({ error: 'Failed to sync shipment' });
  }
}

module.exports = {
  handleOrderShipped,
};
