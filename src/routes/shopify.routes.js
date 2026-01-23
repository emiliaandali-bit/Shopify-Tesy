const express = require('express');
const {
  handleDraftOrder,
  handleOrdersPaid,
  handleOrdersCancelled,
} = require('../controllers/shopify.controller');

function createShopifyRouter() {
  const router = express.Router();

  router.post('/webhooks/shopify/orders-paid', handleOrdersPaid);
  router.post('/webhooks/shopify/orders-cancelled', handleOrdersCancelled);
  router.post('/webhooks/shopify/draft-orders', handleDraftOrder);

  return router;
}

module.exports = createShopifyRouter;
