const axios = require('axios');
const logger = require('./logger');

function createClient(env, version = '2025-07') {
  const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
  return axios.create({
    baseURL: `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${version}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
  });
}

async function savePrintotecaOrderIdMetafield(orderId, printotecaOrderId, env) {
  const client = createClient(env);
  try {
    await client.post(`/orders/${orderId}/metafields.json`, {
      metafield: {
        namespace: 'printoteca',
        key: 'order_id',
        type: 'single_line_text_field',
        value: String(printotecaOrderId),
      },
    });
    logger.info(`Saved Printoteca order id metafield for Shopify order ${orderId}`);
  } catch (error) {
    logger.error('Failed to save Printoteca order id metafield', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
  }
}

async function savePrintotecaExternalIdMetafield(orderId, externalId, env) {
  const client = createClient(env);
  try {
    await client.post(`/orders/${orderId}/metafields.json`, {
      metafield: {
        namespace: 'printoteca',
        key: 'external_id',
        type: 'single_line_text_field',
        value: String(externalId),
      },
    });
    logger.info(`Saved Printoteca external id metafield for Shopify order ${orderId}`);
  } catch (error) {
    logger.error('Failed to save Printoteca external id metafield', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
  }
}

async function getPrintotecaOrderIdMetafield(orderId, env) {
  const client = createClient(env);
  try {
    const response = await client.get(`/orders/${orderId}/metafields.json`, {
      params: { namespace: 'printoteca', key: 'order_id' },
    });
    const metafields = response.data?.metafields || [];
    const found = metafields.find((mf) => mf.key === 'order_id');
    return found?.value;
  } catch (error) {
    logger.error('Failed to fetch Printoteca metafield from Shopify', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
    return undefined;
  }
}

async function getFulfillmentOrderId(orderId, env) {
  const client = createClient(env);
  try {
    const response = await client.get(`/orders/${orderId}/fulfillment_orders.json`);
    const fulfillmentOrders = response.data?.fulfillment_orders || [];
    const allowedStatuses = ['open', 'unfulfilled', 'scheduled'];
    const found = fulfillmentOrders.find((fo) => (fo?.status ? allowedStatuses.includes(fo.status) : true));
    return found?.id;
  } catch (error) {
    logger.error('Failed to fetch fulfillment orders from Shopify', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
    return undefined;
  }
}

async function syncFulfillmentFromPrintotecaStatus(orderId, printotecaPayload, env) {
  const trackingNumber = printotecaPayload?.shipping?.trackingNumber;
  if (!trackingNumber) {
    logger.info(
      `Printoteca status update for order ${orderId}: ${printotecaPayload?.status || 'unknown'}, no tracking yet`
    );
    return;
  }

  const fulfillmentOrderId = await getFulfillmentOrderId(orderId, env);
  if (!fulfillmentOrderId) {
    logger.warn(`No fulfillment order found for Shopify order ${orderId}`);
    return;
  }

  const client = createClient(env);
  try {
    await client.post('/fulfillments.json', {
      fulfillment: {
        line_items_by_fulfillment_order: [{ fulfillment_order_id: fulfillmentOrderId }],
        tracking_info: {
          number: trackingNumber,
          company: 'Other',
          url: printotecaPayload?.shipping?.trackingUrl,
        },
        notify_customer: true,
      },
    });

    logger.info(`Created Shopify fulfillment for order ${orderId} with tracking ${trackingNumber}`);
  } catch (error) {
    logger.error('Failed to create Shopify fulfillment', {
      orderId,
      trackingNumber,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
  }
}

async function sendTrackingFulfillment(orderId, tracking, env) {
  const client = createClient(env, '2023-10');
  try {
    const fulfillmentOrderId = await getFulfillmentOrderId(orderId, env);
    if (!fulfillmentOrderId) {
      logger.warn(`No fulfillment order found for Shopify order ${orderId}`);
      return null;
    }
    const response = await client.post(`/fulfillments.json`, {
      fulfillment: {
        line_items_by_fulfillment_order: [{ fulfillment_order_id: fulfillmentOrderId }],
        tracking_info: {
          number: tracking.tracking_number,
          url: tracking.tracking_url,
          company: tracking.tracking_company,
        },
        notify_customer: true,
      },
    });
    logger.info('Sent Shopify fulfillment tracking update', { orderId });
    return response.data;
  } catch (error) {
    logger.error('Failed to send Shopify fulfillment tracking', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
    throw error;
  }
}

async function fetchShopifyOrder(orderId, env) {
  const client = createClient(env);
  const response = await client.get(`/orders/${orderId}.json`, {
    params: { status: 'any' },
  });
  return response.data?.order;
}

module.exports = {
  createClient,
  savePrintotecaOrderIdMetafield,
  savePrintotecaExternalIdMetafield,
  getPrintotecaOrderIdMetafield,
  fetchShopifyOrder,
  syncFulfillmentFromPrintotecaStatus,
  sendTrackingFulfillment,
};
