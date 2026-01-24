const logger = require('../services/logger');
const { buildPrintotecaOrderFromShopify } = require('../services/transform.service');
const printotecaService = require('../services/printoteca.service');
const {
  fetchShopifyOrder,
  savePrintotecaOrderIdMetafield,
  savePrintotecaExternalIdMetafield,
} = require('../services/shopifyAdminClient');
const {
  upsertOrderMetafield,
  addRemoveOrderTags,
  getOrderMetafield,
} = require('../services/shopifyStatus.service');

async function resendOrder(req, res) {
  const shopifyOrderId = Number(req.params.shopifyOrderId);
  if (Number.isNaN(shopifyOrderId)) {
    return res.status(400).json({ error: 'Invalid Shopify order id' });
  }

  const force = String(req.query.force || 'false').toLowerCase() === 'true';

  try {
    const existingPrintotecaId = await getOrderMetafield(
      shopifyOrderId,
      'printoteca',
      'order_id',
      req.app.locals.env
    );

    if (existingPrintotecaId && !force) {
      return res.json({
        shopifyOrderId,
        action: 'skipped',
        status: 'sent',
        printotecaOrderId: existingPrintotecaId,
      });
    }

    const order = await fetchShopifyOrder(shopifyOrderId, req.app.locals.env);
    if (!order) {
      return res.status(404).json({ error: 'Shopify order not found' });
    }

    const normalized = {
      shopifyOrderId: order.id,
      createdAt: order.created_at,
      shippingAddress: order.shipping_address,
      lineItems: order.line_items || [],
      tags: order.tags || '',
      raw: order,
    };

    await addRemoveOrderTags(
      shopifyOrderId,
      ['printoteca:pending'],
      ['printoteca:failed', 'printoteca:sent', 'printoteca:deleted', 'printoteca:shipped'],
      req.app.locals.env
    );
    await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'pending', req.app.locals.env);
    await upsertOrderMetafield(
      shopifyOrderId,
      'printoteca',
      'external_id',
      String(shopifyOrderId),
      req.app.locals.env
    );

    const transformed = buildPrintotecaOrderFromShopify(normalized);
    const response = await printotecaService.createOrder(transformed, req.app.locals.env);
    const printotecaId = response?.id;

    if (printotecaId) {
      await savePrintotecaOrderIdMetafield(shopifyOrderId, String(printotecaId), req.app.locals.env);
      await savePrintotecaExternalIdMetafield(
        shopifyOrderId,
        String(shopifyOrderId),
        req.app.locals.env
      );
      await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'sent', req.app.locals.env);
      await upsertOrderMetafield(
        shopifyOrderId,
        'printoteca',
        'last_sent_at',
        new Date().toISOString(),
        req.app.locals.env
      );
      await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'last_error', '', req.app.locals.env);
      await addRemoveOrderTags(
        shopifyOrderId,
        ['printoteca:sent'],
        ['printoteca:pending', 'printoteca:failed', 'printoteca:deleted'],
        req.app.locals.env
      );
    }

    return res.json({
      shopifyOrderId,
      action: force ? 'forced' : 'sent',
      status: printotecaId ? 'sent' : 'failed',
      printotecaOrderId: printotecaId,
    });
  } catch (error) {
    await upsertOrderMetafield(
      shopifyOrderId,
      'printoteca',
      'status',
      'failed',
      req.app.locals.env
    );
    await upsertOrderMetafield(
      shopifyOrderId,
      'printoteca',
      'last_error',
      error?.message || 'Failed to resend order',
      req.app.locals.env
    );
    await addRemoveOrderTags(
      shopifyOrderId,
      ['printoteca:failed'],
      ['printoteca:pending'],
      req.app.locals.env
    );
    logger.error('Failed to resend Printoteca order', { error: error?.message });
    return res.status(500).json({ error: 'Failed to resend order' });
  }
}

module.exports = {
  resendOrder,
};
