import express, { Request, Response } from 'express';
import { PrintotecaOrder } from '../types/printoteca';

const router = express.Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
  });
});

router.get('/debug/order-schema', (_req: Request, res: Response) => {
  const example: PrintotecaOrder = {
    brandName: 'Your Brand',
    external_id: '123456',
    comment: 'Shopify order #1001',
    shipping_address: {
      firstName: 'John',
      lastName: 'Doe',
      address1: '123 Street',
      address2: '',
      city: 'City',
      county: 'County',
      postcode: '12345',
      country: 'Country',
      phone1: '+40123456789',
    },
    shipping: {
      shippingMethod: 'courier',
    },
    items: [
      {
        pn: 'SKU-123',
        title: 'T-shirt',
        quantity: 1,
        retailPrice: 19.99,
        description: 'Example item',
        designs: { front: 'https://example.com/front.png' },
        mockups: { front: 'https://example.com/mockup.png' },
      },
    ],
  };

  res.json(example);
});

export default router;
