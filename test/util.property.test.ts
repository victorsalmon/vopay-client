import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createVoPayConfigFromEnv,
  getVoPayWebhookValue,
  verifyVoPayWebhook,
  voPaySha1,
} from '../src/index.js';
import {
  isAuthOrSignatureRejection,
  isProviderErrorStatus,
  isSandboxEnabled,
  requireSandboxCredentials,
  uniqueClientReference,
} from '../src/sandbox.js';

/**
 * Property tests for the pure helper layer: util.ts (sha1, todayUtc,
 * firstString, isProviderErrorStatus), config.ts (createVoPayConfigFromEnv),
 * webhook.ts (verifyVoPayWebhook), and sandbox.ts helpers.
 *
 * Each property either mirrors the documented contract over randomly
 * generated input (so any mutation that changes behaviour is caught) or
 * asserts an invariant that must hold for every input.
 */

const DEFAULT_BASE_URL = 'https://earthnode-dev.vopay.com';

// Safe, unique, alphanumeric env keys.
const safeKey = fc.integer({ min: 1, max: 99999 }).map((n) => `k${n}`);

const jsonishValue = fc.oneof(
  fc.string({ maxLength: 8 }),
  fc.integer(),
  fc.float({ noNaN: true }),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.record({ nested: fc.string({ maxLength: 4 }) }),
);

describe('sha1 — property tests', () => {
  it('is deterministic and matches node crypto SHA-1 (40 lowercase hex chars) for every string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = voPaySha1(s);
        expect(out).toBe(createHash('sha1').update(s, 'utf8').digest('hex'));
        expect(out).toMatch(/^[a-f0-9]{40}$/);
        expect(voPaySha1(s)).toBe(out); // deterministic
      }),
    );
  });

  it('matches the known SHA-1 vector for the empty string', () => {
    expect(voPaySha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});

describe('firstString / getVoPayWebhookValue — property tests', () => {
  it('returns the first non-empty trimmed string or finite-number string, else null', () => {
    const recordArb = fc.dictionary(safeKey, jsonishValue);
    const keysArb = fc.array(safeKey, { maxLength: 8 });

    const model = (record: Record<string, unknown>, keys: string[]): string | null => {
      for (const key of keys) {
        const v = record[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      }
      return null;
    };

    fc.assert(
      fc.property(recordArb, keysArb, (record, keys) => {
        expect(getVoPayWebhookValue(record, keys)).toBe(model(record, keys));
      }),
    );
  });
});

describe('isProviderErrorStatus — property tests', () => {
  const shallowObj = fc.dictionary(
    safeKey,
    fc.oneof(fc.string({ maxLength: 8 }), fc.integer(), fc.constant(null), fc.boolean()),
  );
  const rawArb = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.string({ maxLength: 8 }),
    fc.integer(),
    shallowObj,
    fc.array(fc.integer()),
  );

  const model = (raw: unknown): boolean => {
    if (!raw || typeof raw !== 'object') return false;
    const record = raw as Record<string, unknown>;
    const status = String(
      record.Status ?? record.status ?? record.Result ?? record.result ?? '',
    ).toLowerCase();
    return ['error', 'failed', 'failure', 'declined'].includes(status);
  };

  it('matches the modelled contract for every value', () => {
    fc.assert(
      fc.property(rawArb, (raw) => {
        expect(isProviderErrorStatus(raw)).toBe(model(raw));
      }),
    );
  });
});

describe('createVoPayConfigFromEnv — property tests', () => {
  const envArb = fc.record({
    VOPAY_API_KEY: fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
      fc.string({ minLength: 1, maxLength: 20 }),
    ),
    VOPAY_BASE_URL: fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
      fc.string({ minLength: 1, maxLength: 20 }).map((s) => (s.endsWith('/') ? s : s + '/')),
    ),
    VOPAY_ACCOUNT_ID: fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
      fc.string({ minLength: 1, maxLength: 20 }),
    ),
    VOPAY_SHARED_SECRET: fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
      fc.string({ minLength: 1, maxLength: 20 }),
    ),
  });

  const model = (env: Record<string, string | undefined>): {
    baseUrl: string;
    accountId: string;
    apiKey: string;
    sharedSecret: string;
  } | null => {
    const apiKey = env.VOPAY_API_KEY?.trim();
    if (!apiKey) return null;
    const baseUrl = (env.VOPAY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
    const accountId = env.VOPAY_ACCOUNT_ID?.trim();
    if (!accountId) throw new Error('VoPay is enabled but VOPAY_ACCOUNT_ID is missing');
    const sharedSecret = env.VOPAY_SHARED_SECRET?.trim();
    if (!sharedSecret) throw new Error('VoPay is enabled but VOPAY_SHARED_SECRET is missing');
    return { baseUrl, accountId, apiKey, sharedSecret };
  };

  it('matches the modelled contract (return value or thrown message) for every env', () => {
    fc.assert(
      fc.property(envArb, (env) => {
        let modelled: { baseUrl: string; accountId: string; apiKey: string; sharedSecret: string } | null;
        let modelErr: string | null = null;
        try {
          modelled = model(env);
        } catch (e) {
          modelled = null;
          modelErr = (e as Error).message;
        }
        if (modelErr) {
          expect(() => createVoPayConfigFromEnv(env)).toThrow(modelErr);
        } else {
          expect(createVoPayConfigFromEnv(env)).toEqual(modelled);
        }
      }),
    );
  });

  it('baseUrl never ends with a slash and credentials are trimmed when enabled', () => {
    fc.assert(
      fc.property(envArb, (env) => {
        let cfg: ReturnType<typeof createVoPayConfigFromEnv>;
        try {
          cfg = createVoPayConfigFromEnv(env);
        } catch {
          // Incomplete config throws; nothing to assert here.
          return;
        }
        if (cfg) {
          expect(cfg.baseUrl).not.toMatch(/\/$/);
          expect(cfg.apiKey).toBe(env.VOPAY_API_KEY!.trim());
          expect(cfg.accountId).toBe(env.VOPAY_ACCOUNT_ID!.trim());
          expect(cfg.sharedSecret).toBe(env.VOPAY_SHARED_SECRET!.trim());
        }
      }),
    );
  });
});

describe('verifyVoPayWebhook — property tests', () => {
  it('accepts iff the trimmed, lower-cased key equals sha1(secret + recordId)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (recordId, validationKey, sharedSecret) => {
        const expected = voPaySha1(sharedSecret + recordId);
        const accept = validationKey.trim().toLowerCase() === expected;
        expect(verifyVoPayWebhook(recordId, validationKey, sharedSecret)).toBe(accept);
      }),
    );
  });

  it('accepts the correct key regardless of case and surrounding whitespace', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (recordId, sharedSecret) => {
        const key = voPaySha1(sharedSecret + recordId);
        expect(verifyVoPayWebhook(recordId, key.toUpperCase(), sharedSecret)).toBe(true);
        expect(verifyVoPayWebhook(recordId, `  ${key}  `, sharedSecret)).toBe(true);
        expect(verifyVoPayWebhook(recordId, voPaySha1(sharedSecret + recordId + 'x'), sharedSecret)).toBe(
          false,
        );
      }),
    );
  });
});

describe('sandbox helpers — property tests', () => {
  const flagArb = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('0'),
    fc.constant('1'),
    fc.string({ maxLength: 5 }),
  );

  it('isSandboxEnabled is the boolean coercion of VOPAY_SANDBOX_INTEGRATION', () => {
    fc.assert(
      fc.property(flagArb, (flag) => {
        const env = flag === undefined ? {} : { VOPAY_SANDBOX_INTEGRATION: flag };
        expect(isSandboxEnabled(env)).toBe(!!flag);
      }),
    );
  });

  const credEnvArb = fc.record({
    VOPAY_SANDBOX_INTEGRATION: flagArb,
    VOPAY_ACCOUNT_ID: fc.oneof(fc.constant(undefined), fc.constant(''), fc.constant('  '), fc.string({ minLength: 1, maxLength: 16 })),
    VOPAY_API_KEY: fc.oneof(fc.constant(undefined), fc.constant(''), fc.constant('  '), fc.string({ minLength: 1, maxLength: 16 })),
    VOPAY_SHARED_SECRET: fc.oneof(fc.constant(undefined), fc.constant(''), fc.constant('  '), fc.string({ minLength: 1, maxLength: 16 })),
  });

  it('requireSandboxCredentials matches the modelled contract', () => {
    const model = (env: Record<string, string | undefined>) => {
      if (!env.VOPAY_SANDBOX_INTEGRATION) {
        throw new Error('VOPAY_SANDBOX_INTEGRATION is not set');
      }
      const missing = ['VOPAY_ACCOUNT_ID', 'VOPAY_API_KEY', 'VOPAY_SHARED_SECRET'].filter(
        (name) => !env[name]?.trim(),
      );
      if (missing.length > 0) {
        throw new Error(`Missing VoPay sandbox credentials: ${missing.join(', ')}`);
      }
      return createVoPayConfigFromEnv(env)!;
    };

    fc.assert(
      fc.property(credEnvArb, (env) => {
        let modelErr: string | null = null;
        let modelCfg: unknown = null;
        try {
          modelCfg = model(env);
        } catch (e) {
          modelErr = (e as Error).message;
        }
        if (modelErr) {
          expect(() => requireSandboxCredentials(env)).toThrow(modelErr);
        } else {
          expect(requireSandboxCredentials(env)).toEqual(modelCfg);
        }
      }),
    );
  });

  it('uniqueClientReference matches the prefix-<digits>-<alnum> shape and is unique per call', () => {
    const prefixArb = fc.string({ minLength: 1, maxLength: 12 }).map((s) =>
      s.replace(/[^a-zA-Z0-9_-]/g, '') || 'pfx',
    );
    fc.assert(
      fc.property(prefixArb, (prefix) => {
        const a = uniqueClientReference(prefix);
        const b = uniqueClientReference(prefix);
        expect(a).toMatch(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-[a-z0-9]+$`));
        expect(a).not.toBe(b);
      }),
    );
    // Default prefix.
    expect(uniqueClientReference()).toMatch(/^vopay-sandbox-\d+-[a-z0-9]+$/);
  });

  it('isAuthOrSignatureRejection matches the modelled contract for every status and body', () => {
    const model = (status: number, bodyText: string): boolean => {
      if (status === 401 || status === 403) return true;
      if (status >= 500) return false;
      return /auth|allow|signature|ip|unauthorized| forbidden /i.test(bodyText);
    };
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 599 }).filter((s) => ![204, 205, 304].includes(s)),
        fc.string(),
        (status, bodyText) => {
          expect(isAuthOrSignatureRejection(new Response(bodyText, { status }), bodyText)).toBe(
            model(status, bodyText),
          );
        },
      ),
    );
  });
});
