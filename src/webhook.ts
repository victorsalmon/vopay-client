import { timingSafeEqual } from 'node:crypto';
import { firstString, sha1 } from './util.js';

/**
 * Validate VoPay's ValidationKey = SHA1(shared secret + provider record id).
 */
export function verifyVoPayWebhook(
  recordId: string,
  validationKey: string,
  sharedSecret: string
): boolean {
  const expected = sha1(sharedSecret + recordId);
  const actual = Buffer.from(validationKey.trim().toLowerCase(), 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

/**
 * Pick the first non-empty string value from a payload using a list of
 * possible keys. Numbers are coerced to strings; empty/whitespace values are
 * skipped.
 */
export function getVoPayWebhookValue(
  payload: Record<string, unknown>,
  keys: string[]
): string | null {
  return firstString(payload, keys);
}
