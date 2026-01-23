const crypto = require('crypto');
const logger = require('../services/logger');

function verifyHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !rawBody) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const bufferDigest = Buffer.from(digest, 'utf8');
  const bufferHeader = Buffer.from(hmacHeader, 'utf8');
  if (bufferDigest.length !== bufferHeader.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferDigest, bufferHeader);
}

function shopifyHmacMiddleware(env) {
  return (req, res, next) => {
    const hmac = req.get('X-Shopify-Hmac-Sha256') || req.get('x-shopify-hmac-sha256');
    const rawBody = req.body;
    const valid = verifyHmac(rawBody, hmac, env.SHOPIFY_WEBHOOK_SECRET);
    if (!valid) {
      logger.warn('Invalid Shopify webhook HMAC');
      return res.status(401).json({ error: 'Invalid HMAC' });
    }
    return next();
  };
}

module.exports = {
  shopifyHmacMiddleware,
};
