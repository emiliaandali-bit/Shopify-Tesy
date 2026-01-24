const { transformDraftOrderToPrintoteca } = require('../services/transform.service');

describe('transformDraftOrderToPrintoteca', () => {
  it('maps draft order payload to Printoteca payload', () => {
    const payload = {
      draft_order: {
        shipping_address: {
          first_name: 'Jane',
          last_name: 'Doe',
          company: null,
          address1: '123 Main St',
          address2: 'Apt 4',
          city: 'Bucharest',
          province: 'B',
          zip: '12345',
          country: 'RO',
          phone: '+40123456789',
        },
        line_items: [
          {
            sku: 'SKU-1',
            quantity: 1,
            price: '10.50',
            name: 'Item One',
            properties: [
              { name: '_tib_design_link_1', value: 'https://example.com/front1.png' },
              { name: '_customization_image', value: 'https://example.com/mock1.png' },
            ],
          },
          {
            sku: 'SKU-2',
            quantity: 2,
            price: '12.00',
            name: 'Item Two',
            properties: [
              { name: '_tib_design_link_1', value: 'https://example.com/front2.png' },
              { name: '_tib_design_link_2', value: 'https://example.com/back2.png' },
              { name: '_customization_image', value: 'https://example.com/mock2.png' },
            ],
          },
          {
            sku: 'SKU-3',
            quantity: 3,
            price: '15.00',
            title: 'Item Three',
            properties: [
              { name: '_tib_design_link_1', value: 'https://example.com/front3.png' },
              { name: '_customization_image', value: 'https://example.com/mock3.png' },
            ],
          },
        ],
      },
    };

    const result = transformDraftOrderToPrintoteca(payload);

    expect(result.brandName).toBe('Hugs & Mugs');
    expect(result.shipping.shippingMethod).toBe('regular');
    expect(result.items).toHaveLength(3);
    expect(result.items[0].pn).toBe('SKU-1');
    expect(result.items[0].designs.front).toBe('https://example.com/front1.png');
    expect(result.items[0].mockups.front).toBe('https://example.com/mock1.png');
    expect(result.items[1].pn).toBe('SKU-2');
    expect(result.items[1].designs.front).toBe('https://example.com/front2.png');
    expect(result.items[1].mockups.front).toBe('https://example.com/mock2.png');
  });
});
