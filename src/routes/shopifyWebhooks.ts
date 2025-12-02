import express from 'express';
import logger from '../services/logger';
import { verifyShopifyWebhook } from '../services/shopifyVerifier';
import { handlePaidOrder } from '../services/orderHandler';
import { EnvConfig } from '../services/env';
import { ShopifyOrder } from '../types/shopify';

export default function createShopifyWebhookRouter(env: EnvConfig): express.Router {
  const router = express.Router();

  router.post('/webhooks/shopify/orders-paid', async (req: any, res: any) => {
    const hmac = req.header('X-Shopify-Hmac-Sha256') || req.header('x-shopify-hmac-sha256');
    const rawBody = req.body as any;

    const valid = verifyShopifyWebhook(rawBody, hmac || undefined, env);
    if (!valid) {
      logger.warn('Invalid Shopify webhook HMAC');
      return res.status(401).json({ error: 'Invalid HMAC' });
    }

    try {
      const order = JSON.parse(rawBody.toString('utf-8')) as ShopifyOrder;
      logger.info('Received paid order webhook', {
        id: order.id,
        name: order.name,
        email: order.email,
        total: order.total_price,
      });
      handlePaidOrder(order, env);
    } catch (error) {
      logger.error('Failed to process Shopify webhook', error);
    }

    return res.json({ status: 'ok' });
  });

  return router;
}
