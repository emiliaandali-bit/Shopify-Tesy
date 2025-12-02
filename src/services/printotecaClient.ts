import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { EnvConfig } from './env';
import logger from './logger';
import { PrintotecaOrder } from '../types/printoteca';
import { buildPrintotecaSignature } from './printotecaSignature';

export async function sendOrderToPrintoteca(order: PrintotecaOrder, env: EnvConfig): Promise<unknown> {
  const bodyString = JSON.stringify(order);
  const signature = crypto
    .createHash('sha1')
    .update(bodyString + env.PRINTOTECA_SECRET_KEY)
    .digest('hex');

  const url = `${env.PRINTOTECA_BASE_URL}/orders.php?AppId=${encodeURIComponent(
    env.PRINTOTECA_APP_ID
  )}&Signature=${encodeURIComponent(signature)}`;

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info('Sandbox mode enabled - not sending to Printoteca', { url });
    logger.debug('Sandbox payload preview\n' + JSON.stringify(order, null, 2));
    return { sandbox: true, success: true };
  }

  try {
    const response = await axios.post(url, bodyString, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('Printoteca API call successful', {
      status: response.status,
      externalId: order.external_id,
      printotecaId: (response.data as any)?.id,
    });
    return response.data;
  } catch (err) {
    const error = err as AxiosError<any>;
    const status = error.response?.status;
    const data = error.response?.data;

    logger.error('Failed to send order to Printoteca', {
      externalId: order.external_id,
      status,
      printotecaError:
        data && typeof data === 'object' ? data : String(data ?? error.message ?? 'Unknown error'),
    });

    throw error;
  }
}

export async function cancelOrder(
  printotecaOrderId: string,
  env: EnvConfig
): Promise<void> {
  const queryWithoutSignature = `AppId=${encodeURIComponent(env.PRINTOTECA_APP_ID)}&id=${encodeURIComponent(
    printotecaOrderId
  )}`;
  const signature = buildPrintotecaSignature(queryWithoutSignature, env.PRINTOTECA_SECRET_KEY);
  const url = `${env.PRINTOTECA_BASE_URL}/orders.php?${queryWithoutSignature}&Signature=${encodeURIComponent(signature)}`;

  if (env.PRINTOTECA_ENABLE_SANDBOX) {
    logger.info(`Sandbox mode - would cancel Printoteca order ${printotecaOrderId} at ${url}`);
    return;
  }

  try {
    await axios.delete(url);
    logger.info(`Cancelled Printoteca order ${printotecaOrderId}`);
  } catch (error: any) {
    logger.error('Failed to cancel Printoteca order', {
      id: printotecaOrderId,
      status: error?.response?.status,
      data: error?.response?.data || error?.message,
    });
  }
}
