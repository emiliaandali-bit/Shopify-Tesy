const logger = require('../services/logger');

function errorHandler(err, _req, res, _next) {
  logger.error('Unhandled error', {
    message: err?.message,
    stack: err?.stack,
  });
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = {
  errorHandler,
};
