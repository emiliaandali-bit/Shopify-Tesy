const express = require('express');
const createShopifyRouter = require('./routes/shopify.routes');
const createWarehouseRouter = require('./routes/warehouse.routes');
const { requestLogger } = require('./middlewares/logger.middleware');
const { errorHandler } = require('./middlewares/error.middleware');

function createApp(env) {
  const app = express();
  app.locals.env = env;

  app.use(requestLogger);
  app.use('/webhooks/shopify', express.json());
  app.use(express.json());

  app.use(createShopifyRouter());
  app.use(createWarehouseRouter());

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
