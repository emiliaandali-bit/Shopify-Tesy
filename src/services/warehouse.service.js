const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');
const { buildPrintotecaSignature } = require('./printotecaSignature');

const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error) {
  if (!error) return false;
  const status = error?.response?.status;
  if (!status) return true;
  return status >= 500;
}

async function requestWithRetry(requestFn) {
  let attempt = 0;
  let lastError;

  while (attempt < MAX_RETRIES) {
    try {
      return await requestFn(attempt + 1);
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === MAX_RETRIES - 1) {
        throw error;
      }
      const delay = 500 * Math.pow(2, attempt);
      logger.warn('Warehouse request failed, retrying', {
        attempt: attempt + 1,
        delay,
        status: error?.response?.status,
      });
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}

function buildCreateOrderUrl(env, payload) {
  const bodyString = JSON.stringify(payload);
  const signature = crypto
    .createHash('sha1')
    .update(bodyString + env.PRINTOTECA_SECRET_KEY)
    .digest('hex');

  return `${env.PRINTOTECA_BASE_URL}/orders.php?AppId=${encodeURIComponent(
    env.PRINTOTECA_APP_ID
  )}&Signature=${encodeURIComponent(signature)}`;
}

function buildOrderQueryUrl(env, query) {
  const signature = buildPrintotecaSignature(query, env.PRINTOTECA_SECRET_KEY);
  return `${env.PRINTOTECA_BASE_URL}/orders.php?${query}&Signature=${encodeURIComponent(signature)}`;
}

async function createOrder(payload, env) {
  const url = buildCreateOrderUrl(env, payload);
  logger.info('Sending order to warehouse', { url, external_id: payload.external_id });
  logger.debug('Warehouse request payload', payload);

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - skipping warehouse API call', { url });
    return { sandbox: true, success: true };
  }

  return requestWithRetry(async (attempt) => {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: DEFAULT_TIMEOUT,
    });
    logger.info('Warehouse API call successful', {
      attempt,
      status: response.status,
      externalId: payload.external_id,
      warehouseId: response.data?.id,
    });
    return response.data;
  });
}

async function getOrderStatus(orderId, env) {
  const query = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&id=${encodeURIComponent(
    orderId
  )}`;
  const url = buildOrderQueryUrl(env, query);

  return requestWithRetry(async (attempt) => {
    const response = await axios.get(url, { timeout: DEFAULT_TIMEOUT });
    logger.info('Fetched warehouse order status', {
      attempt,
      status: response.status,
      orderId,
    });
    return response.data;
  });
}

async function cancelOrder(orderId, env) {
  const query = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&id=${encodeURIComponent(
    orderId
  )}`;
  const url = buildOrderQueryUrl(env, query);

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - skipping warehouse cancel', { url, orderId });
    return { sandbox: true, success: true };
  }

  return requestWithRetry(async (attempt) => {
    const response = await axios.delete(url, { timeout: DEFAULT_TIMEOUT });
    logger.info('Cancelled warehouse order', {
      attempt,
      status: response.status,
      orderId,
    });
    return response.data;
  });
}

module.exports = {
  createOrder,
  getOrderStatus,
  cancelOrder,
};
