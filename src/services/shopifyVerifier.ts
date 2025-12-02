import crypto from 'crypto';
import { EnvConfig } from './env';

export function verifyShopifyWebhook(rawBody: Buffer, hmacHeader: string | undefined, env: EnvConfig): boolean {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');
  const bufferDigest = Buffer.from(digest, 'utf-8');
  const bufferHeader = Buffer.from(hmacHeader, 'utf-8');
  if (bufferDigest.length !== bufferHeader.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferDigest, bufferHeader);
}
