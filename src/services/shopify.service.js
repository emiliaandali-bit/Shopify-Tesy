const logger = require('./logger');
const TransactionLog = require('../models/TransactionLog');
const warehouseService = require('./warehouse.service');
const {
  transformDraftOrderToWarehouse,
  transformPaidOrderToWarehouse,
} = require('./transform.service');
const {
  savePrintotecaOrderIdMetafield,
  getPrintotecaOrderIdMetafield,
} = require('./shopifyAdminClient');

async function processDraftOrder(payload, env) {
  const logEntry = await TransactionLog.create({
    rawShopifyPayload: payload,
    status: 'received',
  });

  try {
    const { data, error } = transformDraftOrderToWarehouse(payload, env);
    if (error) {
      await TransactionLog.update(logEntry.id, { status: 'failed', error });
      return { error, logId: logEntry.id };
    }

    await TransactionLog.update(logEntry.id, {
      status: 'transformed',
      transformedPayload: data,
      warehouseRequest: data,
    });

    const response = await warehouseService.createOrder(data, env);

    await TransactionLog.update(logEntry.id, {
      status: 'sent',
      warehouseResponse: response,
    });

    return { logId: logEntry.id, response };
  } catch (error) {
    logger.error('Failed to process draft order', { error: error?.message });
    await TransactionLog.update(logEntry.id, {
      status: 'failed',
      error: error?.message || 'Unknown error',
    });
    return { error: error?.message || 'Unknown error', logId: logEntry.id };
  }
}

async function processPaidOrder(payload, env) {
  const logEntry = await TransactionLog.create({
    rawShopifyPayload: payload,
    status: 'received',
  });

  try {
    const { data, error } = transformPaidOrderToWarehouse(payload, env);
    if (error) {
      await TransactionLog.update(logEntry.id, { status: 'failed', error });
      return { error, logId: logEntry.id };
    }

    await TransactionLog.update(logEntry.id, {
      status: 'transformed',
      transformedPayload: data,
      warehouseRequest: data,
    });

    const response = await warehouseService.createOrder(data, env);
    const printotecaOrderId = response?.id;

    await TransactionLog.update(logEntry.id, {
      status: 'sent',
      warehouseResponse: response,
    });

    if (printotecaOrderId) {
      const shopifyOrderId = Number(payload?.id);
      if (!Number.isNaN(shopifyOrderId)) {
        await savePrintotecaOrderIdMetafield(shopifyOrderId, String(printotecaOrderId), env);
      } else {
        logger.warn(`Cannot save Printoteca metafield, invalid Shopify order id ${payload?.id}`);
      }
    }

    return { logId: logEntry.id, response };
  } catch (error) {
    logger.error('Failed to process paid order', { error: error?.message });
    await TransactionLog.update(logEntry.id, {
      status: 'failed',
      error: error?.message || 'Unknown error',
    });
    return { error: error?.message || 'Unknown error', logId: logEntry.id };
  }
}

async function processCancelledOrder(payload, env) {
  const orderId = Number(payload?.id);
  if (Number.isNaN(orderId)) {
    return { error: 'Invalid Shopify order id.' };
  }

  const printotecaOrderId = await getPrintotecaOrderIdMetafield(orderId, env);
  if (!printotecaOrderId) {
    logger.warn(`No Printoteca order id metafield found for Shopify order ${orderId}`);
    return { error: 'No Printoteca order id found.' };
  }

  const response = await warehouseService.cancelOrder(printotecaOrderId, env);
  return { response };
}

module.exports = {
  processDraftOrder,
  processPaidOrder,
  processCancelledOrder,
};
