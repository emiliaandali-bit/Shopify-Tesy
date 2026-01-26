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

function buildCreateRequest(bodyString, env) {
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

function summarizePayload(payload) {
  const items = payload?.items || [];
  return {
    external_id: payload?.external_id,
    itemCount: items.length,
    keys: Object.keys(payload || {}),
    items: items.map((item) => ({
      pn: item?.pn,
      title: item?.title,
      hasDesignFront: Boolean(item?.designs?.front),
      hasMockupFront: Boolean(item?.mockups?.front),
    })),
  };
}

function extractPrintotecaId(responseData) {
  return responseData?.order?.id || responseData?.id || null;
}

async function listOrders(env, page = 1, limit = 250) {
  const query = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&page=${encodeURIComponent(
    page
  )}&limit=${encodeURIComponent(limit)}`;
  const url = buildSignedUrl('/orders.php', query, env);
  const urlMasked = maskSignature(url);
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.data;
  } catch (error) {
    logger.error('PRINTOTECA_ERROR', {
      status: error?.response?.status,
      urlMasked,
      responseData: error?.response?.data,
      responseHeaders: error?.response?.headers,
    });
    throw error;
  }
}

async function createOrder(payload, env) {
  const summary = summarizePayload(payload);
  logger.info('Printoteca payload summary', summary);

  const bodyA = JSON.stringify(payload);
  const requestA = buildCreateRequest(bodyA, env);

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - skipping Printoteca API call', { url: requestA.urlMasked });
    return { sandbox: true, success: true };
  }

  const previewA = bodyA.slice(0, 400);
  logger.info('Printoteca payload preview', { preview: previewA });

  try {
    const response = await axios.post(requestA.url, requestA.bodyString, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      transformRequest: [(data) => data],
    });
    return response.data;
  } catch (error) {
    const responseData = error?.response?.data;
    const errorText = typeof responseData?.error === 'string' ? responseData.error.toLowerCase() : '';
    logger.error('PRINTOTECA_ERROR', {
      status: error?.response?.status,
      urlMasked: requestA.urlMasked,
      bodyLength: requestA.bodyLength,
      bodySha1: requestA.bodySha1,
      responseData,
      responseHeaders: error?.response?.headers,
    });

    if (error?.response?.status === 400 && errorText.includes('name is not defined')) {
      logger.warn('Printoteca schema mismatch; retrying with wrapped payload');
      const bodyB = JSON.stringify({ order: payload });
      const requestB = buildCreateRequest(bodyB, env);
      const previewB = bodyB.slice(0, 400);
      logger.info('Printoteca payload preview', { preview: previewB });
      const retryResponse = await axios.post(requestB.url, requestB.bodyString, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        transformRequest: [(data) => data],
      });
      return retryResponse.data;
    }

    throw error;
  }
}

async function getOrderStatus(orderId, env) {
  const query = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&id=${encodeURIComponent(
    orderId
  )}`;
  const url = buildSignedUrl('/order.php', query, env);
  const urlMasked = maskSignature(url);
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.data;
  } catch (error) {
    logger.error('PRINTOTECA_ERROR', {
      status: error?.response?.status,
      urlMasked,
      responseData: error?.response?.data,
      responseHeaders: error?.response?.headers,
    });
    throw error;
  }
}

async function cancelOrder(orderId, env) {
  const query = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&id=${encodeURIComponent(
    orderId
  )}`;
  const url = buildSignedUrl('/orders.php', query, env);
  const urlMasked = maskSignature(url);

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - skipping Printoteca cancel', { url: urlMasked, orderId });
    return { sandbox: true, success: true };
  }

  try {
    const response = await axios.delete(url, { timeout: 10000 });
    return response.data;
  } catch (error) {
    logger.error('PRINTOTECA_ERROR', {
      status: error?.response?.status,
      urlMasked,
      responseData: error?.response?.data,
      responseHeaders: error?.response?.headers,
    });
    throw error;
  }
}

module.exports = {
  createOrder,
  getOrderStatus,
  cancelOrder,
  buildCreateRequest,
  extractPrintotecaId,
  listOrders,
};
