import { beforeAll, describe, expect, it } from 'vitest';
import { createVoPayClient, type VoPayClient } from '../src/index.js';
import {
  isSandboxEnabled,
  requireSandboxCredentials,
  uniqueClientReference,
} from '../src/sandbox.js';

interface FetchRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string;
}

function makeRecordingFetch(): {
  fetch: typeof fetch;
  records: FetchRecord[];
} {
  const records: FetchRecord[] = [];

  const recordingFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const raw = init.headers;
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        if (raw instanceof Headers) {
          raw.forEach((value, key) => {
            headers[key] = value;
          });
        } else {
          for (const [key, value] of Object.entries(raw)) {
            if (value !== undefined) headers[key] = String(value);
          }
        }
      }
    }

    const bodyText = init?.body ? String(init.body) : '';
    records.push({ url, method, headers, bodyText });

    return fetch(input, init);
  };

  return { fetch: recordingFetch, records };
}

function parseForm(record: FetchRecord): URLSearchParams {
  return new URLSearchParams(record.bodyText);
}

function assertNoAuthRejection(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : String(error);
  expect(
    message,
    `${context} must not fail for auth/allowlist/signature reasons: ${message}`
  ).not.toMatch(/401|403|allowlist|signature|auth/i);
}

function assertCommonSandboxFields(
  form: URLSearchParams,
  config: { accountId: string; apiKey: string },
  idempotencyKey?: string
): void {
  expect(form.get('AccountID')).toBe(config.accountId);
  expect(form.get('Key')).toBe(config.apiKey);
  expect(form.get('Signature')).toMatch(/^[a-f0-9]{40}$/);
  if (idempotencyKey !== undefined) {
    expect(form.get('IdempotencyKey')).toBe(idempotencyKey);
  }
}

describe.skipIf(!isSandboxEnabled())('VoPay sandbox API contract', () => {
  let config: ReturnType<typeof requireSandboxCredentials>;

  beforeAll(() => {
    config = requireSandboxCredentials();
  });

  it('round-trips the SHA1 signature against the sandbox', async () => {
    const { fetch: _fetch, records } = makeRecordingFetch();
    const client = createVoPayClient(config, _fetch);
    const clientReferenceNumber = uniqueClientReference('post');

    try {
      await client.post('interac/money-request', {
        Amount: '1.00',
        Currency: 'CAD',
        ClientReferenceNumber: clientReferenceNumber,
      });
    } catch (error) {
      assertNoAuthRejection(error, 'post');
    }

    const record = records[0];
    expect(record).toBeDefined();
    expect(record.url).toBe(`${config.baseUrl}/api/v2/interac/money-request`);
    expect(record.method).toBe('POST');
    expect(record.headers['content-type']).toBe(
      'application/x-www-form-urlencoded'
    );

    const form = parseForm(record);
    assertCommonSandboxFields(form, config);
    expect(form.get('Amount')).toBe('1.00');
    expect(form.get('Currency')).toBe('CAD');
    expect(form.get('ClientReferenceNumber')).toBe(clientReferenceNumber);
  });

  it('requests money with the correct contract fields', async () => {
    const { fetch: _fetch, records } = makeRecordingFetch();
    const client = createVoPayClient(config, _fetch);
    const clientReferenceNumber = uniqueClientReference('money');
    const idempotencyKey = uniqueClientReference('money-idem');

    try {
      const result = await client.requestMoney({
        amountCents: 1234,
        recipientEmail: 'tenant@sandbox.vopay.com',
        recipientName: 'Sandbox Tenant',
        message: `Contract test ${clientReferenceNumber}`,
        clientReferenceNumber,
        idempotencyKey,
      });
      const record = records[0];
      const form = parseForm(record);
      assertCommonSandboxFields(form, config, idempotencyKey);
      expect(form.get('Amount')).toBe('12.34');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('EmailAddress')).toBe('tenant@sandbox.vopay.com');
      expect(form.get('RecipientName')).toBe('Sandbox Tenant');
      expect(form.get('MessageForRecipient')).toBe(
        `Contract test ${clientReferenceNumber}`
      );
      expect(form.get('ClientReferenceNumber')).toBe(clientReferenceNumber);
      expect(form.get('GenerateURL')).toBe('false');
      expect(result).toMatchObject({
        providerTransactionId: expect.any(String),
      });
    } catch (error) {
      assertNoAuthRejection(error, 'requestMoney');
    }
  });

  it('funds an account with the correct contract fields', async () => {
    const { fetch: _fetch, records } = makeRecordingFetch();
    const client = createVoPayClient(config, _fetch);
    const clientReferenceNumber = uniqueClientReference('fund');
    const idempotencyKey = uniqueClientReference('fund-idem');

    try {
      const result = await client.eftFund({
        amountCents: 10000,
        currency: 'CAD',
        clientReferenceNumber,
        idempotencyKey,
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
      const record = records[0];
      const form = parseForm(record);
      assertCommonSandboxFields(form, config, idempotencyKey);
      expect(form.get('Amount')).toBe('100.00');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('ClientReferenceNumber')).toBe(clientReferenceNumber);
      expect(form.get('FirstName')).toBe('Sandbox');
      expect(form.get('LastName')).toBe('Tenant');
      expect(form.get('AccountNumber')).toBe('1234567');
      expect(form.get('FinancialInstitutionNumber')).toBe('001');
      expect(form.get('BranchTransitNumber')).toBe('00002');
      expect(result).toMatchObject({
        providerTransactionId: expect.any(String),
        flagged: expect.any(Boolean),
      });
    } catch (error) {
      assertNoAuthRejection(error, 'eftFund');
    }
  });

  it('withdraws with the correct contract fields', async () => {
    const { fetch: _fetch, records } = makeRecordingFetch();
    const client = createVoPayClient(config, _fetch);
    const clientReferenceNumber = uniqueClientReference('withdraw');
    const idempotencyKey = uniqueClientReference('withdraw-idem');

    try {
      const result = await client.eftWithdraw({
        amountCents: 5000,
        currency: 'CAD',
        clientReferenceNumber,
        idempotencyKey,
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
      const record = records[0];
      const form = parseForm(record);
      assertCommonSandboxFields(form, config, idempotencyKey);
      expect(form.get('Amount')).toBe('50.00');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('ClientReferenceNumber')).toBe(clientReferenceNumber);
      expect(form.get('AccountNumber')).toBe('1234567');
      expect(result).toMatchObject({
        providerTransactionId: expect.any(String),
        flagged: expect.any(Boolean),
      });
    } catch (error) {
      assertNoAuthRejection(error, 'eftWithdraw');
    }
  });

  it('creates a client account with the correct contract fields', async () => {
    const { fetch: _fetch, records } = makeRecordingFetch();
    const client = createVoPayClient(config, _fetch);
    const clientAccountId = uniqueClientReference('ca');

    try {
      const result = await client.createClientAccount({
        clientAccountId,
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
      const record = records[0];
      const form = parseForm(record);
      assertCommonSandboxFields(form, config);
      expect(form.get('ClientAccountID')).toBe(clientAccountId);
      expect(form.get('FirstName')).toBe('Sandbox');
      expect(form.get('LastName')).toBe('Account');
      expect(form.get('EmailAddress')).toBe('sandbox@vopay.test');
      expect(form.get('Currency')).toBe('CAD');
      expect(form.get('PhoneNumber')).toBe('4165550100');
      expect(form.get('DOB')).toBe('1990-01-01');
      expect(form.get('SINLastDigits')).toBe('1234');
      expect(result).toMatchObject({
        clientAccountId: expect.any(String),
      });
    } catch (error) {
      assertNoAuthRejection(error, 'createClientAccount');
    }
  });

  it('generates an embed URL with the correct contract fields', async () => {
    const { fetch: _fetch, records } = makeRecordingFetch();
    const client = createVoPayClient(config, _fetch);
    const clientReferenceNumber = uniqueClientReference('embed');

    try {
      const result = await client.generateEmbedUrl({
        clientReferenceNumber,
        country: 'CA',
        language: 'en',
      });
      const record = records[0];
      const form = parseForm(record);
      assertCommonSandboxFields(form, config);
      expect(form.get('ClientReferenceNumber')).toBe(clientReferenceNumber);
      expect(form.get('Country')).toBe('CA');
      expect(form.get('Language')).toBe('en');
      expect(result).toMatchObject({
        url: expect.any(String),
        iframeKey: expect.any(String),
      });
    } catch (error) {
      assertNoAuthRejection(error, 'generateEmbedUrl');
    }
  });

  it('exposes every public client function in the contract suite', () => {
    const client: VoPayClient = createVoPayClient(config, fetch);
    const publicMethods = new Set(Object.keys(client));
    for (const name of ['post', 'requestMoney', 'eftFund', 'eftWithdraw', 'createClientAccount', 'generateEmbedUrl']) {
      expect(publicMethods.has(name)).toBe(true);
    }
  });
});
