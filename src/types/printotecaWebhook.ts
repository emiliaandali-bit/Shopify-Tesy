export interface PrintotecaWebhookOrder {
  id?: string | number;
  external_id?: string | number;
  status?: string;
  shipping?: {
    shippingMethod?: string;
    trackingNumber?: string;
    shiped_at?: string;
    trackingUrl?: string;
  };
  [key: string]: any;
}
