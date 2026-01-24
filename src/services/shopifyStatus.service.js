const logger = require('./logger');
const { createClient } = require('./shopifyAdminClient');

async function upsertOrderMetafield(orderId, namespace, key, value, env, type = 'single_line_text_field') {
  const client = createClient(env);
  try {
    await client.post(`/orders/${orderId}/metafields.json`, {
      metafield: {
        namespace,
        key,
        type,
        value: value === undefined || value === null ? '' : String(value),
      },
    });
  } catch (error) {
    logger.error('Failed to upsert Shopify metafield', {
      orderId,
      namespace,
      key,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
  }
}

async function getOrderMetafield(orderId, namespace, key, env) {
  const client = createClient(env);
  try {
    const response = await client.get(`/orders/${orderId}/metafields.json`, {
      params: { namespace, key },
    });
    const metafields = response.data?.metafields || [];
    const found = metafields.find((mf) => mf.key === key);
    return found?.value;
  } catch (error) {
    logger.error('Failed to fetch Shopify metafield', {
      orderId,
      namespace,
      key,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
    return undefined;
  }
}

function parseTags(tags) {
  if (!tags) return [];
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function addRemoveOrderTags(orderId, addTags, removeTags, env) {
  const client = createClient(env);
  try {
    const orderResponse = await client.get(`/orders/${orderId}.json`, {
      params: { status: 'any' },
    });
    const currentTags = parseTags(orderResponse.data?.order?.tags);
    const tagSet = new Set(currentTags);

    (removeTags || []).forEach((tag) => tagSet.delete(tag));
    (addTags || []).forEach((tag) => tagSet.add(tag));

    const nextTags = Array.from(tagSet).join(', ');
    await client.put(`/orders/${orderId}.json`, {
      order: { id: orderId, tags: nextTags },
    });
  } catch (error) {
    logger.error('Failed to update Shopify tags', {
      orderId,
      error: error?.response?.data || error?.message,
      status: error?.response?.status,
    });
  }
}

module.exports = {
  upsertOrderMetafield,
  getOrderMetafield,
  addRemoveOrderTags,
};
