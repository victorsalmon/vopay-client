export interface VoPayConfig {
  baseUrl: string;
  accountId: string;
  apiKey: string;
  sharedSecret: string;
}

const DEFAULT_BASE_URL = 'https://earthnode-dev.vopay.com';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`VoPay is enabled but ${name} is missing`);
  return value;
}

/**
 * Build a VoPay config from the environment. Returns `null` when `VOPAY_API_KEY`
 * is absent (the integration is disabled). Throws if any required value is
 * present but incomplete, so a misconfiguration is fail-fast.
 */
export function createVoPayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VoPayConfig | null {
  const apiKey = env.VOPAY_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (env.VOPAY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  return {
    baseUrl,
    accountId: required(env, 'VOPAY_ACCOUNT_ID'),
    apiKey,
    sharedSecret: required(env, 'VOPAY_SHARED_SECRET'),
  };
}

export const VO_PAY_DEFAULT_BASE_URL = DEFAULT_BASE_URL;
