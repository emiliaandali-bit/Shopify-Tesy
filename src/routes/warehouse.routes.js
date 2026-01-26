const express = require('express');
const {
  handlePrintotecaStatus,
  listLogs,
  getLog,
  deleteLog,
  getWarehouseOrderStatus,
  cancelWarehouseOrder,
} = require('../controllers/warehouse.controller');
const { handleOrderShipped } = require('../controllers/printoteca.controller');
const { handleOrderDeleted } = require('../controllers/printotecaDeleted.controller');

function createWarehouseRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => res.json({ status: 'ok' }));
  router.post('/webhooks/printoteca/order-status', handlePrintotecaStatus);
  router.post('/webhooks/printoteca/orders-shipped', handleOrderShipped);
  router.post('/webhooks/printoteca/orders-deleted', handleOrderDeleted);

  router.get('/api/logs', listLogs);
  router.get('/api/logs/:id', getLog);
  router.delete('/api/logs/:id', deleteLog);

  router.get('/api/warehouse/orders/:id', getWarehouseOrderStatus);
  router.delete('/api/warehouse/orders/:id', cancelWarehouseOrder);

  return router;
}

module.exports = createWarehouseRouter;
