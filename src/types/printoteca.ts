import type { ShippingMethod } from '../services/env';

export interface PrintotecaDesigns {
  front?: string;
  back?: string;
}

export interface PrintotecaMockups {
  front?: string;
  back?: string;
}

export interface PrintotecaOrderItem {
  pn: string;
  title?: string;
  quantity: number;
  retailPrice?: number;
  description?: string;
  designs?: PrintotecaDesigns;
  mockups?: PrintotecaMockups;
}

export interface PrintotecaShippingAddress {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  county?: string;
  postcode: string;
  country: string;
  phone1?: string;
}

export interface PrintotecaShipping {
  shippingMethod: ShippingMethod;
}

export interface PrintotecaOrder {
  brandName: string;
  external_id: string;
  comment?: string;
  shipping_address: PrintotecaShippingAddress;
  shipping: PrintotecaShipping;
  items: PrintotecaOrderItem[];
}
