import logger from './logger';
import { mapShopifyOrderToPrintoteca } from './mapping';
import { sendOrderToPrintoteca } from './printotecaClient';
import { EnvConfig } from './env';
import { ShopifyOrder } from '../types/shopify';

export async function handlePaidOrder(order: ShopifyOrder, env: EnvConfig): Promise<void> {
  try {
    const mappedOrder = await mapShopifyOrderToPrintoteca(order, env);
    if (!mappedOrder) {
      logger.info(`Order ${order.id} has no Printoteca items. Skipping.`);
      return;
    }

    await sendOrderToPrintoteca(mappedOrder, env);
  } catch (error) {
    logger.error(`Failed to process order ${order.id}: ${(error as Error).message}`, error);
  }
}
