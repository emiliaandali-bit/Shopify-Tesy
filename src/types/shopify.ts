export interface ShopifyAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

export interface ShopifyShippingLine {
  title?: string;
  code?: string;
}

export interface ShopifyLineItemProperty {
  name: string;
  value: string;
}

export interface ShopifyLineItem {
  id: number | string;
  title: string;
  variant_title?: string | null;
  quantity: number;
  price: string;
  sku?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  properties?: ShopifyLineItemProperty[];
}

export interface ShopifyOrder {
  id: number | string;
  name: string;
  email?: string;
  total_price?: string;
  note?: string | null;
  shipping_address?: ShopifyAddress;
  shipping_lines?: ShopifyShippingLine[];
  line_items: ShopifyLineItem[];
}
