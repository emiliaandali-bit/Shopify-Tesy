import { mapShopifyOrderToPrintoteca, isPrintotecaLineItem } from '../services/mapping';
import { EnvConfig } from '../services/env';
import { ShopifyOrder, ShopifyLineItem } from '../types/shopify';

const baseEnv: EnvConfig = {
  PORT: 8080,
  NODE_ENV: 'test',
  SHOPIFY_WEBHOOK_SECRET: 'secret',
  SHOPIFY_STORE_DOMAIN: 'store.myshopify.com',
  SHOPIFY_ADMIN_ACCESS_TOKEN: 'token',
  PRINTOTECA_APP_ID: 'app',
  PRINTOTECA_SECRET_KEY: 'key',
  PRINTOTECA_BRAND_NAME: 'Brand',
  PRINTOTECA_BASE_URL: 'https://printoteca.ro/api',
  PRINTOTECA_DEFAULT_SHIPPING_METHOD: 'courier',
  PRINTOTECA_ENABLE_SANDBOX: true,
  PRINTO_TECA_WEBHOOK_SECRET: 'webhook',
};

describe('isPrintotecaLineItem', () => {
  it('returns true when vendor matches', () => {
    const line: ShopifyLineItem = {
      id: 1,
      title: 'Item',
      price: '10.00',
      quantity: 1,
      sku: 'SKU1',
      vendor: 'Printoteca',
    };
    expect(isPrintotecaLineItem(line)).toBe(true);
  });

  it('returns false without sku', () => {
    const line: ShopifyLineItem = {
      id: 1,
      title: 'Item',
      price: '10.00',
      quantity: 1,
      vendor: 'Printoteca',
    };
    expect(isPrintotecaLineItem(line)).toBe(false);
  });
});

describe('mapShopifyOrderToPrintoteca', () => {
  const baseOrder: ShopifyOrder = {
    id: '123',
    name: '#1001',
    email: 'a@example.com',
    total_price: '20.00',
    shipping_address: {
      first_name: 'Jane',
      last_name: 'Doe',
      address1: 'Street 1',
      city: 'City',
      province: 'County',
      zip: '0000',
      country: 'RO',
      phone: '123',
    },
    shipping_lines: [{ title: 'Fast Courier' }],
    line_items: [],
    note: 'Please ship fast',
  };

  it('maps single design link to front', async () => {
    const order: ShopifyOrder = {
      ...baseOrder,
      line_items: [
        {
          id: '1',
          title: 'Tee',
          variant_title: 'Blue',
          quantity: 1,
          price: '10',
          sku: 'SKU1',
          vendor: 'Printoteca',
          properties: [{ name: '_tib_design_link_1', value: 'https://example.com/front.png' }],
        },
      ],
    };

    const result = await mapShopifyOrderToPrintoteca(order, baseEnv);
    expect(result?.items[0].designs?.front).toBe('https://example.com/front.png');
    expect(result?.items[0].designs?.back).toBeUndefined();
    expect(result?.shipping.shippingMethod).toBe('courier');
  });

  it('maps two design links to front and back', async () => {
    const order: ShopifyOrder = {
      ...baseOrder,
      line_items: [
        {
          id: '1',
          title: 'Tee',
          quantity: 1,
          price: '10',
          sku: 'SKU1',
          vendor: 'Printoteca',
          properties: [
            { name: '_tib_design_link_1', value: 'front' },
            { name: '_tib_design_link_2', value: 'back' },
          ],
        },
      ],
    };

    const result = await mapShopifyOrderToPrintoteca(order, baseEnv);
    expect(result?.items[0].designs?.front).toBe('front');
    expect(result?.items[0].designs?.back).toBe('back');
  });

  it('maps tib design links with customization image as mockup', async () => {
    const order: ShopifyOrder = {
      ...baseOrder,
      line_items: [
        {
          id: '1',
          title: 'Tee',
          quantity: 1,
          price: '10',
          sku: 'SKU1',
          vendor: 'Printoteca',
          properties: [
            { name: '_tib_design_link_1', value: 'front-link' },
            { name: '_tib_design_link_2', value: 'back-link' },
            { name: '_customization_image', value: 'mockup-link' },
          ],
        },
      ],
    };

    const result = await mapShopifyOrderToPrintoteca(order, baseEnv);
    expect(result?.items[0].designs?.front).toBe('front-link');
    expect(result?.items[0].designs?.back).toBe('back-link');
    expect(result?.items[0].mockups?.front).toBe('mockup-link');
  });

  it('maps customization image when tib links missing', async () => {
    const order: ShopifyOrder = {
      ...baseOrder,
      line_items: [
        {
          id: '1',
          title: 'Tee',
          quantity: 1,
          price: '10',
          sku: 'SKU1',
          vendor: 'Printoteca',
          properties: [{ name: '_customization_image', value: 'mockup' }],
        },
      ],
    };

    const result = await mapShopifyOrderToPrintoteca(order, baseEnv);
    expect(result?.items[0].designs?.front).toBe('mockup');
    expect(result?.items[0].mockups?.front).toBe('mockup');
  });
});
