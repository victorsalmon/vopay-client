import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVoPayClient,
  voPaySha1,
  type VoPayFundInput,
  type VoPayWithdrawInput,
  type VoPayClientAccountInput,
} from '../src/index.js';

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeFetchMock(
  body: Record<string, unknown>,
  status = 200
): (url: string, init?: RequestInit) => Promise<Response> {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function baseConfig() {
  return {
    baseUrl: 'https://api.vopay.test',
    accountId: 'account-1',
    apiKey: 'api-key-1',
    sharedSecret: 'shared-1',
  };
}

describe('VoPay generic post', () => {
  it('posts arbitrary fields to the requested endpoint', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const { raw } = await client.post('custom/endpoint', { Foo: 'bar', Baz: undefined });
    expect(raw).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vopay.test/api/v2/custom/endpoint',
      expect.any(Object)
    );
    const form = new URLSearchParams(String(capturedInit?.body ?? ''));
    expect(form.get('AccountID')).toBe('account-1');
    expect(form.get('Key')).toBe('api-key-1');
    expect(form.get('Signature')).toMatch(/^[a-f0-9]{40}$/);
    expect(form.get('Foo')).toBe('bar');
    expect(form.get('Baz')).toBeNull();
    expect(form.get('IdempotencyKey')).toBeNull();
  });

  it('injects an IdempotencyKey when provided', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    await client.post('custom/endpoint', { Foo: 'bar' }, 'idem-1');
    const form = new URLSearchParams(String(capturedInit?.body ?? ''));
    expect(form.get('IdempotencyKey')).toBe('idem-1');
  });

  it('throws with the HTTP status on a non-200 response', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () => new Response('error', { status: 500 }))
    );
    await expect(client.post('custom/endpoint', {})).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the provider responds with Success=false', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(JSON.stringify({ Success: false, ErrorMessage: 'Nope' }), { status: 200 })
      )
    );
    await expect(client.post('custom/endpoint', {})).rejects.toThrow(/rejected: Nope/);
  });

  it('throws when the provider responds with a recognized error status', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () => new Response(JSON.stringify({ Status: 'error' }), { status: 200 }))
    );
    await expect(client.post('custom/endpoint', {})).rejects.toThrow(/rejected/);
  });

  it('omits an empty idempotency key and empty string fields from the request body', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    await client.post('custom/endpoint', { Foo: '', Bar: 'baz' }, '');
    const form = new URLSearchParams(String(capturedInit?.body ?? ''));
    expect(form.get('IdempotencyKey')).toBeNull();
    expect(form.get('Foo')).toBeNull();
    expect(form.get('Bar')).toBe('baz');
  });

  it('uses the unknown fallback when Success=false and no ErrorMessage is present', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () => new Response(JSON.stringify({ Success: false }), { status: 200 }))
    );
    await expect(client.post('custom/endpoint', {})).rejects.toThrow('VoPay custom/endpoint rejected: unknown');
  });
});

describe('VoPay eft/fund', () => {
  it('posts a CAD fund request with bank details and an idempotency key', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/eft/fund');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('AccountID')).toBe('account-1');
      expect(form.get('Amount')).toBe('500.00');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('ClientReferenceNumber')).toBe('ref-1');
      expect(form.get('IdempotencyKey')).toBe('idem-1');
      expect(form.get('FirstName')).toBe('Jane');
      expect(form.get('LastName')).toBe('Doe');
      expect(form.get('AccountNumber')).toBe('1234567');
      expect(form.get('FinancialInstitutionNumber')).toBe('001');
      expect(form.get('BranchTransitNumber')).toBe('00002');
      expect(form.get('Iq11VerificationLevelID')).toBeNull();
      expect(form.get('Signature')).toMatch(/^[a-f0-9]{40}$/);
      return new Response(JSON.stringify({ TransactionID: 'tx-1' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftFund({
      amountCents: 50000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-1',
      idempotencyKey: 'idem-1',
      firstName: 'Jane',
      lastName: 'Doe',
      address1: '123 Main',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      postalCode: 'M5H 2N2',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });
    expect(result.providerTransactionId).toBe('tx-1');
    expect(result.flagged).toBe(false);
    expect(result.flaggedReason).toBeNull();
  });

  it('accepts a token instead of bank details', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/eft/fund');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('Token')).toBe('tok-abc');
      expect(form.get('AccountNumber')).toBeNull();
      expect(form.get('FirstName')).toBe('Jane');
      expect(form.get('Iq11VerificationLevelID')).toBeNull();
      return new Response(JSON.stringify({ TransactionID: 'tx-2' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    await client.eftFund({
      amountCents: 25000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-2',
      idempotencyKey: 'idem-2',
      token: 'tok-abc',
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('accepts a company name instead of first/last name', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/eft/fund');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('CompanyName')).toBe('Acme Inc');
      expect(form.get('FirstName')).toBeNull();
      expect(form.get('Iq11VerificationLevelID')).toBeNull();
      return new Response(JSON.stringify({ TransactionID: 'tx-3' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    await client.eftFund({
      amountCents: 100000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-3',
      idempotencyKey: 'idem-3',
      clientAccountId: 'ca-1',
      companyName: 'Acme Inc',
    });
  });

  it('rejects non-positive and non-integer amounts', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 0,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        token: 'tok',
      })
    ).rejects.toThrow(/positive integer/);
    await expect(
      client.eftFund({
        amountCents: 100.5,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        token: 'tok',
      })
    ).rejects.toThrow(/positive integer/);
  });

  it('requires a payment method', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
      })
    ).rejects.toThrow(/payment method/);
  });

  it('rejects partial bank account fields', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '123',
      })
    ).rejects.toThrow(/all bank account fields/);
  });

  it('requires a name when bank details are provided without token or client account', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        address1: '123 Main',
        city: 'Toronto',
        province: 'ON',
        country: 'CA',
        postalCode: 'M5H 2N2',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('throws when the provider rejects the request', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () => new Response(JSON.stringify({ Success: false }), { status: 200 }))
    );
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        token: 'tok',
      })
    ).rejects.toThrow(/rejected/);
  });

  it('returns flagged details when the response contains a Flagged reason', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            TransactionID: 'tx-flag',
            Flagged: 'Potential duplicate',
          }),
          { status: 200 }
        )
      )
    );
    const result = await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      token: 'tok',
    });
    expect(result.providerTransactionId).toBe('tx-flag');
    expect(result.flagged).toBe(true);
    expect(result.flaggedReason).toBe('Potential duplicate');
  });

  it('trims whitespace from the Flagged reason', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            TransactionID: 'tx-flag-ws',
            Flagged: '  Potential duplicate  ',
          }),
          { status: 200 }
        )
      )
    );
    const result = await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      token: 'tok',
    });
    expect(result.providerTransactionId).toBe('tx-flag-ws');
    expect(result.flagged).toBe(true);
    expect(result.flaggedReason).toBe('Potential duplicate');
  });

  it('sends optional EFT metadata fields', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/eft/fund');
      capturedInit = init;
      return new Response(JSON.stringify({ TransactionID: 'tx-meta' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    await client.eftFund({
      amountCents: 12345,
      currency: 'CAD',
      clientReferenceNumber: 'ref-meta',
      idempotencyKey: 'idem-meta',
      token: 'tok-meta',
      iq11VerificationLevelId: 2,
      transactionTypeCode: 'DDA',
      transactionLabel: 'Rent',
      notes: 'Monthly rent',
      glCode: '1100',
      walletId: 'wallet-1',
    });
    const form = new URLSearchParams(String(capturedInit?.body ?? ''));
    expect(form.get('Iq11VerificationLevelID')).toBe('2');
    expect(form.get('TransactionTypeCode')).toBe('DDA');
    expect(form.get('TransactionLabel')).toBe('Rent');
    expect(form.get('Notes')).toBe('Monthly rent');
    expect(form.get('GLCode')).toBe('1100');
    expect(form.get('WalletID')).toBe('wallet-1');
  });
});

describe('VoPay eft/withdraw', () => {
  it('posts a CAD withdraw request with a parent transaction id', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/eft/withdraw');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('AccountID')).toBe('account-1');
      expect(form.get('Amount')).toBe('750.00');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('ClientAccountID')).toBe('ca-1');
      expect(form.get('ParentTransactionID')).toBe('parent-tx-1');
      expect(form.get('IdempotencyKey')).toBe('idem-1');
      return new Response(JSON.stringify({ TransactionID: 'tx-4' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftWithdraw({
      amountCents: 75000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-4',
      idempotencyKey: 'idem-1',
      clientAccountId: 'ca-1',
      parentTransactionId: 'parent-tx-1',
    });
    expect(result.providerTransactionId).toBe('tx-4');
    expect(result.flagged).toBe(false);
  });

  it('requires a payment method', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
      })
    ).rejects.toThrow(/payment method/);
  });

  it('rejects non-positive and non-integer amounts', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: -100,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        token: 'tok',
      })
    ).rejects.toThrow(/positive integer/);
    await expect(
      client.eftWithdraw({
        amountCents: 100.5,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        token: 'tok',
      })
    ).rejects.toThrow(/positive integer/);
  });

  it('rejects partial bank account fields', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '123',
      })
    ).rejects.toThrow(/all bank account fields/);
  });

  it('requires a name when bank details are provided without token or client account', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        address1: '123 Main',
        city: 'Toronto',
        province: 'ON',
        country: 'CA',
        postalCode: 'M5H 2N2',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('returns flagged details when the response contains a Flagged reason', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            TransactionID: 'tx-wd-flag',
            Flagged: '  flagged  ',
          }),
          { status: 200 }
        )
      )
    );
    const result = await client.eftWithdraw({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      token: 'tok',
    });
    expect(result.providerTransactionId).toBe('tx-wd-flag');
    expect(result.flagged).toBe(true);
    expect(result.flaggedReason).toBe('flagged');
  });
});

describe('VoPay createClientAccount', () => {
  it('creates an individual client account with required fields', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/account/client-accounts/individual');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('AccountID')).toBe('account-1');
      expect(form.get('ClientAccountID')).toBe('ca-individual-1');
      expect(form.get('FirstName')).toBe('Jane');
      expect(form.get('LastName')).toBe('Doe');
      expect(form.get('EmailAddress')).toBe('jane@example.com');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('PhoneNumber')).toBe('4165550100');
      expect(form.get('DOB')).toBe('1990-01-01');
      expect(form.get('SINLastDigits')).toBe('1234');
      expect(form.get('Address1')).toBe('123 Main');
      expect(form.get('City')).toBe('Toronto');
      expect(form.get('Province')).toBe('ON');
      expect(form.get('Country')).toBe('CA');
      expect(form.get('Nationality')).toBe('CA');
      expect(form.get('PostalCode')).toBe('M5H 2N2');
      return new Response(
        JSON.stringify({
          Success: true,
          ClientAccountID: 'ca-individual-1',
          Status: 'pending',
          VerifcationLink: 'https://verify.vopay.test/ca-1',
        }),
        { status: 200 }
      );
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.createClientAccount({
      clientAccountId: 'ca-individual-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      currency: 'CAD',
      phoneNumber: '4165550100',
      dateOfBirth: '1990-01-01',
      sinLastDigits: 1234,
      address1: '123 Main',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      nationality: 'CA',
      postalCode: 'M5H 2N2',
    });
    expect(result.clientAccountId).toBe('ca-individual-1');
    expect(result.status).toBe('pending');
    expect(result.verificationLink).toBe('https://verify.vopay.test/ca-1');
  });

  it('validates required fields', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.createClientAccount({
        clientAccountId: '',
        firstName: '',
        lastName: '',
        email: '',
        currency: '',
        phoneNumber: '',
        dateOfBirth: '',
        sinLastDigits: 1234,
      })
    ).rejects.toThrow(/clientAccountId is required/);
  });

  it('validates SIN last digits are a 4-digit number', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        currency: 'CAD',
        phoneNumber: '4165550100',
        dateOfBirth: '1990-01-01',
        sinLastDigits: 12345,
      })
    ).rejects.toThrow(/4-digit/);
    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        currency: 'CAD',
        phoneNumber: '4165550100',
        dateOfBirth: '1990-01-01',
        sinLastDigits: -1,
      })
    ).rejects.toThrow(/4-digit/);
  });

  it('throws when the provider rejects account creation', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(JSON.stringify({ Success: false, ErrorMessage: 'Invalid SIN' }), { status: 200 })
      )
    );
    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        currency: 'CAD',
        phoneNumber: '4165550100',
        dateOfBirth: '1990-01-01',
        sinLastDigits: 1234,
      })
    ).rejects.toThrow(/Invalid SIN/);
  });

  it('rejects whitespace-only required values', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.createClientAccount({
        clientAccountId: '   ',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        currency: 'CAD',
        phoneNumber: '4165550100',
        dateOfBirth: '1990-01-01',
        sinLastDigits: 1234,
      })
    ).rejects.toThrow(/clientAccountId is required/);
  });

  it('falls back to the corrected VerificationLink spelling', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            Success: true,
            ClientAccountID: 'ca-1',
            Status: 'verified',
            VerificationLink: 'https://verify.vopay.test/ca-1',
          }),
          { status: 200 }
        )
      )
    );
    const result = await client.createClientAccount({
      clientAccountId: 'ca-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      currency: 'CAD',
      phoneNumber: '4165550100',
      dateOfBirth: '1990-01-01',
      sinLastDigits: 1234,
    });
    expect(result.verificationLink).toBe('https://verify.vopay.test/ca-1');
  });
});

describe('VoPay generateEmbedUrl', () => {
  it('generates an embed URL with the requested options', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/iq11/generate-embed-url');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('AccountID')).toBe('account-1');
      expect(form.get('ClientAccountID')).toBe('ca-1');
      expect(form.get('RedirectURL')).toBe('https://app.test/callback');
      expect(form.get('RedirectMethod')).toBe('innerredirect');
      expect(form.get('Language')).toBe('en');
      expect(form.get('Country')).toBe('CA');
      expect(form.get('ClientControlled')).toBe('true');
      expect(form.get('DarkMode')).toBe('false');
      expect(form.get('ClientReferenceNumber')).toBe('ref-embed');
      return new Response(
        JSON.stringify({
          Success: true,
          EmbedURL: 'https://earthnode-dev.vopay.com/iq11?key=abc',
          IframeKey: 'iframe-abc',
        }),
        { status: 200 }
      );
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.generateEmbedUrl({
      clientAccountId: 'ca-1',
      redirectUrl: 'https://app.test/callback',
      redirectMethod: 'innerredirect',
      language: 'en',
      country: 'CA',
      clientControlled: true,
      darkMode: false,
      clientReferenceNumber: 'ref-embed',
    });
    expect(result.url).toBe('https://earthnode-dev.vopay.com/iq11?key=abc');
    expect(result.iframeKey).toBe('iframe-abc');
  });

  it('works with no input and returns the URL and iframe key', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(JSON.stringify({ Success: true, EmbedURL: 'https://url.test', IframeKey: 'key-1' }), { status: 200 })
      )
    );
    const result = await client.generateEmbedUrl();
    expect(result.url).toBe('https://url.test');
    expect(result.iframeKey).toBe('key-1');
  });

  it('throws when the provider rejects the request', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () =>
        new Response(JSON.stringify({ Success: false, ErrorMessage: 'Bad redirect' }), { status: 200 })
      )
    );
    await expect(client.generateEmbedUrl({ redirectUrl: 'bad' })).rejects.toThrow(/Bad redirect/);
  });

  it('sends all optional embed URL flags as strings', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/iq11/generate-embed-url');
      capturedInit = init;
      return new Response(
        JSON.stringify({ Success: true, EmbedURL: 'https://embed.test', IframeKey: 'key-all' }),
        { status: 200 }
      );
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.generateEmbedUrl({
      clientAccountId: 'ca-1',
      redirectUrl: 'https://app.test/callback',
      redirectMethod: 'outerredirect',
      companyName: 'Acme',
      language: 'fr',
      accountSelectionMethod: 'online',
      paymentSelectionMethod: 'bank',
      clientControlled: true,
      clientReferenceNumber: 'ref-all',
      country: 'US',
      requireDebitAuthorityAgreement: false,
      verify: '2',
      cardTypeValidation: true,
      trigger3DS: false,
      acceptedCardBrands: 'visa,mastercard',
      accountHolderType: 'business',
      darkMode: true,
    });
    const form = new URLSearchParams(String(capturedInit?.body ?? ''));
    expect(form.get('ClientAccountID')).toBe('ca-1');
    expect(form.get('RedirectURL')).toBe('https://app.test/callback');
    expect(form.get('RedirectMethod')).toBe('outerredirect');
    expect(form.get('CompanyName')).toBe('Acme');
    expect(form.get('Language')).toBe('fr');
    expect(form.get('AccountSelectionMethod')).toBe('online');
    expect(form.get('PaymentSelectionMethod')).toBe('bank');
    expect(form.get('ClientReferenceNumber')).toBe('ref-all');
    expect(form.get('Country')).toBe('US');
    expect(form.get('ClientControlled')).toBe('true');
    expect(form.get('RequireDebitAuthorityAgreement')).toBe('false');
    expect(form.get('Verify')).toBe('2');
    expect(form.get('CardTypeValidation')).toBe('true');
    expect(form.get('Trigger3DS')).toBe('false');
    expect(form.get('AcceptedCardBrands')).toBe('visa,mastercard');
    expect(form.get('AccountHolderType')).toBe('business');
    expect(form.get('DarkMode')).toBe('true');
    expect(result.url).toBe('https://embed.test');
    expect(result.iframeKey).toBe('key-all');
  });
});

describe('VoPay signature', () => {
  it('uses the date-bound SHA1 signature for every endpoint', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'));
    const expected = voPaySha1('api-key-1shared-1' + '2026-08-17');

    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ TransactionID: 'tx' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      token: 'tok',
    });

    const form = new URLSearchParams(String(capturedInit?.body ?? ''));
    expect(form.get('Signature')).toBe(expected);
  });
});

describe('VoPay edge cases for mutation coverage', () => {
  it('rejects a missing currency, clientReferenceNumber, and idempotencyKey for eft/fund', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
      } as VoPayFundInput)
    ).rejects.toThrow('VoPay eft/fund currency is required');

    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
      } as VoPayFundInput)
    ).rejects.toThrow('VoPay eft/fund clientReferenceNumber is required');

    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
      } as VoPayFundInput)
    ).rejects.toThrow('VoPay eft/fund idempotencyKey is required');
  });

  it('rejects a missing currency, clientReferenceNumber, and idempotencyKey for eft/withdraw', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: 1000,
      } as VoPayWithdrawInput)
    ).rejects.toThrow('VoPay eft/withdraw currency is required');
  });

  it('rejects a missing firstName, lastName, email, currency, phoneNumber, and dateOfBirth for createClientAccount', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
      } as VoPayClientAccountInput)
    ).rejects.toThrow('VoPay createClientAccount firstName is required');

    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
      } as VoPayClientAccountInput)
    ).rejects.toThrow('VoPay createClientAccount lastName is required');

    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
        lastName: 'Doe',
      } as VoPayClientAccountInput)
    ).rejects.toThrow('VoPay createClientAccount email is required');

    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      } as VoPayClientAccountInput)
    ).rejects.toThrow('VoPay createClientAccount currency is required');

    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        currency: 'CAD',
      } as VoPayClientAccountInput)
    ).rejects.toThrow('VoPay createClientAccount phoneNumber is required');

    await expect(
      client.createClientAccount({
        clientAccountId: 'ca-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        currency: 'CAD',
        phoneNumber: '4165550100',
      } as VoPayClientAccountInput)
    ).rejects.toThrow('VoPay createClientAccount dateOfBirth is required');
  });

  it('accepts the boundary SIN last digits 0 and 9999', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      return new Response(
        JSON.stringify({
          Success: true,
          ClientAccountID: form.get('ClientAccountID'),
          Status: 'ok',
        }),
        { status: 200 }
      );
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const zero = await client.createClientAccount({
      clientAccountId: 'ca-zero',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      currency: 'CAD',
      phoneNumber: '4165550100',
      dateOfBirth: '1990-01-01',
      sinLastDigits: 0,
    });
    expect(zero.clientAccountId).toBe('ca-zero');

    const max = await client.createClientAccount({
      clientAccountId: 'ca-max',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      currency: 'CAD',
      phoneNumber: '4165550100',
      dateOfBirth: '1990-01-01',
      sinLastDigits: 9999,
    });
    expect(max.clientAccountId).toBe('ca-max');
  });

  it('rejects whitespace-only payment identifiers', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        clientAccountId: '   ',
      })
    ).rejects.toThrow(/payment method/);

    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        token: '   ',
      })
    ).rejects.toThrow(/payment method/);
  });

  it('rejects a whitespace-only bank account number as a partial bank field', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '   ',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
      })
    ).rejects.toThrow(/all bank account fields/);
  });

  it('requires a last name when only firstName is provided with bank details', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        firstName: 'Jane',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('requires a first name when only lastName is provided with bank details', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        lastName: 'Doe',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('does not send boolean embed fields when they are undefined', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({ Success: true, EmbedURL: 'https://embed.test', IframeKey: 'key-1' }),
        { status: 200 }
      );
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    await client.generateEmbedUrl();
    const form = new URLSearchParams(String(capturedInit?.body ?? ''));
    expect(form.get('ClientControlled')).toBeNull();
    expect(form.get('RequireDebitAuthorityAgreement')).toBeNull();
    expect(form.get('CardTypeValidation')).toBeNull();
    expect(form.get('Trigger3DS')).toBeNull();
    expect(form.get('DarkMode')).toBeNull();
  });

  it('accepts contactId as a payment method', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('ContactID')).toBe('contact-1');
      return new Response(JSON.stringify({ TransactionID: 'tx-contact' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      contactId: 'contact-1',
    });
    expect(result.providerTransactionId).toBe('tx-contact');
  });

  it('accepts bank details with a token and no name', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toBe('https://api.vopay.test/api/v2/eft/fund');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('Token')).toBe('tok-bank');
      expect(form.get('AccountNumber')).toBe('1234567');
      return new Response(JSON.stringify({ TransactionID: 'tx-bank-token' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      token: 'tok-bank',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });
    expect(result.providerTransactionId).toBe('tx-bank-token');
  });

  it('accepts bank details with a clientAccountId and no name', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () => new Response(JSON.stringify({ TransactionID: 'tx-bank-ca' }), { status: 200 }))
    );
    const result = await client.eftWithdraw({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      clientAccountId: 'ca-1',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });
    expect(result.providerTransactionId).toBe('tx-bank-ca');
  });

  it('accepts bank details with firstName+lastName and no client/token', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () => new Response(JSON.stringify({ TransactionID: 'tx-bank-name' }), { status: 200 }))
    );
    const result = await client.eftWithdraw({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
      firstName: 'Jane',
      lastName: 'Doe',
      address1: '123 Main',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      postalCode: 'M5H 2N2',
    });
    expect(result.providerTransactionId).toBe('tx-bank-name');
  });

  it('accepts bank details with companyName and no client/token', async () => {
    const client = createVoPayClient(
      baseConfig(),
      vi.fn(async () => new Response(JSON.stringify({ TransactionID: 'tx-bank-co' }), { status: 200 }))
    );
    const result = await client.eftWithdraw({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref',
      idempotencyKey: 'idem',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
      companyName: 'Acme Inc',
      address1: '123 Main',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      postalCode: 'M5H 2N2',
    });
    expect(result.providerTransactionId).toBe('tx-bank-co');
  });

  it('requires a lastName for eft/withdraw when only firstName is provided with bank details', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        firstName: 'Jane',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('requires a firstName for eft/withdraw when only lastName is provided with bank details', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        lastName: 'Doe',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('rejects partial bank account fields for eft/fund when one field is missing', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        branchTransitNumber: '00002',
      })
    ).rejects.toThrow(/all bank account fields/);

    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
      })
    ).rejects.toThrow(/all bank account fields/);

    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
      })
    ).rejects.toThrow(/all bank account fields/);
  });

  it('rejects partial bank account fields for eft/withdraw when one field is missing', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        branchTransitNumber: '00002',
      })
    ).rejects.toThrow(/all bank account fields/);

    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
      })
    ).rejects.toThrow(/all bank account fields/);

    await expect(
      client.eftWithdraw({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
      })
    ).rejects.toThrow(/all bank account fields/);
  });

  it('requires a lastName for eft/fund when only firstName is provided with bank details', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        firstName: 'Jane',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('requires a firstName for eft/fund when only lastName is provided with bank details', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        accountNumber: '1234567',
        financialInstitutionNumber: '001',
        branchTransitNumber: '00002',
        lastName: 'Doe',
      })
    ).rejects.toThrow(/firstName\+lastName or companyName/);
  });

  it('accepts bank details with clientAccountId, contactId, or token and no name for eft/fund', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ TransactionID: 'tx' }), { status: 200 }));
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);

    await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-ca',
      idempotencyKey: 'idem-ca',
      clientAccountId: 'ca-1',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });

    await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-contact',
      idempotencyKey: 'idem-contact',
      contactId: 'contact-1',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });

    await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-token-bank',
      idempotencyKey: 'idem-token-bank',
      token: 'tok-bank',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('accepts bank details with firstName+lastName or companyName and no client/token for eft/fund', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ TransactionID: 'tx' }), { status: 200 }));
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);

    await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-name',
      idempotencyKey: 'idem-name',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
      firstName: 'Jane',
      lastName: 'Doe',
      address1: '123 Main',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      postalCode: 'M5H 2N2',
    });

    await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-co',
      idempotencyKey: 'idem-co',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
      companyName: 'Acme Inc',
      address1: '123 Main',
      city: 'Toronto',
      province: 'ON',
      country: 'CA',
      postalCode: 'M5H 2N2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts bank details with contactId or token and no name for eft/withdraw', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ TransactionID: 'tx' }), { status: 200 }));
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);

    await client.eftWithdraw({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-contact',
      idempotencyKey: 'idem-contact',
      contactId: 'contact-1',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });

    await client.eftWithdraw({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-token',
      idempotencyKey: 'idem-token',
      token: 'tok-bank',
      accountNumber: '1234567',
      financialInstitutionNumber: '001',
      branchTransitNumber: '00002',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts Flinks banking connector tokens instead of bank details or name', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('FlinksAccountID')).toBe('flinks-acc');
      expect(form.get('FlinksLoginID')).toBe('flinks-login');
      expect(form.get('AccountNumber')).toBeNull();
      return new Response(JSON.stringify({ TransactionID: 'tx-flinks' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-flinks',
      idempotencyKey: 'idem-flinks',
      flinksAccountId: 'flinks-acc',
      flinksLoginId: 'flinks-login',
    });
    expect(result.providerTransactionId).toBe('tx-flinks');
  });

  it('requires both FlinksAccountID and FlinksLoginID', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        flinksAccountId: 'flinks-acc',
      })
    ).rejects.toThrow(/payment method/);
  });

  it('accepts Plaid and Inverite connector tokens', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('PlaidProcessorToken')).toBe('plaid-proc');
      expect(form.get('InveriteRequestGUID')).toBe('inverite-1');
      expect(form.get('AccountNumber')).toBeNull();
      return new Response(JSON.stringify({ TransactionID: 'tx-connectors' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-connectors',
      idempotencyKey: 'idem-connectors',
      plaidProcessorToken: 'plaid-proc',
      inveriteRequestGuid: 'inverite-1',
    });
    expect(result.providerTransactionId).toBe('tx-connectors');
  });

  it('accepts an MX connector token for eft/withdraw without a name', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('MxAuthorizationCode')).toBe('mx-code');
      expect(form.get('AccountNumber')).toBeNull();
      return new Response(JSON.stringify({ TransactionID: 'tx-mx' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftWithdraw({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-mx',
      idempotencyKey: 'idem-mx',
      mxAuthorizationCode: 'mx-code',
    });
    expect(result.providerTransactionId).toBe('tx-mx');
  });

  it('accepts the full Plaid public token set', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('PlaidPublicToken')).toBe('public');
      expect(form.get('PlaidAccessToken')).toBe('access');
      expect(form.get('PlaidAccountID')).toBe('account');
      expect(form.get('AccountNumber')).toBeNull();
      return new Response(JSON.stringify({ TransactionID: 'tx-plaid' }), { status: 200 });
    });
    const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
    const result = await client.eftFund({
      amountCents: 1000,
      currency: 'CAD',
      clientReferenceNumber: 'ref-plaid',
      idempotencyKey: 'idem-plaid',
      plaidPublicToken: 'public',
      plaidAccessToken: 'access',
      plaidAccountId: 'account',
    });
    expect(result.providerTransactionId).toBe('tx-plaid');
  });

  it('rejects an incomplete Plaid public token set', async () => {
    const client = createVoPayClient(baseConfig(), vi.fn());
    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        plaidPublicToken: 'public',
        plaidAccessToken: 'access',
      })
    ).rejects.toThrow(/payment method/);

    await expect(
      client.eftFund({
        amountCents: 1000,
        currency: 'CAD',
        clientReferenceNumber: 'ref',
        idempotencyKey: 'idem',
        plaidAccessToken: 'access',
        plaidAccountId: 'account',
      })
    ).rejects.toThrow(/payment method/);
  });
});
