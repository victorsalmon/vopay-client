import { createHash } from 'node:crypto';

/** An ISO 8601 calendar date is exactly ten characters (YYYY-MM-DD). */
const ISO_DATE_LENGTH = 10;

/**
 * Return the SHA-1 hex digest of `value`.
 *
 * VoPay signs requests with `SHA1(apiKey + sharedSecret + todayUtc())`, so
 * this helper keeps the hashing convention in one place and returns a
 * 40-character lowercase string that callers can predict in tests.
 */
export function sha1(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex');
}

/**
 * Return the current UTC date in `YYYY-MM-DD` form.
 *
 * The signature is date-bound, not time-bound, so we truncate the ISO string
 * to the calendar portion.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, ISO_DATE_LENGTH);
}

/**
 * Pick the first non-empty value from `record` using the candidate `keys`.
 *
 * Whitespace-only strings are treated as empty. Finite numbers are coerced
 * to strings (VoPay sometimes returns numeric IDs); `NaN` and infinities are
 * ignored so callers do not accidentally publish non-numeric-looking tokens.
 */
export function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

/**
 * Canonical VoPay status values that mean the request reached the provider
 * but was rejected for business, validation, or risk reasons.
 */
const PROVIDER_ERROR_STATUSES: readonly string[] = ['error', 'failed', 'failure', 'declined'];

/**
 * Detect a provider-declared error/failure/declined status in a parsed JSON
 * response. This is expected on a first sandbox call when the payload fails
 * business validation but the wiring is correct.
 */
export function isProviderErrorStatus(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  const status = String(
    record.Status ?? record.status ?? record.Result ?? record.result ?? ''
  ).toLowerCase();
  return PROVIDER_ERROR_STATUSES.includes(status);
}
