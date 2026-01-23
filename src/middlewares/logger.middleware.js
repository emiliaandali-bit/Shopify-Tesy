const logger = require('../services/logger');

function requestLogger(req, _res, next) {
  const contentLength = req.headers['content-length'];
  const bodyType = Buffer.isBuffer(req.body) ? 'buffer' : typeof req.body;
  logger.info('Incoming request', {
    method: req.method,
    path: req.originalUrl,
    contentLength,
    bodyType,
  });
  next();
}

module.exports = {
  requestLogger,
};
