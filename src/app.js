const express = require('express');
const createShopifyRouter = require('./routes/shopify.routes');
const createWarehouseRouter = require('./routes/warehouse.routes');
const { requestLogger } = require('./middlewares/logger.middleware');
const { errorHandler } = require('./middlewares/error.middleware');

function createApp(env) {
  const app = express();
  app.locals.env = env;

  app.use(requestLogger);
  app.use('/webhooks/shopify', express.raw({ type: 'application/json' }));

  app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/webhooks/shopify')) {
      return next();
    }
    return express.json()(req, res, next);
  });

  app.use(createShopifyRouter(env));
  app.use(createWarehouseRouter());

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
