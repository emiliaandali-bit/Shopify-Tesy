const logger = require('../services/logger');
const { processDraftOrder, processCancelledOrder } = require('../services/shopify.service');
const {
  buildPrintotecaOrderFromShopify,
  buildPrintotecaCreateBodyFromShopify,
} = require('../services/transform.service');
const printotecaService = require('../services/printoteca.service');
const {
  savePrintotecaOrderIdMetafield,
  savePrintotecaExternalIdMetafield,
} = require('../services/shopifyAdminClient');
const { waitForDesignAssetsReady } = require('../services/assets.service');
const {
  upsertOrderMetafield,
  addRemoveOrderTags,
  getOrderMetafield,
  setShopifyPrintotecaStatusSent,
} = require('../services/shopifyStatus.service');
const { logBox, logJson } = require('../utils/prettyLog');

function getMissingShippingFields(body) {
  const missing = [];
  if (!body?.shipping_address?.firstName) missing.push('shipping_address.firstName');
  if (!body?.shipping_address?.lastName) missing.push('shipping_address.lastName');
  if (!body?.shipping_address?.address1) missing.push('shipping_address.address1');
  if (!body?.shipping_address?.city) missing.push('shipping_address.city');
  if (!body?.shipping_address?.postcode) missing.push('shipping_address.postcode');
  if (!body?.shipping_address?.country) missing.push('shipping_address.country');
  if (!body?.shipping_address?.phone1) missing.push('shipping_address.phone1');
  return missing;
}

async function handleDraftOrder(req, res) {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const result = await processDraftOrder(payload, req.app.locals.env);
  if (result.error) {
    return res.status(422).json({ error: result.error, logId: result.logId });
  }
  return res.status(202).json({ status: 'queued', logId: result.logId });
}

function normalizeShopifyOrder(body) {
  const order = body?.order ? body.order : body;
  return {
    shopifyOrderId: order?.id,
    createdAt: order?.created_at,
    shippingAddress: order?.shipping_address,
    lineItems: order?.line_items || [],
    tags: order?.tags || '',
    customerEmail: order?.email,
    raw: order,
  };
}

function collectDesignUrls(printotecaPayload) {
  const urls = [];
  (printotecaPayload?.items || []).forEach((item) => {
    if (item?.designs?.front) urls.push(item.designs.front);
    if (item?.designs?.back) urls.push(item.designs.back);
    if (item?.mockups?.front) urls.push(item.mockups.front);
  });
  return Array.from(new Set(urls));
}

function handleTransformPreview(req, res) {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  try {
    const normalized = normalizeShopifyOrder(payload);
    const transformed = buildPrintotecaOrderFromShopify(normalized);
    return res.json(transformed);
  } catch (error) {
    logger.error('Failed to transform preview payload', { error: error?.message });
    return res.status(400).json({ error: error?.message || 'Invalid payload' });
  }
}

async function handleOrdersPaid(req, res) {
  const payload = req.body;
  if (!payload) {
    logger.error('Failed to parse Shopify paid order payload');
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      const normalized = normalizeShopifyOrder(payload);
      if (!normalized?.lineItems?.length) {
        logger.warn('Shopify orders-paid missing line_items');
        return;
      }

      const shopifyOrderId = normalized.shopifyOrderId;
      if (!shopifyOrderId) {
        logger.warn('Shopify orders-paid missing order id');
        return;
      }

      logger.info(
        'Shopify line_items diagnostics',
        JSON.stringify(
          {
            orderId: normalized.raw?.id,
            items: (normalized.raw?.line_items || []).map((lineItem) => ({
              id: lineItem.id,
              sku: lineItem.sku,
              title: lineItem.title,
              name: lineItem.name,
              propertiesCount: Array.isArray(lineItem.properties) ? lineItem.properties.length : 0,
              properties: Array.isArray(lineItem.properties)
                ? lineItem.properties.map((prop) => ({
                    name: prop.name,
                    value: prop.value,
                  }))
                : lineItem.properties,
            })),
          },
          null,
          2
        )
      );

      await addRemoveOrderTags(
        shopifyOrderId,
        ['printoteca:pending'],
        ['printoteca:failed', 'printoteca:sent', 'printoteca:deleted', 'printoteca:shipped'],
        req.app.locals.env
      );
      await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'pending', req.app.locals.env);
      await upsertOrderMetafield(
        shopifyOrderId,
        'printoteca',
        'external_id',
        String(shopifyOrderId),
        req.app.locals.env
      );

      const existingPrintotecaId = await getOrderMetafield(
        shopifyOrderId,
        'printoteca',
        'order_id',
        req.app.locals.env
      );
      if (existingPrintotecaId) {
        logger.info(`Already linked to Printoteca id ${existingPrintotecaId}, skipping create`);
        await addRemoveOrderTags(
          shopifyOrderId,
          ['printoteca:sent'],
          ['printoteca:pending', 'printoteca:failed'],
          req.app.locals.env
        );
        await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'sent', req.app.locals.env);
        return;
      }

      const transformed = buildPrintotecaOrderFromShopify(normalized);
      const printotecaCreateBody = buildPrintotecaCreateBodyFromShopify(normalized);
      const requestMeta = printotecaService.buildCreateRequest(
        JSON.stringify(printotecaCreateBody),
        req.app.locals.env
      );
      logger.info(
        'Printoteca items summary',
        JSON.stringify(
          printotecaCreateBody.items.map((item) => ({
            pn: item.pn,
            title: item.title,
            designFront: item.designs?.front,
            designBack: item.designs?.back,
            mockupFront: item.mockups?.front,
          })),
          null,
          2
        )
      );
      logger.info(
        'Printoteca items (final)',
        JSON.stringify(JSON.parse(JSON.stringify(printotecaCreateBody.items)), null, 2)
      );

      const missingShippingFields = getMissingShippingFields(printotecaCreateBody);
      if (missingShippingFields.length > 0) {
        logger.error(
          'PRINTOTECA_PAYLOAD_INVALID',
          JSON.stringify(
            {
              shopifyOrderId,
              missing: missingShippingFields,
            },
            null,
            2
          )
        );
        await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'failed', req.app.locals.env);
        await upsertOrderMetafield(
          shopifyOrderId,
          'printoteca',
          'last_error',
          `Missing shipping fields: ${missingShippingFields.join(', ')}`,
          req.app.locals.env
        );
        await addRemoveOrderTags(
          shopifyOrderId,
          ['printoteca:failed'],
          ['printoteca:pending'],
          req.app.locals.env
        );
        return;
      }

      const missingDesignItems = (printotecaCreateBody?.items || []).filter(
        (item) => !item?.designs?.front
      );
      if (missingDesignItems.length > 0) {
        const missingMessage = missingDesignItems
          .map((item) => `Missing design link _tib_design_link_1 for sku=${item.pn || 'unknown'}`)
          .join('; ');
        logger.error(
          'Missing design links for Printoteca items',
          JSON.stringify(
            {
              items: missingDesignItems.map((item) => ({ pn: item.pn, title: item.title })),
            },
            null,
            2
          )
        );
        await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'failed', req.app.locals.env);
        await upsertOrderMetafield(
          shopifyOrderId,
          'printoteca',
          'last_error',
          missingMessage,
          req.app.locals.env
        );
        await addRemoveOrderTags(
          shopifyOrderId,
          ['printoteca:failed'],
          ['printoteca:pending'],
          req.app.locals.env
        );
        return;
      }
      const designUrls = collectDesignUrls(printotecaCreateBody);

      logBox('SHOPIFY_WEBHOOK_RECEIVED', [
        `shopify_order_id: ${shopifyOrderId}`,
        `line_items: ${normalized?.lineItems?.length || 0}`,
        `email: ${normalized?.customerEmail || ''}`,
        `ship_country: ${normalized?.shippingAddress?.country || ''}`,
      ]);
      logJson('PRINTOTECA_TRANSFORMED', transformed);
      logBox('PRINTOTECA_REQUEST', [
        `url: ${requestMeta.urlMasked}`,
        `bodyLength: ${requestMeta.bodyLength}`,
        `bodySha1: ${requestMeta.bodySha1}`,
      ]);

      const readiness = await waitForDesignAssetsReady(designUrls, {
        attempts: 1,
        delayMs: 60000,
        concurrency: 3,
      });
      if (!readiness.ready) {
        await addRemoveOrderTags(
          shopifyOrderId,
          ['printoteca:pending_assets'],
          ['printoteca:failed'],
          req.app.locals.env
        );
        await upsertOrderMetafield(
          shopifyOrderId,
          'printoteca',
          'status',
          'pending_assets',
          req.app.locals.env
        );
        await upsertOrderMetafield(
          shopifyOrderId,
          'printoteca',
          'last_error',
          'Design files still generating; retrying',
          req.app.locals.env
        );
        logger.warn('Design assets not ready, retrying', {
          shopifyOrderId,
          notReadyUrls: readiness.notReadyUrls,
        });
        const finalReadiness = await waitForDesignAssetsReady(designUrls, {
          attempts: 5,
          delayMs: 60000,
          concurrency: 3,
        });
        if (!finalReadiness.ready) {
          await upsertOrderMetafield(
            shopifyOrderId,
            'printoteca',
            'status',
            'failed',
            req.app.locals.env
          );
          await upsertOrderMetafield(
            shopifyOrderId,
            'printoteca',
            'last_error',
            'Design files not ready after 5 minutes',
            req.app.locals.env
          );
          await addRemoveOrderTags(
            shopifyOrderId,
            ['printoteca:failed'],
            ['printoteca:pending_assets'],
            req.app.locals.env
          );
          logger.warn('Design assets not ready after retries', {
            shopifyOrderId,
            notReadyUrls: finalReadiness.notReadyUrls,
          });
          return;
        }
      }
      await addRemoveOrderTags(
        shopifyOrderId,
        [],
        ['printoteca:pending_assets'],
        req.app.locals.env
      );

      try {
        const response = await printotecaService.createOrder(
          printotecaCreateBody,
          req.app.locals.env
        );
        logJson('PRINTOTECA_RESPONSE', response);
        const printotecaId = printotecaService.extractPrintotecaId(response);
        if (printotecaId) {
          await savePrintotecaOrderIdMetafield(shopifyOrderId, String(printotecaId), req.app.locals.env);
          await savePrintotecaExternalIdMetafield(
            shopifyOrderId,
            String(shopifyOrderId),
            req.app.locals.env
          );
          await setShopifyPrintotecaStatusSent(shopifyOrderId, String(printotecaId), req.app.locals.env);
          await upsertOrderMetafield(
            shopifyOrderId,
            'printoteca',
            'last_sent_at',
            new Date().toISOString(),
            req.app.locals.env
          );
          await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'last_error', '', req.app.locals.env);
        } else {
          const errorMessage = 'Printoteca response missing order id';
          await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'failed', req.app.locals.env);
          await upsertOrderMetafield(
            shopifyOrderId,
            'printoteca',
            'last_error',
            errorMessage,
            req.app.locals.env
          );
          await addRemoveOrderTags(
            shopifyOrderId,
            ['printoteca:failed'],
            ['printoteca:pending'],
            req.app.locals.env
          );
          logger.error(errorMessage, { response });
        }
      } catch (error) {
        const errorMessage = error?.message || 'Printoteca create failed';
        const responseData = error?.response?.data || '';
        const responseText = typeof responseData === 'string' ? responseData.toLowerCase() : '';
        if (responseText.includes('design') && responseText.includes('invalid')) {
          const retryReady = await waitForDesignAssetsReady(designUrls, {
            attempts: 5,
            delayMs: 60000,
            concurrency: 3,
          });
          if (retryReady.ready) {
            const retryResponse = await printotecaService.createOrder(
              printotecaCreateBody,
              req.app.locals.env
            );
            logJson('PRINTOTECA_RESPONSE', retryResponse);
            const retryId = printotecaService.extractPrintotecaId(retryResponse);
            if (retryId) {
              await savePrintotecaOrderIdMetafield(shopifyOrderId, String(retryId), req.app.locals.env);
              await savePrintotecaExternalIdMetafield(
                shopifyOrderId,
                String(shopifyOrderId),
                req.app.locals.env
              );
              await setShopifyPrintotecaStatusSent(shopifyOrderId, String(retryId), req.app.locals.env);
              await upsertOrderMetafield(
                shopifyOrderId,
                'printoteca',
                'last_sent_at',
                new Date().toISOString(),
                req.app.locals.env
              );
              await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'last_error', '', req.app.locals.env);
              return;
            }
          }
        }
        await upsertOrderMetafield(shopifyOrderId, 'printoteca', 'status', 'failed', req.app.locals.env);
        await upsertOrderMetafield(
          shopifyOrderId,
          'printoteca',
          'last_error',
          errorMessage,
          req.app.locals.env
        );
        await addRemoveOrderTags(
          shopifyOrderId,
          ['printoteca:failed'],
          ['printoteca:pending'],
          req.app.locals.env
        );
        logger.error('Printoteca create order failed', { error: errorMessage });
      }
    } catch (error) {
      logger.error('Failed to send order to Printoteca', { error: error?.message });
    }
  });

  return undefined;
}

async function handleOrdersCancelled(req, res) {
  const payload = req.body;
  if (!payload) {
    logger.error('Failed to parse Shopify cancelled order payload');
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  try {
    const normalized = normalizeShopifyOrder(payload);
    await processCancelledOrder(normalized?.shopifyOrderId, req.app.locals.env);
  } catch (error) {
    logger.error('Failed to process Shopify cancelled order', { error: error?.message });
  }

  return res.json({ status: 'ok' });
}

module.exports = {
  handleDraftOrder,
  handleTransformPreview,
  handleOrdersPaid,
  handleOrdersCancelled,
  normalizeShopifyOrder,
};
