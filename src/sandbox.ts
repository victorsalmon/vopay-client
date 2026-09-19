import { randomBytes } from 'node:crypto';
import { createVoPayConfigFromEnv } from './config.js';
import type { VoPayConfig } from './config.js';
import { isProviderErrorStatus } from './util.js';
export { isProviderErrorStatus };

/** Explicit opt-out values; any other non-empty value enables integration. */
const SANDBOX_DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);

/**
 * Whether sandbox integration tests should run.
 *
 * Tests and scripts gate on this flag so a normal `npm test` never reaches
 * the live VoPay sandbox. Set `VOPAY_SANDBOX_INTEGRATION=1` and supply the
 * three `VOPAY_*` credential variables to enable real calls. Explicit off
 * values (`0`, `false`, `off`, `no`, case-insensitive) keep the gate closed,
 * so a disabled-looking flag can never enable live network calls.
 */
export function isSandboxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.VOPAY_SANDBOX_INTEGRATION?.trim().toLowerCase();
  return !!value && !SANDBOX_DISABLED_VALUES.has(value);
}

/** Credential environment variables required for any real sandbox call. */
const SANDBOX_CREDENTIAL_VARS = [
  'VOPAY_ACCOUNT_ID',
  'VOPAY_API_KEY',
  'VOPAY_SHARED_SECRET',
] as const;

/**
 * Load sandbox credentials from the environment and fail fast if anything is
 * missing. This is the single place both product tests and first-call scripts
 * should read VoPay sandbox configuration.
 */
export function requireSandboxCredentials(env: NodeJS.ProcessEnv = process.env): VoPayConfig {
  if (!isSandboxEnabled(env)) {
    throw new Error('VOPAY_SANDBOX_INTEGRATION is not set');
  }

  const missing = SANDBOX_CREDENTIAL_VARS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing VoPay sandbox credentials: ${missing.join(', ')}`);
  }

  // createVoPayConfigFromEnv only returns null when VOPAY_API_KEY is missing,
  // and we have just verified the three required values are non-empty.
  return createVoPayConfigFromEnv(env)!;
}

/**
 * Generate a unique client reference number or idempotency key for sandbox
 * calls. Uniqueness avoids collisions and duplicate-key rejections on retries.
 *
 * The random suffix comes from `node:crypto` (not `Math.random()`), because
 * these values are also recommended as idempotency keys, which must not be
 * guessable or predictable.
 */
export function uniqueClientReference(prefix = 'vopay-sandbox'): string {
  // Three random bytes render as six lowercase hex characters, preserving the
  // documented `prefix-<timestamp>-<6 chars>` shape while upgrading the source
  // of randomness from `Math.random()` to a CSPRNG.
  const randomSuffix = randomBytes(3).toString('hex');
  return `${prefix}-${Date.now()}-${randomSuffix}`;
}

/** HTTP status codes that unambiguously mean auth was denied. */
const UNAUTHORIZED_STATUS = 401;
const FORBIDDEN_STATUS = 403;

/** Any status at or above this threshold is treated as a server-side problem. */
const SERVER_ERROR_THRESHOLD = 500;

/** Pattern for auth/allowlist/signature/onboarding failures in a response body. */
const AUTH_REJECTION_PATTERN = /auth|allow|signature|ip|unauthorized| forbidden /i;

/**
 * Heuristic for the failures that indicate the caller has not finished
 * sandbox onboarding (credentials wrong, signature bad, or IP not allowlisted).
 * A business validation error is NOT an auth/allowlist/signature failure.
 */
export function isAuthOrSignatureRejection(response: Response, bodyText: string): boolean {
  if (response.status === UNAUTHORIZED_STATUS || response.status === FORBIDDEN_STATUS) return true;
  if (response.status >= SERVER_ERROR_THRESHOLD) return false;
  return AUTH_REJECTION_PATTERN.test(bodyText);
}
