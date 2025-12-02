import axios from 'axios';
import logger from './logger';
import { EnvConfig } from './env';
import { PrintotecaWebhookOrder } from '../types/printotecaWebhook';

function createClient(env: EnvConfig) {
  return axios.create({
    baseURL: `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-07`,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
  });
}

export async function savePrintotecaOrderIdMetafield(
  orderId: number,
  printotecaOrderId: string,
  env: EnvConfig
): Promise<void> {
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
  } catch (error: any) {
    logger.error('Failed to save Printoteca order id metafield', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
  }
}

export async function getPrintotecaOrderIdMetafield(
  orderId: number,
  env: EnvConfig
): Promise<string | undefined> {
  const client = createClient(env);
  try {
    const response = await client.get(`/orders/${orderId}/metafields.json`);
    const metafields = response.data?.metafields as Array<{ namespace?: string; key?: string; value?: string }>;
    const found = metafields?.find(
      (mf) => mf.namespace === 'printoteca' && mf.key === 'order_id'
    );
    return found?.value;
  } catch (error: any) {
    logger.error('Failed to fetch Printoteca metafield from Shopify', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
    return undefined;
  }
}

async function getFulfillmentOrderId(
  orderId: number,
  env: EnvConfig
): Promise<number | undefined> {
  const client = createClient(env);
  try {
    const response = await client.get(`/orders/${orderId}/fulfillment_orders.json`);
    const fulfillmentOrders = response.data?.fulfillment_orders as Array<{ id: number; status?: string }>;
    const allowedStatuses = ['open', 'unfulfilled', 'scheduled'];
    const found = fulfillmentOrders?.find((fo) =>
      fo?.status ? allowedStatuses.includes(fo.status) : true
    );
    return found?.id;
  } catch (error: any) {
    logger.error('Failed to fetch fulfillment orders from Shopify', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
    return undefined;
  }
}

export async function syncFulfillmentFromPrintotecaStatus(
  orderId: number,
  printotecaPayload: PrintotecaWebhookOrder,
  env: EnvConfig
): Promise<void> {
  const trackingNumber = printotecaPayload.shipping?.trackingNumber;
  if (!trackingNumber) {
    logger.info(
      `Printoteca status update for order ${orderId}: ${printotecaPayload.status || 'unknown'}, no tracking yet`
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
          url: printotecaPayload.shipping?.trackingUrl,
        },
        notify_customer: true,
      },
    });

    logger.info(
      `Created Shopify fulfillment for order ${orderId} with tracking ${trackingNumber}`
    );
  } catch (error: any) {
    logger.error('Failed to create Shopify fulfillment', {
      orderId,
      trackingNumber,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
  }
}
