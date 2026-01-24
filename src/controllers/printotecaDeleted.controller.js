const logger = require('../services/logger');
const { addRemoveOrderTags, upsertOrderMetafield } = require('../services/shopifyStatus.service');
const { normalizePrintotecaWebhook } = require('../utils/printotecaWebhook.util');

async function handleOrderDeleted(req, res) {
  const parsed = normalizePrintotecaWebhook(req.body);
  if (!parsed.externalId) {
    logger.warn('Printoteca orders-deleted missing external_id', {
      bodyKeys: Object.keys(parsed.raw || {}),
      orderKeys: Object.keys(parsed.order || {}),
      printotecaId: parsed.printotecaId,
    });
    return res.status(200).send('OK');
  }

  const shopifyOrderId = Number(parsed.externalId);
  if (!Number.isFinite(shopifyOrderId)) {
    logger.warn('Printoteca orders-deleted external_id not numeric', {
      externalId: parsed.externalId,
      printotecaId: parsed.printotecaId,
    });
    return res.status(200).send('OK');
  }

  try {
    logger.info('Printoteca orders-deleted mapped to Shopify order', {
      shopifyOrderId,
      externalId: parsed.externalId,
      printotecaId: parsed.printotecaId,
      deleted: parsed.deleted,
      stage: parsed.stage,
    });
    await addRemoveOrderTags(
      shopifyOrderId,
      ['printoteca:deleted'],
      ['printoteca:pending', 'printoteca:sent', 'printoteca:failed'],
      req.app.locals.env
    );
    await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'deleted', req.app.locals.env);
    if (parsed.printotecaId) {
      await upsertOrderMetafield(
        shopifyOrderId,
        'printoteca',
        'order_id',
        String(parsed.printotecaId),
        req.app.locals.env
      );
    }
    return res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Failed to handle Printoteca orders-deleted', { error: error?.message });
    return res.status(500).json({ error: 'Failed to sync deletion' });
  }
}

module.exports = {
  handleOrderDeleted,
};
