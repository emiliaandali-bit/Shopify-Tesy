const express = require('express');
const {
  handleDraftOrder,
  handleTransformPreview,
  handleOrdersPaid,
  handleOrdersCancelled,
} = require('../controllers/shopify.controller');
const { resendOrder, reconcileOrder } = require('../controllers/admin.controller');

function createShopifyRouter() {
  const router = express.Router();

  router.post('/webhooks/shopify/orders-paid', handleOrdersPaid);
  router.post('/webhooks/shopify/orders-cancelled', handleOrdersCancelled);
  router.post('/webhooks/shopify/draft-orders', handleDraftOrder);
  router.post('/debug/transform', handleTransformPreview);
  router.post('/admin/printoteca/resend/:shopifyOrderId', resendOrder);
  router.post('/admin/printoteca/reconcile/:shopifyOrderId', async (req, res) => {
    const shopifyOrderId = Number(req.params.shopifyOrderId);
    if (Number.isNaN(shopifyOrderId)) {
      return res.status(400).json({ error: 'Invalid Shopify order id' });
    }
    try {
      const result = await reconcileOrder(shopifyOrderId, req.app.locals.env);
      return res.json({
        shopifyOrderId,
        found: result.found,
        printotecaId: result.printotecaId,
        action: result.action,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to reconcile order' });
    }
  });

  return router;
}

module.exports = createShopifyRouter;
