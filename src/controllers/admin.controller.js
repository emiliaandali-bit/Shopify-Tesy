const logger = require('../services/logger');
const {
  buildPrintotecaOrderFromShopify,
  buildPrintotecaCreateBodyFromShopify,
} = require('../services/transform.service');
const printotecaService = require('../services/printoteca.service');
const { waitForDesignAssetsReady } = require('../services/assets.service');
const {
  fetchShopifyOrder,
  savePrintotecaOrderIdMetafield,
  savePrintotecaExternalIdMetafield,
} = require('../services/shopifyAdminClient');
const {
  upsertOrderMetafield,
  addRemoveOrderTags,
  getOrderMetafield,
  setShopifyPrintotecaStatusSent,
} = require('../services/shopifyStatus.service');

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

async function reconcileOrder(shopifyOrderId, env) {
  const existingPrintotecaId = await getOrderMetafield(
    shopifyOrderId,
    'printoteca',
    'order_id',
    env
  );
  if (existingPrintotecaId) {
    await setShopifyPrintotecaStatusSent(shopifyOrderId, existingPrintotecaId, env);
    return { found: true, printotecaId: existingPrintotecaId, action: 'updated' };
  }

  let page = 1;
  const limit = 250;
  while (page <= 10) {
    const response = await printotecaService.listOrders(env, page, limit);
    const orders = response?.orders || response?.data?.orders || response?.results || [];
    if (!Array.isArray(orders) || orders.length === 0) {
      break;
    }
    const match = orders.find((order) => String(order?.external_id) === String(shopifyOrderId));
    if (match) {
      const printotecaId = match?.id || match?.order_id;
      if (printotecaId) {
        await setShopifyPrintotecaStatusSent(shopifyOrderId, printotecaId, env);
        return { found: true, printotecaId, action: 'updated' };
      }
    }
    if (orders.length < limit) {
      break;
    }
    page += 1;
  }

  return { found: false, action: 'not_found' };
}

async function resendOrder(req, res) {
  const shopifyOrderId = Number(req.params.shopifyOrderId);
  if (Number.isNaN(shopifyOrderId)) {
    return res.status(400).json({ error: 'Invalid Shopify order id' });
  }

  const force = String(req.query.force || 'false').toLowerCase() === 'true';

  res.status(200).json({ status: 'queued', shopifyOrderId, force });

  setImmediate(async () => {
    try {
      const reconciliation = await reconcileOrder(shopifyOrderId, req.app.locals.env);
      if (reconciliation.found && !force) {
        logger.info('Resend skipped; order already linked', {
          shopifyOrderId,
          printotecaOrderId: reconciliation.printotecaId,
        });
        return;
      }

      const order = await fetchShopifyOrder(shopifyOrderId, req.app.locals.env);
      if (!order) {
        logger.warn('Shopify order not found for resend', { shopifyOrderId });
        return;
      }
      logger.info(
        'Fetched Shopify order for resend',
        JSON.stringify(
          {
            orderId: order.id,
            lineItemCount: order.line_items?.length || 0,
            hasPropertiesArray: Array.isArray(order.line_items?.[0]?.properties),
            samplePropertyNames: (order.line_items?.[0]?.properties || [])
              .slice(0, 5)
              .map((prop) => prop.name),
          },
          null,
          2
        )
      );

      const normalized = {
        shopifyOrderId: order.id,
        createdAt: order.created_at,
        shippingAddress: order.shipping_address,
        lineItems: order.line_items || [],
        tags: order.tags || '',
        raw: order,
      };

      logger.info(
        'Shopify line_items diagnostics',
        JSON.stringify(
          {
            orderId: order.id,
            items: (order.line_items || []).map((lineItem) => ({
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

      const transformed = buildPrintotecaOrderFromShopify(normalized);
      const printotecaCreateBody = buildPrintotecaCreateBodyFromShopify(normalized);
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
      const designUrls = Array.from(
        new Set(
          (printotecaCreateBody?.items || [])
            .flatMap((item) => [
              item?.designs?.front,
              item?.designs?.back,
              item?.mockups?.front,
            ])
            .filter(Boolean)
        )
      );

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
          return;
        }
      }

      await addRemoveOrderTags(
        shopifyOrderId,
        [],
        ['printoteca:pending_assets'],
        req.app.locals.env
      );

      const response = await printotecaService.createOrder(printotecaCreateBody, req.app.locals.env);
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
      }
    } catch (error) {
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
        error?.message || 'Failed to resend order',
        req.app.locals.env
      );
      await addRemoveOrderTags(
        shopifyOrderId,
        ['printoteca:failed'],
        ['printoteca:pending'],
        req.app.locals.env
      );
      logger.error('Failed to resend Printoteca order', { error: error?.message });
    }
  });

  return undefined;
}

module.exports = {
  resendOrder,
  reconcileOrder,
};
