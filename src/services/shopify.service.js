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
  fetchShopifyOrder,
} = require('./shopifyAdminClient');

const DESIGN_LINK_DELAY_MS = 5 * 60 * 1000;

function hasDesignLinks(items = []) {
  return items.every((item) => item?.designs && (item.designs.front || item.designs.back));
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToWarehouseWithDelay({ data, env, logEntry, refreshOrderId, refreshTransform }) {
  let payloadToSend = data;

  if (!hasDesignLinks(payloadToSend.items)) {
    logger.warn('Design links missing, delaying Printoteca send', {
      externalId: payloadToSend.external_id,
    });
    await TransactionLog.update(logEntry.id, {
      status: 'delayed',
      error: 'Missing design links, delayed before sending to Printoteca.',
    });
    await delay(DESIGN_LINK_DELAY_MS);
  }

  if (!hasDesignLinks(payloadToSend.items) && refreshOrderId && refreshTransform) {
    const refreshedOrder = await fetchShopifyOrder(refreshOrderId, env);
    const { data: refreshedData } = refreshTransform(refreshedOrder, env);
    if (refreshedData) {
      payloadToSend = refreshedData;
      await TransactionLog.update(logEntry.id, {
        status: 'retransformed',
        transformedPayload: refreshedData,
        warehouseRequest: refreshedData,
      });
    }
  }

  if (!hasDesignLinks(payloadToSend.items)) {
    const errorMessage = 'Missing design links after delay. Not sending to Printoteca.';
    logger.error(errorMessage, { externalId: payloadToSend.external_id });
    await TransactionLog.update(logEntry.id, { status: 'failed', error: errorMessage });
    return null;
  }

  const response = await warehouseService.createOrder(payloadToSend, env);
  await TransactionLog.update(logEntry.id, {
    status: 'sent',
    warehouseResponse: response,
  });
  return response;
}

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

    void sendToWarehouseWithDelay({ data, env, logEntry }).catch((error) => {
      logger.error('Failed to send draft order to warehouse', { error: error?.message });
    });

    return { logId: logEntry.id };
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

    const refreshOrderId = Number(payload?.id);
    void sendToWarehouseWithDelay({
      data,
      env,
      logEntry,
      refreshOrderId: Number.isNaN(refreshOrderId) ? null : refreshOrderId,
      refreshTransform: transformPaidOrderToWarehouse,
    })
      .then(async (response) => {
        const printotecaOrderId = response?.id;
        if (printotecaOrderId) {
          const shopifyOrderId = Number(payload?.id);
          if (!Number.isNaN(shopifyOrderId)) {
            await savePrintotecaOrderIdMetafield(shopifyOrderId, String(printotecaOrderId), env);
          } else {
            logger.warn(`Cannot save Printoteca metafield, invalid Shopify order id ${payload?.id}`);
          }
        }
      })
      .catch((error) => {
        logger.error('Failed to send paid order to warehouse', { error: error?.message });
      });

    return { logId: logEntry.id };
  } catch (error) {
    logger.error('Failed to process paid order', { error: error?.message });
    await TransactionLog.update(logEntry.id, {
      status: 'failed',
      error: error?.message || 'Unknown error',
    });
    return { error: error?.message || 'Unknown error', logId: logEntry.id };
  }
}

async function processCancelledOrder(orderId, env) {
  const numericOrderId = Number(orderId);
  if (Number.isNaN(numericOrderId)) {
    return { error: 'Invalid Shopify order id.' };
  }

  const printotecaOrderId = await getPrintotecaOrderIdMetafield(numericOrderId, env);
  if (!printotecaOrderId) {
    logger.warn(`No Printoteca order id metafield found for Shopify order ${numericOrderId}`);
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
