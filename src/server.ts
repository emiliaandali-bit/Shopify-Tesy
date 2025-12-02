import express, { NextFunction, Request, Response } from 'express';
import healthRouter from './routes/health';
import createShopifyWebhookRouter from './routes/shopifyWebhooks';
import { EnvConfig } from './services/env';
import logger from './services/logger';

export default function createServer(env: EnvConfig) {
  const app = express();

  // Raw body for Shopify webhook to validate HMAC
  app.use('/webhooks/shopify/orders-paid', express.raw({ type: 'application/json' }));

  // JSON parser for other routes
  app.use(express.json());

  app.use(createShopifyWebhookRouter(env));
  app.use(healthRouter);

  // basic error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
