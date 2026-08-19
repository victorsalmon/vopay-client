import { createVoPayConfigFromEnv } from './config.js';
import type { VoPayConfig } from './config.js';

/**
 * Whether sandbox integration tests should run.
 *
 * Tests and scripts gate on this flag so a normal `npm test` never reaches
 * the live VoPay sandbox. Set `VOPAY_SANDBOX_INTEGRATION=1` and supply the
 * three `VOPAY_*` credential variables to enable real calls.
 */
export function isSandboxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.VOPAY_SANDBOX_INTEGRATION;
}

/**
 * Load sandbox credentials from the environment and fail fast if anything is
 * missing. This is the single place both product tests and first-call scripts
 * should read VoPay sandbox configuration.
 */
export function requireSandboxCredentials(env: NodeJS.ProcessEnv = process.env): VoPayConfig {
  if (!isSandboxEnabled(env)) {
    throw new Error('VOPAY_SANDBOX_INTEGRATION is not set');
  }

  const missing = ['VOPAY_ACCOUNT_ID', 'VOPAY_API_KEY', 'VOPAY_SHARED_SECRET'].filter(
    (name) => !env[name]?.trim()
  );
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
 */
export function uniqueClientReference(prefix = 'vopay-sandbox'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Heuristic for the failures that indicate the caller has not finished
 * sandbox onboarding (credentials wrong, signature bad, or IP not allowlisted).
 * A business validation error is NOT an auth/allowlist/signature failure.
 */
export function isAuthOrSignatureRejection(response: Response, bodyText: string): boolean {
  if (response.status === 401 || response.status === 403) return true;
  if (response.status >= 500) return false;
  return /auth|allow|signature|ip|unauthorized| forbidden /i.test(bodyText);
}

/**
 * Detect a provider-declared error/failure/declined status in a parsed JSON
 * response. This is expected on a first sandbox call when the payload fails
 * business validation but the wiring is correct.
 */
export function isProviderErrorStatus(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  const status = String(record.Status ?? record.status ?? '').toLowerCase();
  return ['error', 'failed', 'failure', 'declined'].includes(status);
}
