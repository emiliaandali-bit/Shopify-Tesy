const { SIZE_MAP, WORDING_MAP, SKU_REPLACEMENTS } = require('../constants/warehouseMappings');

function normalizeSku(sku) {
  if (!sku) return '';
  let normalized = String(sku).trim();
  Object.entries(SKU_REPLACEMENTS).forEach(([from, to]) => {
    normalized = normalized.split(from).join(to);
  });
  return normalized.toUpperCase();
}

function normalizeSize(value) {
  if (!value) return value;
  const normalized = String(value).trim().toLowerCase();
  return SIZE_MAP[normalized] || value;
}

function normalizePropertyName(name) {
  if (!name) return '';
  const key = String(name).trim().toLowerCase();
  return WORDING_MAP[key] || name;
}

function normalizeDesignUrl(url) {
  if (!url) return undefined;
  const [base] = String(url).split('?');
  return base;
}

function extractDesigns(properties) {
  const props = Array.isArray(properties) ? properties : [];
  let frontDesignUrl;
  let backDesignUrl;
  let customizationImageUrl;

  props.forEach((prop) => {
    const key = prop?.name;
    const value = prop?.value;
    if (key === '_tib_design_link_1' && value) {
      frontDesignUrl = value;
    } else if (key === '_tib_design_link_2' && value) {
      backDesignUrl = value;
    } else if (key === '_customization_image' && value) {
      customizationImageUrl = value;
    }
  });

  const designs = {};
  const mockups = {};
  const normalizedFront = normalizeDesignUrl(frontDesignUrl);
  const normalizedBack = normalizeDesignUrl(backDesignUrl);
  const normalizedCustomization = normalizeDesignUrl(customizationImageUrl);

  if (normalizedFront) {
    designs.front = normalizedFront;
  } else if (normalizedCustomization) {
    designs.front = normalizedCustomization;
  }

  if (normalizedBack) {
    designs.back = normalizedBack;
  }

  if (normalizedCustomization) {
    mockups.front = normalizedCustomization;
  }

  return {
    designs: Object.keys(designs).length ? designs : undefined,
    mockups: Object.keys(mockups).length ? mockups : undefined,
  };
}

function buildDescription(lineItem) {
  const parts = [lineItem?.title, lineItem?.variant_title].filter(Boolean);
  const props = Array.isArray(lineItem?.properties) ? lineItem.properties : [];
  if (props.length > 0) {
    const personalization = props
      .filter((prop) => prop?.name && !prop.name.startsWith('_tib_'))
      .map((prop) => `${normalizePropertyName(prop.name)}: ${prop.value}`)
      .join('; ');
    if (personalization) {
      parts.push(`Personalization -> ${personalization}`);
    }
  }
  return parts.join(' | ');
}

function toIsoString(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function buildShippingAddress(address, customer) {
  const source = address || customer?.default_address || {};
  return {
    firstName: source?.first_name || customer?.first_name || 'Customer',
    lastName: source?.last_name || customer?.last_name || 'Unknown',
    company: source?.company || undefined,
    address1: source?.address1 || '',
    address2: source?.address2 || undefined,
    city: source?.city || '',
    county: source?.province || undefined,
    postcode: source?.zip || '',
    country: source?.country || '',
    phone1: source?.phone || customer?.phone || undefined,
  };
}

function isPrintotecaLineItem(line) {
  if (!line?.sku) return false;
  const vendorMatch = String(line?.vendor || '').toLowerCase() === 'printoteca';
  const typeMatch = String(line?.product_type || '').toLowerCase() === 'printoteca';
  return vendorMatch || typeMatch;
}

function buildItems(lineItems, options = {}) {
  const { filterPrintoteca = false } = options;
  const items = [];
  (lineItems || []).forEach((line) => {
    if (filterPrintoteca && !isPrintotecaLineItem(line)) {
      return;
    }
    const sku = normalizeSku(line?.sku || line?.variant_sku || '');
    const { designs, mockups } = extractDesigns(line?.properties);
    const description = buildDescription(line);
    const sizeValue = line?.properties?.find?.((prop) => prop?.name?.toLowerCase() === 'size')?.value;
    const normalizedSize = normalizeSize(sizeValue);

    items.push({
      pn: sku,
      title: [line?.title, line?.variant_title, normalizedSize].filter(Boolean).join(' - '),
      quantity: Number(line?.quantity || 1),
      retailPrice: line?.price ? Number(line.price) : undefined,
      description,
      designs,
      mockups,
    });
  });
  return items.filter((item) => item.pn || item.title);
}

function transformDraftOrderToWarehouse(payload, env) {
  if (!payload) {
    return { error: 'Missing draft order payload.' };
  }

  const items = buildItems(payload?.line_items || []);
  if (!items.length) {
    return { error: 'Draft order has no line items.' };
  }

  const shippingAddress = buildShippingAddress(payload?.shipping_address, payload?.customer);
  if (!shippingAddress.address1 || !shippingAddress.city || !shippingAddress.postcode) {
    return { error: 'Draft order missing required shipping address fields.' };
  }

  const commentParts = [`Draft order ${payload?.name || payload?.id || 'unknown'}`];
  if (payload?.note) commentParts.push(`note: ${payload.note}`);

  const data = {
    brandName: env.PRINTOTECA_BRAND_NAME,
    external_id: String(payload?.id || payload?.name || ''),
    comment: commentParts.join(', '),
    currency: payload?.currency || payload?.presentment_currency || 'USD',
    orderDate: toIsoString(payload?.created_at) || new Date().toISOString(),
    shipping_address: shippingAddress,
    shipping: {
      shippingMethod: env.PRINTOTECA_DEFAULT_SHIPPING_METHOD,
    },
    items,
  };

  console.log('Transformed:', data);

  return {
    data,
  };
}

function transformPaidOrderToWarehouse(payload, env) {
  if (!payload) {
    return { error: 'Missing order payload.' };
  }

  const items = buildItems(payload?.line_items || [], { filterPrintoteca: true });
  if (!items.length) {
    return { error: 'Order has no line items.' };
  }

  const shippingAddress = buildShippingAddress(payload?.shipping_address, payload?.customer);
  if (!shippingAddress.address1 || !shippingAddress.city || !shippingAddress.postcode) {
    return { error: 'Order missing required shipping address fields.' };
  }

  const commentParts = [`Shopify order ${payload?.name || payload?.id || 'unknown'}`];
  if (payload?.note) commentParts.push(`note: ${payload.note}`);

  const data = {
    brandName: env.PRINTOTECA_BRAND_NAME,
    external_id: String(payload?.id || payload?.name || ''),
    comment: commentParts.join(', '),
    currency: payload?.currency || payload?.presentment_currency || 'USD',
    orderDate: toIsoString(payload?.created_at) || new Date().toISOString(),
    shipping_address: shippingAddress,
    shipping: {
      shippingMethod: env.PRINTOTECA_DEFAULT_SHIPPING_METHOD,
    },
    items,
  };

  console.log('Transformed:', data);

  return {
    data,
  };
}

function normalizePhone(phone) {
  if (!phone) return '';
  const value = String(phone).trim();
  if (!value) return '';
  const normalized = value.replace(/^\++/, '');
  return `+${normalized}`;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '0.00';
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return '0.00';
  return numberValue.toFixed(2);
}

function pruneNulls(value) {
  if (Array.isArray(value)) {
    return value.map(pruneNulls);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (item === null) {
        return acc;
      }
      acc[key] = pruneNulls(item);
      return acc;
    }, {});
  }
  return value;
}

function toPropertiesMap(properties = []) {
  return Object.fromEntries(
    properties
      .filter((prop) => prop?.name)
      .map((prop) => [prop.name, prop.value ?? null])
  );
}

function parseOrderProperties(payload) {
  const rawOrder = payload?.raw || {};
  const orderName = rawOrder?.name || rawOrder?.id || payload?.shopifyOrderId || '';
  const comment = rawOrder?.note || `Shopify order ${orderName}`;
  return {
    id: String(payload?.shopifyOrderId || ''),
    external_id: String(payload?.shopifyOrderId || ''),
    type: 'order',
    created_at: payload?.createdAt || '',
    brand: 'Hugs & Mugs',
    brandName: 'Hugs & Mugs',
    comment,
  };
}

function parseShipping(payload) {
  const shipping = payload?.shippingAddress || {};
  return {
    shipping_address: {
      firstName: shipping?.first_name || '',
      lastName: shipping?.last_name || '',
      company: shipping?.company ?? '',
      address1: shipping?.address1 ?? '',
      address2: shipping?.address2 ?? '',
      city: shipping?.city ?? '',
      county: shipping?.province ?? '',
      postcode: shipping?.zip ?? '',
      country: shipping?.country ?? '',
      phone1: normalizePhone(shipping?.phone ?? ''),
    },
    shipping: {
      shippingMethod: 'regular',
    },
  };
}

function parseItems(payload) {
  const items = (payload?.lineItems || []).map((lineItem) => {
    const { designs, mockups } = extractDesigns(lineItem?.properties);
    const item = {
      pn: lineItem?.sku ?? '',
      title: lineItem?.title ?? '',
      quantity: Number(lineItem?.quantity ?? 0),
      retailPrice: formatMoney(lineItem?.price),
      description: lineItem?.name ?? lineItem?.title ?? '',
    };
    if (designs) {
      item.designs = designs;
    }
    if (mockups) {
      item.mockups = mockups;
    }
    return pruneNulls(item);
  });
  return { items };
}

function buildPrintotecaOrderFromShopify(payload) {
  const order = parseOrderProperties(payload);
  const shipping = parseShipping(payload);
  const items = parseItems(payload);

  return {
    id: order.id,
    external_id: order.external_id,
    type: order.type,
    created_at: order.created_at,
    brand: order.brand,
    brandName: order.brandName,
    comment: order.comment,
    shipping_address: shipping.shipping_address,
    shipping: shipping.shipping,
    items: items.items,
  };
}

module.exports = {
  transformDraftOrderToWarehouse,
  transformPaidOrderToWarehouse,
  buildPrintotecaOrderFromShopify,
  parseOrderProperties,
  parseShipping,
  parseItems,
  formatMoney,
  pruneNulls,
};
