const logger = require('../services/logger');
const { addRemoveOrderTags, upsertOrderMetafield } = require('../services/shopifyStatus.service');

async function handleOrderDeleted(req, res) {
  const payload = req.body;
  const shopifyOrderId = Number(payload?.external_id);
  if (!shopifyOrderId) {
    logger.warn('Printoteca orders-deleted missing external_id');
    return res.status(400).json({ error: 'Missing external_id' });
  }

  try {
    await addRemoveOrderTags(
      shopifyOrderId,
      ['printoteca:deleted'],
      ['printoteca:pending', 'printoteca:sent', 'printoteca:failed'],
      req.app.locals.env
    );
    await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'deleted', req.app.locals.env);
    return res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Failed to handle Printoteca orders-deleted', { error: error?.message });
    return res.status(500).json({ error: 'Failed to sync deletion' });
  }
}

module.exports = {
  handleOrderDeleted,
};
