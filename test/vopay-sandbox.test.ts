import { describe, expect, it } from 'vitest';
import { createVoPayClient, verifyVoPayWebhook, voPaySha1 } from '../src/index.js';
import {
  isAuthOrSignatureRejection,
  isProviderErrorStatus,
  isSandboxEnabled,
  requireSandboxCredentials,
  uniqueClientReference,
} from '../src/sandbox.js';

describe.skipIf(!isSandboxEnabled())('VoPay sandbox — existing Interac money request endpoint', () => {
  it('round-trips the signature algorithm with the real shared secret', () => {
    const config = requireSandboxCredentials();
    const recordId = uniqueClientReference('sig');
    const expected = voPaySha1(config.sharedSecret + recordId);

    expect(voPaySha1(config.sharedSecret + recordId)).toBe(expected);
    expect(expected).toMatch(/^[a-f0-9]{40}$/);
  });

  it('reaches the sandbox via requestMoney without auth/allowlist/signature rejection', async () => {
    const config = requireSandboxCredentials();
    const client = createVoPayClient(config);
    const clientReferenceNumber = uniqueClientReference();

    try {
      const result = await client.requestMoney({
        amountCents: 8500,
        recipientEmail: 'tenant@sandbox.vopay.com',
        recipientName: 'Sandbox Tenant',
        message: `Shared-client sandbox test ${clientReferenceNumber}`,
        clientReferenceNumber,
        idempotencyKey: uniqueClientReference('idem'),
      });
      expect(result.providerTransactionId).toBeTruthy();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(
        message,
        `auth/allowlist/signature failure: ${message}`
      ).not.toMatch(/401|403|allowlist|signature|auth/i);
    }
  });

  it('verifies a webhook ValidationKey with the real shared secret', () => {
    const config = requireSandboxCredentials();
    const recordId = uniqueClientReference('record');
    const validationKey = voPaySha1(config.sharedSecret + recordId);

    expect(verifyVoPayWebhook(recordId, validationKey, config.sharedSecret)).toBe(true);
    expect(verifyVoPayWebhook(recordId, `${validationKey}x`, config.sharedSecret)).toBe(false);
  });
});

describe.skipIf(!isSandboxEnabled())('VoPay sandbox — remaining core endpoints', () => {
  it('reaches the sandbox via eft/fund', async () => {
    const config = requireSandboxCredentials();
    const client = createVoPayClient(config);
    const clientReferenceNumber = uniqueClientReference('fund');

    try {
      const result = await client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber,
        idempotencyKey: uniqueClientReference('fund-idem'),
        firstName: 'Sandbox',
        lastName: 'Tenant',
        address1: '123 Sandbox St',
        city: 'Toronto',
        province: 'ON',
        country: 'CA',
        postalCode: 'M5H 1A1',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
      });
      expect(result.providerTransactionId).toBeTruthy();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message, `auth/allowlist/signature failure: ${message}`).not.toMatch(
        /401|403|allowlist|signature|auth/i
      );
    }
  });

  it('reaches the sandbox via eft/withdraw', async () => {
    const config = requireSandboxCredentials();
    const client = createVoPayClient(config);
    const clientReferenceNumber = uniqueClientReference('withdraw');

    try {
      const result = await client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber,
        idempotencyKey: uniqueClientReference('withdraw-idem'),
        firstName: 'Sandbox',
        lastName: 'Tenant',
        address1: '123 Sandbox St',
        city: 'Toronto',
        province: 'ON',
        country: 'CA',
        postalCode: 'M5H 1A1',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
      });
      expect(result.providerTransactionId).toBeTruthy();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message, `auth/allowlist/signature failure: ${message}`).not.toMatch(
        /401|403|allowlist|signature|auth/i
      );
    }
  });

  it('reaches the sandbox via createClientAccount', async () => {
    const config = requireSandboxCredentials();
    const client = createVoPayClient(config);

    try {
      const result = await client.createClientAccount({
        clientAccountId: uniqueClientReference('ca'),
        firstName: 'Sandbox',
        lastName: 'Account',
        email: 'sandbox@vopay.test',
        currency: 'CAD',
        phoneNumber: '4165550100',
        dateOfBirth: '1990-01-01',
        sinLastDigits: 1234,
        address1: '123 Sandbox St',
        city: 'Toronto',
        province: 'ON',
        country: 'CA',
        postalCode: 'M5H 1A1',
      });
      expect(result.clientAccountId).toBeTruthy();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message, `auth/allowlist/signature failure: ${message}`).not.toMatch(
        /401|403|allowlist|signature|auth/i
      );
    }
  });

  it('reaches the sandbox via generateEmbedUrl', async () => {
    const config = requireSandboxCredentials();
    const client = createVoPayClient(config);

    try {
      const result = await client.generateEmbedUrl({
        clientReferenceNumber: uniqueClientReference('embed'),
        country: 'CA',
        language: 'en',
      });
      expect(result.url).toBeTruthy();
      expect(result.iframeKey).toBeTruthy();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message, `auth/allowlist/signature failure: ${message}`).not.toMatch(
        /401|403|allowlist|signature|auth/i
      );
    }
  });
});

describe('sandbox helpers (no env required)', () => {
  it('reports sandbox enabled only when VOPAY_SANDBOX_INTEGRATION is truthy', () => {
    expect(isSandboxEnabled({})).toBe(false);
    expect(isSandboxEnabled({ VOPAY_SANDBOX_INTEGRATION: '' })).toBe(false);
    expect(isSandboxEnabled({ VOPAY_SANDBOX_INTEGRATION: '0' })).toBe(true);
    expect(isSandboxEnabled({ VOPAY_SANDBOX_INTEGRATION: '1' })).toBe(true);
  });

  it('throws when sandbox is disabled', () => {
    expect(() => requireSandboxCredentials({})).toThrow(/VOPAY_SANDBOX_INTEGRATION/);
  });

  it('throws for missing sandbox credentials and lists them with a comma separator', () => {
    expect(() =>
      requireSandboxCredentials({ VOPAY_SANDBOX_INTEGRATION: '1' })
    ).toThrow(/VOPAY_ACCOUNT_ID/);

    expect(() =>
      requireSandboxCredentials({
        VOPAY_SANDBOX_INTEGRATION: '1',
        VOPAY_ACCOUNT_ID: 'acc',
      })
    ).toThrow(/VOPAY_API_KEY/);

    expect(() =>
      requireSandboxCredentials({
        VOPAY_SANDBOX_INTEGRATION: '1',
        VOPAY_API_KEY: 'key',
      })
    ).toThrow(/VOPAY_ACCOUNT_ID, VOPAY_SHARED_SECRET/);
  });

  it('rejects credentials that are only whitespace', () => {
    expect(() =>
      requireSandboxCredentials({
        VOPAY_SANDBOX_INTEGRATION: '1',
        VOPAY_ACCOUNT_ID: '   ',
        VOPAY_API_KEY: '  ',
        VOPAY_SHARED_SECRET: '  ',
      })
    ).toThrow(/VOPAY_ACCOUNT_ID/);
  });

  it('returns a complete config when all credentials are present', () => {
    const config = requireSandboxCredentials({
      VOPAY_SANDBOX_INTEGRATION: '1',
      VOPAY_ACCOUNT_ID: 'acc-1',
      VOPAY_API_KEY: 'key-1',
      VOPAY_SHARED_SECRET: 'secret-1',
    });
    expect(config).toMatchObject({
      baseUrl: 'https://earthnode-dev.vopay.com',
      accountId: 'acc-1',
      apiKey: 'key-1',
      sharedSecret: 'secret-1',
    });
  });

  it('generates unique client references with the requested prefix', () => {
    const a = uniqueClientReference('pfx');
    const b = uniqueClientReference('pfx');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^pfx-\d+-[a-z0-9]+$/);

    const defaultRef = uniqueClientReference();
    expect(defaultRef).toMatch(/^vopay-sandbox-\d+-[a-z0-9]+$/);
  });

  it('produces a six-character random suffix for every reference', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const ref = uniqueClientReference(i % 2 === 0 ? 'pfx' : 'vopay-sandbox');
      const suffix = ref.slice(ref.lastIndexOf('-') + 1);
      expect(suffix).toMatch(/^[a-z0-9]{6}$/);
      seen.add(suffix);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('identifies auth and signature rejections by status, even with an unrelated body', () => {
    const ok = new Response('{}', { status: 200 });
    expect(isAuthOrSignatureRejection(ok, '{}')).toBe(false);

    const denied = new Response('not allowlisted', { status: 403 });
    expect(isAuthOrSignatureRejection(denied, 'not allowlisted')).toBe(true);

    const badSig = new Response('signature invalid', { status: 400 });
    expect(isAuthOrSignatureRejection(badSig, 'signature invalid')).toBe(true);

    const serverError = new Response('signature invalid', { status: 500 });
    expect(isAuthOrSignatureRejection(serverError, 'signature invalid')).toBe(false);

    const statusOnly = new Response('business validation', { status: 401 });
    expect(isAuthOrSignatureRejection(statusOnly, 'business validation')).toBe(true);

    const forbiddenOnly = new Response('business validation', { status: 403 });
    expect(isAuthOrSignatureRejection(forbiddenOnly, 'business validation')).toBe(true);
  });

  it('detects provider-declared error statuses', () => {
    expect(isProviderErrorStatus({ Status: 'error' })).toBe(true);
    expect(isProviderErrorStatus({ status: 'Failed' })).toBe(true);
    expect(isProviderErrorStatus({ status: 'failure' })).toBe(true);
    expect(isProviderErrorStatus({ status: 'declined' })).toBe(true);
    expect(isProviderErrorStatus({ status: 'success' })).toBe(false);
    expect(isProviderErrorStatus(null)).toBe(false);
    expect(isProviderErrorStatus('error')).toBe(false);
  });
});
