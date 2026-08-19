import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVoPayClient,
  createVoPayConfigFromEnv,
  getVoPayWebhookValue,
  verifyVoPayWebhook,
  voPaySha1,
} from '../src/index.js';

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VoPay configuration', () => {
  it('is disabled when VOPAY_API_KEY is missing', () => {
    expect(createVoPayConfigFromEnv({})).toBeNull();
  });

  it('is enabled when VOPAY_API_KEY is present and other values are provided', () => {
    const env = {
      VOPAY_BASE_URL: 'https://api.vopay.test/',
      VOPAY_ACCOUNT_ID: 'account-1',
      VOPAY_API_KEY: 'api-key-1',
      VOPAY_SHARED_SECRET: 'shared-1',
    };
    const cfg = createVoPayConfigFromEnv(env);
    expect(cfg).not.toBeNull();
    expect(cfg!.baseUrl).toBe('https://api.vopay.test');
  });

  it('returns a complete config with a trailing slash stripped from baseUrl', () => {
    const env = {
      VOPAY_BASE_URL: 'https://api.vopay.test/',
      VOPAY_ACCOUNT_ID: 'account-1',
      VOPAY_API_KEY: 'api-key-1',
      VOPAY_SHARED_SECRET: 'shared-1',
    };
    const cfg = createVoPayConfigFromEnv(env);
    expect(cfg).toMatchObject({
      baseUrl: 'https://api.vopay.test',
      accountId: 'account-1',
      apiKey: 'api-key-1',
      sharedSecret: 'shared-1',
    });
  });

  it('defaults to the VoPay dev base URL when VOPAY_BASE_URL is absent', () => {
    const env = {
      VOPAY_ACCOUNT_ID: 'account-1',
      VOPAY_API_KEY: 'api-key-1',
      VOPAY_SHARED_SECRET: 'shared-1',
    };
    const cfg = createVoPayConfigFromEnv(env);
    expect(cfg!.baseUrl).toBe('https://earthnode-dev.vopay.com');
  });

  it('requires all connection settings when VOPAY_API_KEY is present', () => {
    expect(() => createVoPayConfigFromEnv({ VOPAY_API_KEY: 'api-key-1' })).toThrow(
      /VOPAY_ACCOUNT_ID is missing/
    );
    expect(() =>
      createVoPayConfigFromEnv({
        VOPAY_API_KEY: 'api-key-1',
        VOPAY_ACCOUNT_ID: 'account-1',
      })
    ).toThrow(/VOPAY_SHARED_SECRET is missing/);
  });

  it('falls back to the default base URL when VOPAY_BASE_URL is whitespace', () => {
    const cfg = createVoPayConfigFromEnv({
      VOPAY_API_KEY: 'api-key-1',
      VOPAY_BASE_URL: '   ',
      VOPAY_ACCOUNT_ID: 'account-1',
      VOPAY_SHARED_SECRET: 'shared-1',
    });
    expect(cfg).not.toBeNull();
    expect(cfg!.baseUrl).toBe('https://earthnode-dev.vopay.com');
  });

  it('trims whitespace from the API key, account id, and shared secret', () => {
    const cfg = createVoPayConfigFromEnv({
      VOPAY_API_KEY: '  api-key-1  ',
      VOPAY_BASE_URL: 'https://api.vopay.test',
      VOPAY_ACCOUNT_ID: '  account-1  ',
      VOPAY_SHARED_SECRET: '  shared-1  ',
    });
    expect(cfg).toMatchObject({
      apiKey: 'api-key-1',
      accountId: 'account-1',
      sharedSecret: 'shared-1',
    });
  });
});

describe('getVoPayWebhookValue / firstString', () => {
  it('picks the first non-empty string value from the supplied keys', () => {
    expect(getVoPayWebhookValue({ a: 'one', b: 'two' }, ['b', 'a'])).toBe('two');
    expect(getVoPayWebhookValue({ a: 'one', b: 'two' }, ['c', 'a'])).toBe('one');
  });

  it('coerces finite numbers to strings', () => {
    expect(getVoPayWebhookValue({ a: 123 }, ['a'])).toBe('123');
  });

  it('trims non-empty string values before returning', () => {
    expect(getVoPayWebhookValue({ a: '  padded  ' }, ['a'])).toBe('padded');
  });

  it('rejects non-finite numbers and NaN', () => {
    expect(getVoPayWebhookValue({ a: Infinity }, ['a'])).toBeNull();
    expect(getVoPayWebhookValue({ a: NaN }, ['a'])).toBeNull();
  });

  it('skips empty/whitespace-only strings and falls through', () => {
    expect(getVoPayWebhookValue({ a: '   ', b: 'real' }, ['a', 'b'])).toBe('real');
  });

  it('returns null when no key matches', () => {
    expect(getVoPayWebhookValue({ a: '' }, ['b'])).toBeNull();
    expect(getVoPayWebhookValue({}, ['a'])).toBeNull();
  });
});

describe('VoPay money requests', () => {
  it('posts a CAD email request with stable idempotency fields and a date-bound signature', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['content-type']).toBe(
        'application/x-www-form-urlencoded'
      );
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('AccountID')).toBe('account-1');
      expect(form.get('Amount')).toBe('1250.00');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('EmailAddress')).toBe('tenant@example.com');
      expect(form.get('GenerateURL')).toBe('false');
      expect(form.get('ClientReferenceNumber')).toBe('UH-charge-1');
      expect(form.get('IdempotencyKey')).toBe('rent-charge-1');
      expect(form.get('RecipientName')).toBe('Tenant Example');
      expect(form.get('MessageForRecipient')).toBe('Rent due');
      expect(form.get('Signature')).toMatch(/^[a-f0-9]{40}$/);
      return new Response(JSON.stringify({ TransactionID: 'vopay-tx-1' }), { status: 200 });
    });
    const client = createVoPayClient(
      {
        baseUrl: 'https://api.vopay.test',
        accountId: 'account-1',
        apiKey: 'api-key-1',
        sharedSecret: 'shared-1',
      },
      fetchMock as unknown as typeof fetch
    );

    await expect(
      client.requestMoney({
        amountCents: 125000,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).resolves.toMatchObject({ providerTransactionId: 'vopay-tx-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vopay.test/api/v2/interac/money-request',
      expect.any(Object)
    );
  });

  it('rejects non-positive and non-integer amounts', async () => {
    const client = createVoPayClient(
      {
        baseUrl: 'https://api.vopay.test',
        accountId: 'account-1',
        apiKey: 'api-key-1',
        sharedSecret: 'shared-1',
      },
      vi.fn()
    );
    await expect(
      client.requestMoney({
        amountCents: 0,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/positive integer/);
    await expect(
      client.requestMoney({
        amountCents: -100,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/positive integer/);
    await expect(
      client.requestMoney({
        amountCents: 100.5,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/positive integer/);
  });

  it('throws with the HTTP status on a non-200 response', async () => {
    const client = createVoPayClient(
      {
        baseUrl: 'https://api.vopay.test',
        accountId: 'account-1',
        apiKey: 'api-key-1',
        sharedSecret: 'shared-1',
      },
      vi.fn(async () => new Response('error', { status: 500 }))
    );
    await expect(
      client.requestMoney({
        amountCents: 125000,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the provider responds with an explicit error status', async () => {
    const client = createVoPayClient(
      {
        baseUrl: 'https://api.vopay.test',
        accountId: 'account-1',
        apiKey: 'api-key-1',
        sharedSecret: 'shared-1',
      },
      vi.fn(async () => new Response(JSON.stringify({ Status: 'error' }), { status: 200 }))
    );
    await expect(
      client.requestMoney({
        amountCents: 125000,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/rejected/);
  });

  it('throws for any recognized provider error status key', async () => {
    const makeClient = (body: Record<string, unknown>) =>
      createVoPayClient(
        {
          baseUrl: 'https://api.vopay.test',
          accountId: 'account-1',
          apiKey: 'api-key-1',
          sharedSecret: 'shared-1',
        },
        vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
      );

    await expect(
      makeClient({ status: 'failed' }).requestMoney({
        amountCents: 125000,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/rejected/);

    await expect(
      makeClient({ Result: 'failure' }).requestMoney({
        amountCents: 125000,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/rejected/);

    await expect(
      makeClient({ result: 'declined' }).requestMoney({
        amountCents: 125000,
        recipientEmail: 'tenant@example.com',
        recipientName: 'Tenant Example',
        message: 'Rent due',
        clientReferenceNumber: 'UH-charge-1',
        idempotencyKey: 'rent-charge-1',
      })
    ).rejects.toThrow(/rejected/);
  });

  it('falls through the transaction-id key list and returns null when none match', async () => {
    const client = createVoPayClient(
      {
        baseUrl: 'https://api.vopay.test',
        accountId: 'account-1',
        apiKey: 'api-key-1',
        sharedSecret: 'shared-1',
      },
      vi.fn(async () => new Response(JSON.stringify({ Other: 'value' }), { status: 200 }))
    );
    const result = await client.requestMoney({
      amountCents: 125000,
      recipientEmail: 'tenant@example.com',
      recipientName: 'Tenant Example',
      message: 'Rent due',
      clientReferenceNumber: 'UH-charge-1',
      idempotencyKey: 'rent-charge-1',
    });
    expect(result.providerTransactionId).toBeNull();
  });

  it('accepts alternate transaction id keys', async () => {
    const mkClient = (body: Record<string, unknown>) =>
      createVoPayClient(
        {
          baseUrl: 'https://api.vopay.test',
          accountId: 'account-1',
          apiKey: 'api-key-1',
          sharedSecret: 'shared-1',
        },
        vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
      );

    expect(
      (
        await mkClient({ TransactionId: 'vopay-tx-2' }).requestMoney({
          amountCents: 125000,
          recipientEmail: 'tenant@example.com',
          recipientName: 'Tenant Example',
          message: 'Rent due',
          clientReferenceNumber: 'UH-charge-1',
          idempotencyKey: 'rent-charge-1',
        })
      ).providerTransactionId
    ).toBe('vopay-tx-2');

    expect(
      (
        await mkClient({ RequestID: 'vopay-tx-3' }).requestMoney({
          amountCents: 125000,
          recipientEmail: 'tenant@example.com',
          recipientName: 'Tenant Example',
          message: 'Rent due',
          clientReferenceNumber: 'UH-charge-1',
          idempotencyKey: 'rent-charge-1',
        })
      ).providerTransactionId
    ).toBe('vopay-tx-3');

    expect(
      (
        await mkClient({ RequestId: 'vopay-tx-3b' }).requestMoney({
          amountCents: 125000,
          recipientEmail: 'tenant@example.com',
          recipientName: 'Tenant Example',
          message: 'Rent due',
          clientReferenceNumber: 'UH-charge-1',
          idempotencyKey: 'rent-charge-1',
        })
      ).providerTransactionId
    ).toBe('vopay-tx-3b');

    expect(
      (
        await mkClient({ ID: 'vopay-tx-4' }).requestMoney({
          amountCents: 125000,
          recipientEmail: 'tenant@example.com',
          recipientName: 'Tenant Example',
          message: 'Rent due',
          clientReferenceNumber: 'UH-charge-1',
          idempotencyKey: 'rent-charge-1',
        })
      ).providerTransactionId
    ).toBe('vopay-tx-4');

    expect(
      (
        await mkClient({ id: 'vopay-tx-5' }).requestMoney({
          amountCents: 125000,
          recipientEmail: 'tenant@example.com',
          recipientName: 'Tenant Example',
          message: 'Rent due',
          clientReferenceNumber: 'UH-charge-1',
          idempotencyKey: 'rent-charge-1',
        })
      ).providerTransactionId
    ).toBe('vopay-tx-5');
  });

  it('ignores a non-object JSON body and returns null for the id', async () => {
    const client = createVoPayClient(
      {
        baseUrl: 'https://api.vopay.test',
        accountId: 'account-1',
        apiKey: 'api-key-1',
        sharedSecret: 'shared-1',
      },
      vi.fn(async () => new Response(JSON.stringify('ok'), { status: 200 }))
    );
    const result = await client.requestMoney({
      amountCents: 125000,
      recipientEmail: 'tenant@example.com',
      recipientName: 'Tenant Example',
      message: 'Rent due',
      clientReferenceNumber: 'UH-charge-1',
      idempotencyKey: 'rent-charge-1',
    });
    expect(result.providerTransactionId).toBeNull();
    expect(result.raw).toEqual({});
  });

  it('freezes the signature to a mocked UTC date', async () => {
    const expectedDate = '2026-08-17';
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'));

    const expectedSignature = voPaySha1('api-key-1shared-1' + expectedDate);

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('Signature')).toBe(expectedSignature);
      return new Response(JSON.stringify({ TransactionID: 'vopay-tx-1' }), { status: 200 });
    });

    const client = createVoPayClient(
      {
        baseUrl: 'https://api.vopay.test',
        accountId: 'account-1',
        apiKey: 'api-key-1',
        sharedSecret: 'shared-1',
      },
      fetchMock as unknown as typeof fetch
    );

    await client.requestMoney({
      amountCents: 125000,
      recipientEmail: 'tenant@example.com',
      recipientName: 'Tenant Example',
      message: 'Rent due',
      clientReferenceNumber: 'UH-charge-1',
      idempotencyKey: 'rent-charge-1',
    });
  });
});

describe('verifyVoPayWebhook', () => {
  it('verifies VoPay ValidationKey values', () => {
    const recordId = 'record-123';
    const secret = 'shared-secret';
    const valid = voPaySha1(secret + recordId);
    expect(verifyVoPayWebhook(recordId, valid.toUpperCase(), secret)).toBe(true);
    expect(verifyVoPayWebhook(recordId, voPaySha1(secret + 'other'), secret)).toBe(false);
  });

  it('ignores leading and trailing whitespace in the validation key', () => {
    const recordId = 'record-123';
    const secret = 'shared-secret';
    const valid = voPaySha1(secret + recordId);
    expect(verifyVoPayWebhook(recordId, `  ${valid.toUpperCase()}  `, secret)).toBe(true);
  });

  it('rejects a validation key of the wrong length', () => {
    const recordId = 'record-123';
    const secret = 'shared-secret';
    expect(verifyVoPayWebhook(recordId, 'tooshort', secret)).toBe(false);
    expect(verifyVoPayWebhook(recordId, voPaySha1(secret + recordId) + 'a', secret)).toBe(false);
  });
});
