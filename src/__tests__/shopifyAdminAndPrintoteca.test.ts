import axios from 'axios';
import { EnvConfig } from '../services/env';
import {
  getPrintotecaOrderIdMetafield,
  savePrintotecaOrderIdMetafield,
  syncFulfillmentFromPrintotecaStatus,
} from '../services/shopifyAdminClient';
import { cancelOrder } from '../services/printotecaClient';
import { PrintotecaWebhookOrder } from '../types/printotecaWebhook';
import { buildPrintotecaSignature } from '../services/printotecaSignature';

jest.mock('axios');

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

describe('Shopify admin metafields', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('saves and retrieves Printoteca order id metafield', async () => {
    const mockClient = {
      post: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({
        data: {
          metafields: [{ namespace: 'printoteca', key: 'order_id', value: '987' }],
        },
      }),
    } as any;
    jest.spyOn(axios, 'create').mockReturnValue(mockClient);

    await savePrintotecaOrderIdMetafield(123, '987', baseEnv);
    expect(mockClient.post).toHaveBeenCalledWith('/orders/123/metafields.json', {
      metafield: {
        namespace: 'printoteca',
        key: 'order_id',
        type: 'single_line_text_field',
        value: '987',
      },
    });

    const value = await getPrintotecaOrderIdMetafield(123, baseEnv);
    expect(mockClient.get).toHaveBeenCalledWith('/orders/123/metafields.json');
    expect(value).toBe('987');
  });
});

describe('Printoteca cancellation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('constructs correct cancel signature and url', async () => {
    const deleteMock = jest.spyOn(axios, 'delete').mockResolvedValue({});
    const env: EnvConfig = { ...baseEnv, PRINTOTECA_ENABLE_SANDBOX: false };

    await cancelOrder('999', env);

    expect(deleteMock).toHaveBeenCalled();
    const calledUrl = deleteMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('AppId=app');
    expect(calledUrl).toContain('id=999');

    const signaturePart = calledUrl.split('Signature=')[1];
    const expectedSignature = buildPrintotecaSignature('AppId=app&id=999', env.PRINTOTECA_SECRET_KEY);
    expect(signaturePart).toBe(encodeURIComponent(expectedSignature));
  });
});

describe('Printoteca webhook fulfillment sync', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates fulfillment when tracking number provided', async () => {
    const mockClient = {
      get: jest.fn().mockResolvedValue({
        data: {
          fulfillment_orders: [{ id: 555, status: 'open' }],
        },
      }),
      post: jest.fn().mockResolvedValue({}),
    } as any;
    jest.spyOn(axios, 'create').mockReturnValue(mockClient);

    const payload: PrintotecaWebhookOrder = {
      external_id: '123',
      status: 'printing',
      shipping: {
        trackingNumber: 'TRACK123',
      },
    };

    await syncFulfillmentFromPrintotecaStatus(123, payload, baseEnv);

    expect(mockClient.get).toHaveBeenCalledWith('/orders/123/fulfillment_orders.json');
    expect(mockClient.post).toHaveBeenCalledWith('/fulfillments.json', {
      fulfillment: {
        line_items_by_fulfillment_order: [{ fulfillment_order_id: 555 }],
        tracking_info: {
          number: 'TRACK123',
          company: 'Other',
          url: undefined,
        },
        notify_customer: true,
      },
    });
  });
});
