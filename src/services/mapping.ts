import axios from 'axios';
import logger from './logger';
import { EnvConfig } from './env';
import { PrintotecaOrder, PrintotecaOrderItem } from '../types/printoteca';
import { ShopifyLineItem, ShopifyOrder } from '../types/shopify';

const CHECK_DESIGN_URLS = false; // flip to true to send HEAD requests before submitting designs

export function isPrintotecaLineItem(line: ShopifyLineItem): boolean {
  if (!line.sku) return false;
  const vendorMatch = (line.vendor || '').toLowerCase() === 'printoteca';
  const typeMatch = (line.product_type || '').toLowerCase() === 'printoteca';
  return vendorMatch || typeMatch;
}

function extractDesigns(properties: ShopifyLineItem['properties']): {
  designs: PrintotecaOrderItem['designs'];
  mockups: PrintotecaOrderItem['mockups'];
} {
  const props = properties || [];

  let frontDesignUrl: string | undefined;
  let backDesignUrl: string | undefined;
  let customizationImageUrl: string | undefined;

  for (const prop of props) {
    const key = prop.name;
    const value = prop.value;

    if (key === '_tib_design_link_1' && value) {
      frontDesignUrl = value;
    } else if (key === '_tib_design_link_2' && value) {
      backDesignUrl = value;
    } else if (key === '_customization_image' && value) {
      customizationImageUrl = value;
    }
  }

  const designs: PrintotecaOrderItem['designs'] = {};
  if (frontDesignUrl) {
    designs.front = frontDesignUrl;
  } else if (customizationImageUrl) {
    designs.front = customizationImageUrl;
  }

  if (backDesignUrl) {
    designs.back = backDesignUrl;
  }

  const mockups: PrintotecaOrderItem['mockups'] = {};
  if (customizationImageUrl) {
    mockups.front = customizationImageUrl;
  }

  return { designs, mockups };
}

async function checkDesignUrl(url?: string): Promise<void> {
  if (!CHECK_DESIGN_URLS || !url) return;
  try {
    const response = await axios.head(url);
    if (response.status < 200 || response.status >= 300) {
      logger.warn(`Design URL may not be reachable (${response.status}): ${url}`);
    }
  } catch (error) {
    logger.warn(`Design URL might not be ready yet: ${url}`);
  }
}

function buildDescription(line: ShopifyLineItem): string {
  const parts: string[] = [line.title];
  if (line.variant_title) parts.push(line.variant_title);
  if (line.properties && line.properties.length > 0) {
    const personalization = line.properties
      .filter((p) => !p.name.startsWith('_tib_'))
      .map((p) => `${p.name}: ${p.value}`)
      .join('; ');
    if (personalization) {
      parts.push(`Personalization -> ${personalization}`);
    }
  }
  return parts.filter(Boolean).join(' | ');
}

function inferShippingMethod(
  order: ShopifyOrder,
  fallback: EnvConfig['PRINTOTECA_DEFAULT_SHIPPING_METHOD']
): EnvConfig['PRINTOTECA_DEFAULT_SHIPPING_METHOD'] {
  const line = order.shipping_lines?.[0];
  const text = `${line?.title || ''} ${line?.code || ''}`.toLowerCase();
  if (text.includes('courier')) return 'courier';
  if (text.includes('recorded')) return 'recorded';
  if (text.includes('regular')) return 'regular';
  if (text.includes('collection') || text.includes('pickup')) return 'collection';
  return fallback;
}

export async function mapShopifyOrderToPrintoteca(
  order: ShopifyOrder,
  env: EnvConfig
): Promise<PrintotecaOrder | null> {
  if (!order.shipping_address) {
    logger.error(`Order ${order.id} has no shipping address. Cannot map to Printoteca.`);
    return null;
  }

  const shippingAddress = order.shipping_address;
  const shipping_address = {
    firstName: shippingAddress.first_name || 'Customer',
    lastName: shippingAddress.last_name || 'Unknown',
    company: shippingAddress.company || undefined,
    address1: shippingAddress.address1 || '',
    address2: shippingAddress.address2 || undefined,
    city: shippingAddress.city || '',
    county: shippingAddress.province || undefined,
    postcode: shippingAddress.zip || '',
    country: shippingAddress.country || '',
    phone1: shippingAddress.phone || undefined,
  };

  const items: PrintotecaOrderItem[] = [];
  for (const line of order.line_items) {
    if (!isPrintotecaLineItem(line)) {
      continue; // skip non-Printoteca items; adjust logic above as needed
    }

    const { designs, mockups } = extractDesigns(line.properties);
    await Promise.all([checkDesignUrl(designs?.front), checkDesignUrl(designs?.back)]);

    if (!designs?.front && !designs?.back) {
      logger.warn(`No design URL found for line item ${line.id} in order ${order.id}`);
    }

    const description = buildDescription(line);
    const titlePieces = [line.title];
    if (line.variant_title) titlePieces.push(line.variant_title);

    items.push({
      pn: line.sku || '',
      title: titlePieces.filter(Boolean).join(' - '),
      quantity: line.quantity,
      retailPrice: parseFloat(line.price),
      description,
      designs: Object.keys(designs || {}).length ? designs : undefined,
      mockups: Object.keys(mockups || {}).length ? mockups : undefined,
    });
  }

  if (items.length === 0) {
    return null;
  }

  const commentParts = [`Shopify order ${order.name}`, `id ${order.id}`];
  if (order.note) commentParts.push(`note: ${order.note}`);

  const result: PrintotecaOrder = {
    brandName: env.PRINTOTECA_BRAND_NAME,
    external_id: String(order.id),
    comment: commentParts.join(', '),
    shipping_address,
    shipping: {
      shippingMethod: inferShippingMethod(order, env.PRINTOTECA_DEFAULT_SHIPPING_METHOD),
    },
    items,
  };

  return result;
}
