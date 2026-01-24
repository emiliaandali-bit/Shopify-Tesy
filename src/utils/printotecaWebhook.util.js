function normalizePrintotecaWebhook(body) {
  const root = body || {};
  const order = root.order && typeof root.order === 'object' ? root.order : root;
  const externalId =
    order.external_id ??
    order.externalId ??
    order.externalID ??
    null;

  return {
    raw: root,
    order,
    printotecaId: order.id ?? null,
    externalId: externalId ? String(externalId).trim() : null,
    deleted: order.deleted ?? null,
    stage: order.stage ?? null,
    status: order.status ?? null,
    shipping: order.shipping ?? null,
  };
}

module.exports = {
  normalizePrintotecaWebhook,
};
