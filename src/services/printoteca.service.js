const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

function buildSignature(payload, secret) {
  return crypto.createHash('sha1').update(payload + secret, 'utf8').digest('hex');
}

function buildBaseUrl(env) {
  return `${env.PRINTOTECA_BASE_URL}`;
}

function buildSignedUrl(path, query, env) {
  const signature = buildSignature(query, env.PRINTOTECA_SECRET_KEY);
  return `${buildBaseUrl(env)}${path}?${query}&Signature=${encodeURIComponent(signature)}`;
}

async function createOrder(payload, env) {
  const bodyString = JSON.stringify(payload);
  const signature = buildSignature(bodyString, env.PRINTOTECA_SECRET_KEY);
  const url = `${buildBaseUrl(env)}/orders.php?AppId=${encodeURIComponent(
    env.PRINTOTECA_APP_ID
  )}&Signature=${encodeURIComponent(signature)}`;

  logger.info('Sending order to Printoteca', { url });

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - skipping Printoteca API call', { url });
    return { sandbox: true, success: true };
  }

  const response = await axios.post(url, bodyString, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return response.data;
}

async function getOrderStatus(orderId, env) {
  const query = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&id=${encodeURIComponent(
    orderId
  )}`;
  const url = buildSignedUrl('/order.php', query, env);
  const response = await axios.get(url, { timeout: 10000 });
  return response.data;
}

async function cancelOrder(orderId, env) {
  const query = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&id=${encodeURIComponent(
    orderId
  )}`;
  const url = buildSignedUrl('/orders.php', query, env);

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - skipping Printoteca cancel', { url, orderId });
    return { sandbox: true, success: true };
  }

  const response = await axios.delete(url, { timeout: 10000 });
  return response.data;
}

module.exports = {
  createOrder,
  getOrderStatus,
  cancelOrder,
};
