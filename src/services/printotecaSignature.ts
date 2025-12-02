import crypto from 'crypto';

export function buildPrintotecaSignature(payload: string, secretKey: string): string {
  return crypto.createHash('sha1').update(payload + secretKey).digest('hex');
}
