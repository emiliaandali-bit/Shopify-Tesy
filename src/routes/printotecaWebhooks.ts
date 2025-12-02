import express from 'express';
import logger from '../services/logger';
import { EnvConfig } from '../services/env';
import { syncFulfillmentFromPrintotecaStatus } from '../services/shopifyAdminClient';
import { PrintotecaWebhookOrder } from '../types/printotecaWebhook';

export default function createPrintotecaWebhookRouter(env: EnvConfig) {
  const router = express.Router();

  router.post('/webhooks/printoteca/order-status', async (req: any, res: any) => {
    const payload = req.body as PrintotecaWebhookOrder;

    if (env.PRINTO_TECA_WEBHOOK_SECRET) {
      const providedSecret = req.header('x-printoteca-secret');
      if (providedSecret !== env.PRINTO_TECA_WEBHOOK_SECRET) {
        logger.warn('Invalid Printoteca webhook secret');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const shopifyOrderIdValue = payload.external_id ?? payload.id;
    const shopifyOrderId = Number(shopifyOrderIdValue);
    if (!shopifyOrderIdValue || Number.isNaN(shopifyOrderId)) {
      logger.warn('[WARN] Printoteca webhook missing external_id/id, cannot sync to Shopify');
      return res.json({ status: 'ok' });
    }

    try {
      await syncFulfillmentFromPrintotecaStatus(shopifyOrderId, payload, env);
    } catch (error) {
      logger.error('Failed to sync Printoteca webhook to Shopify', error);
    }

    return res.json({ status: 'ok' });
  });

  return router;
}
