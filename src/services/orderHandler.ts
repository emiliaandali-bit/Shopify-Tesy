import logger from './logger';
import { mapShopifyOrderToPrintoteca } from './mapping';
import { sendOrderToPrintoteca } from './printotecaClient';
import { EnvConfig } from './env';
import { ShopifyOrder } from '../types/shopify';
import { savePrintotecaOrderIdMetafield } from './shopifyAdminClient';

export async function handlePaidOrder(order: ShopifyOrder, env: EnvConfig): Promise<void> {
  try {
    const mappedOrder = await mapShopifyOrderToPrintoteca(order, env);
    if (!mappedOrder) {
      logger.info(`Order ${order.id} has no Printoteca items. Skipping.`);
      return;
    }

    const response = await sendOrderToPrintoteca(mappedOrder, env);
    const printotecaOrderId = (response as any)?.id;

    if (printotecaOrderId) {
      const shopifyOrderId = Number(order.id);
      if (Number.isNaN(shopifyOrderId)) {
        logger.warn(`Cannot save Printoteca metafield, invalid Shopify order id ${order.id}`);
        return;
      }
      await savePrintotecaOrderIdMetafield(shopifyOrderId, String(printotecaOrderId), env);
    } else {
      logger.info(
        'Printoteca order created without id in response (or sandbox). Skipping metafield save.',
        { orderId: order.id }
      );
    }
  } catch (error) {
    logger.error(`Failed to process order ${order.id}: ${(error as Error).message}`);
  }
}
