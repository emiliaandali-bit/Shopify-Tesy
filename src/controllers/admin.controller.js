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
  setShopifyPrintotecaStatusSent,
} = require('../services/shopifyStatus.service');

async function reconcileOrder(shopifyOrderId, env) {
  const existingPrintotecaId = await getOrderMetafield(
    shopifyOrderId,
    'printoteca',
    'order_id',
    env
  );
  if (existingPrintotecaId) {
    await setShopifyPrintotecaStatusSent(shopifyOrderId, existingPrintotecaId, env);
    return { found: true, printotecaId: existingPrintotecaId, action: 'updated' };
  }

  let page = 1;
  const limit = 250;
  while (page <= 10) {
    const response = await printotecaService.listOrders(env, page, limit);
    const orders = response?.orders || response?.data?.orders || response?.results || [];
    if (!Array.isArray(orders) || orders.length === 0) {
      break;
    }
    const match = orders.find((order) => String(order?.external_id) === String(shopifyOrderId));
    if (match) {
      const printotecaId = match?.id || match?.order_id;
      if (printotecaId) {
        await setShopifyPrintotecaStatusSent(shopifyOrderId, printotecaId, env);
        return { found: true, printotecaId, action: 'updated' };
      }
    }
    if (orders.length < limit) {
      break;
    }
    page += 1;
  }

  return { found: false, action: 'not_found' };
}

async function resendOrder(req, res) {
  const shopifyOrderId = Number(req.params.shopifyOrderId);
  if (Number.isNaN(shopifyOrderId)) {
    return res.status(400).json({ error: 'Invalid Shopify order id' });
  }

  const force = String(req.query.force || 'false').toLowerCase() === 'true';

  try {
    const reconciliation = await reconcileOrder(shopifyOrderId, req.app.locals.env);
    if (reconciliation.found && !force) {
      return res.json({
        shopifyOrderId,
        action: 'relinked',
        status: 'sent',
        printotecaOrderId: reconciliation.printotecaId,
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
    const printotecaId = printotecaService.extractPrintotecaId(response);

    if (printotecaId) {
      await savePrintotecaOrderIdMetafield(shopifyOrderId, String(printotecaId), req.app.locals.env);
      await savePrintotecaExternalIdMetafield(
        shopifyOrderId,
        String(shopifyOrderId),
        req.app.locals.env
      );
      await setShopifyPrintotecaStatusSent(shopifyOrderId, String(printotecaId), req.app.locals.env);
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
  reconcileOrder,
};
