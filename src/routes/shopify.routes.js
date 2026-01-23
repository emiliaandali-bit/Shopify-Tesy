const express = require('express');
//const { shopifyHmacMiddleware } = require('../middlewares/shopifyHmac.middleware');
const {
  handleDraftOrder,
  handleOrdersPaid,
  handleOrdersCancelled,
} = require('../controllers/shopify.controller');

function createShopifyRouter(env) {
  const router = express.Router();
 // const verifyHmac = shopifyHmacMiddleware(env);

  router.post('/webhooks/shopify/orders-paid', handleOrdersPaid);
  router.post('/webhooks/shopify/orders-cancelled', handleOrdersCancelled);
  router.post('/webhooks/shopify/draft-orders', handleDraftOrder);

  return router;
}

module.exports = createShopifyRouter;
