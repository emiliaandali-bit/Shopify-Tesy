import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

type ShippingMethod = 'regular' | 'recorded' | 'courier' | 'collection';

export interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | string;
  SHOPIFY_WEBHOOK_SECRET: string;
  PRINTOTECA_APP_ID: string;
  PRINTOTECA_SECRET_KEY: string;
  PRINTOTECA_BRAND_NAME: string;
  PRINTOTECA_BASE_URL: string;
  PRINTOTECA_DEFAULT_SHIPPING_METHOD: ShippingMethod;
  PRINTOTECA_ENABLE_SANDBOX: boolean;
}

const requiredVars: Array<keyof EnvConfig> = [
  'SHOPIFY_WEBHOOK_SECRET',
  'PRINTOTECA_APP_ID',
  'PRINTOTECA_SECRET_KEY',
  'PRINTOTECA_BRAND_NAME',
];

function parseShippingMethod(value?: string): ShippingMethod {
  const allowed: ShippingMethod[] = ['regular', 'recorded', 'courier', 'collection'];
  if (value && allowed.includes(value as ShippingMethod)) {
    return value as ShippingMethod;
  }
  return 'courier';
}

function parseBoolean(value?: string): boolean {
  if (!value) return false;
  return value.toLowerCase() === 'true';
}

function requireEnv(name: keyof EnvConfig, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    logger.error(`Missing required environment variable: ${name}`);
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnv(): EnvConfig {
  const config: EnvConfig = {
    PORT: parseInt(process.env.PORT || '8080', 10),
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
    SHOPIFY_WEBHOOK_SECRET: requireEnv('SHOPIFY_WEBHOOK_SECRET'),
    PRINTOTECA_APP_ID: requireEnv('PRINTOTECA_APP_ID'),
    PRINTOTECA_SECRET_KEY: requireEnv('PRINTOTECA_SECRET_KEY'),
    PRINTOTECA_BRAND_NAME: requireEnv('PRINTOTECA_BRAND_NAME'),
    PRINTOTECA_BASE_URL: process.env.PRINTOTECA_BASE_URL || 'https://printoteca.ro/api',
    PRINTOTECA_DEFAULT_SHIPPING_METHOD: parseShippingMethod(
      process.env.PRINTOTECA_DEFAULT_SHIPPING_METHOD
    ),
    PRINTOTECA_ENABLE_SANDBOX: parseBoolean(process.env.PRINTOTECA_ENABLE_SANDBOX ?? 'true'),
  };

  requiredVars.forEach((key) => {
    if (!config[key]) {
      throw new Error(`Environment variable ${key} is required`);
    }
  });

  return config;
}

export type { ShippingMethod };
