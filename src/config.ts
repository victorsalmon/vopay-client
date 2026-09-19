export interface VoPayConfig {
  baseUrl: string;
  accountId: string;
  apiKey: string;
  sharedSecret: string;
}

const DEFAULT_BASE_URL = 'https://earthnode-dev.vopay.com';

/** Hosts for which cleartext `http://` is tolerated (local test servers). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Fail fast when `baseUrl` would send `apiKey`/`sharedSecret` over cleartext.
 *
 * HTTPS is required; `http://` is allowed only for loopback hosts so local
 * test servers keep working. The check lives on the client factory as well so
 * programmatic configs (which bypass `createVoPayConfigFromEnv`) are covered.
 */
export function assertSecureBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`VoPay baseUrl is not a valid URL: ${baseUrl}`);
  }
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return;
  throw new Error('VoPay baseUrl must use https:// (http:// is allowed only for loopback hosts)');
}

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
