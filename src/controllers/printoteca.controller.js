const logger = require('../services/logger');
const TransactionLog = require('../models/TransactionLog');
const { sendTrackingFulfillment } = require('../services/shopifyAdminClient');
const { normalizePrintotecaWebhook } = require('../utils/printotecaWebhook.util');
const {
  upsertOrderMetafield,
  addRemoveOrderTags,
  getOrderMetafield,
} = require('../services/shopifyStatus.service');

async function handleOrderShipped(req, res) {
  try {
    const parsed = normalizePrintotecaWebhook(req.body);
    if (!parsed.externalId) {
      logger.warn('Printoteca orders/shipped missing external_id', {
        bodyKeys: Object.keys(parsed.raw || {}),
        orderKeys: Object.keys(parsed.order || {}),
        printotecaId: parsed.printotecaId,
      });
      return res.status(200).send('OK');
    }

    const shopifyOrderId = Number(parsed.externalId);
    if (!Number.isFinite(shopifyOrderId)) {
      logger.warn('Printoteca orders/shipped external_id not numeric', {
        externalId: parsed.externalId,
        printotecaId: parsed.printotecaId,
      });
      return res.status(200).send('OK');
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

    const printotecaOrderId = parsed.printotecaId;
    if (printotecaOrderId) {
      const logEntry = await TransactionLog.findByWarehouseOrderId(printotecaOrderId);
      if (!logEntry) {
        logger.info('No transaction log found for Printoteca shipment', { printotecaOrderId });
      }
    }

    const trackingPayload = {
      tracking_number: parsed.shipping?.trackingNumber || parsed.shipping?.tracking_number,
      tracking_url: parsed.shipping?.trackingUrl || parsed.shipping?.tracking_url,
      tracking_company: parsed.shipping?.trackingCompany || parsed.shipping?.tracking_company || 'Other',
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
