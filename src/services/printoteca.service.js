const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

function buildSignature(payload, secret) {
  return crypto.createHash('sha1').update(payload + secret, 'utf8').digest('hex');
}

function buildBodySha1(payload) {
  return crypto.createHash('sha1').update(payload, 'utf8').digest('hex');
}

function buildBaseUrl(env) {
  return `${env.PRINTOTECA_BASE_URL}`;
}

function buildSignedUrl(path, query, env) {
  const signature = buildSignature(query, env.PRINTOTECA_SECRET_KEY);
  return `${buildBaseUrl(env)}${path}?${query}&Signature=${encodeURIComponent(signature)}`;
}

function maskSignature(url) {
  return url.replace(/Signature=[^&]+/i, 'Signature=***');
}

function buildCreateRequest(payload, env) {
  const bodyString = JSON.stringify(payload);
  const signature = buildSignature(bodyString, env.PRINTOTECA_SECRET_KEY);
  const url = `${buildBaseUrl(env)}/orders.php?AppId=${encodeURIComponent(
    env.PRINTOTECA_APP_ID
  )}&Signature=${encodeURIComponent(signature)}`;
  return {
    bodyString,
    url,
    urlMasked: maskSignature(url),
    bodyLength: bodyString.length,
    bodySha1: buildBodySha1(bodyString),
  };
}

async function createOrder(payload, env) {
  const request = buildCreateRequest(payload, env);

  logger.info('Sending order to Printoteca', { url: request.urlMasked });

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - skipping Printoteca API call', { url: request.urlMasked });
    return { sandbox: true, success: true };
  }

  try {
    const response = await axios.post(request.url, request.bodyString, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      transformRequest: [(data) => data],
    });
    return response.data;
  } catch (error) {
    logger.error('PRINTOTECA_ERROR', {
      status: error?.response?.status,
      urlMasked: request.urlMasked,
      bodyLength: request.bodyLength,
      bodySha1: request.bodySha1,
      responseData: error?.response?.data,
      responseHeaders: error?.response?.headers,
    });
    throw error;
  }
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
  buildCreateRequest,
};
