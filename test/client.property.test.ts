import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  createVoPayClient,
  voPaySha1,
  type VoPayFundInput,
  type VoPayWithdrawInput,
} from '../src/index.js';

/**
 * Property tests for the VoPay client: amount validation, amount-to-decimal
 * conversion, the generic post() body contract, Success=false handling, the
 * date-bound signature, and the full eft/fund + eft/withdraw validation
 * matrix. The validation properties mirror the documented contract so that
 * any mutation weakening a check is caught.
 */

function baseConfig() {
  return {
    baseUrl: 'https://api.vopay.test',
    accountId: 'account-1',
    apiKey: 'api-key-1',
    sharedSecret: 'shared-1',
  };
}

function successFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify({ TransactionID: 'tx' }), { status: 200 }));
}

const amountArb = fc.oneof(
  fc.integer({ min: -1000, max: 1_000_000 }),
  fc.float({ min: -1000, max: 1_000_000, noNaN: true }),
  fc.constant(0),
  fc.constant(100.5),
  fc.constant(-1),
);

const optStr = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.constant('   '),
  fc.string({ minLength: 1, maxLength: 12 }),
);

function isPresent(v: string | undefined): boolean {
  return (v?.trim().length ?? 0) > 0;
}

function hasConnectorToken(i: {
  token?: string;
  flinksAccountId?: string;
  flinksLoginId?: string;
  plaidPublicToken?: string;
  plaidAccessToken?: string;
  plaidAccountId?: string;
  plaidProcessorToken?: string;
  mxAuthorizationCode?: string;
  inveriteRequestGuid?: string;
}): boolean {
  return (
    isPresent(i.token) ||
    (isPresent(i.flinksAccountId) && isPresent(i.flinksLoginId)) ||
    (isPresent(i.plaidPublicToken) &&
      isPresent(i.plaidAccessToken) &&
      isPresent(i.plaidAccountId)) ||
    isPresent(i.plaidProcessorToken) ||
    isPresent(i.mxAuthorizationCode) ||
    isPresent(i.inveriteRequestGuid)
  );
}

function hasPaymentMethod(i: {
  clientAccountId?: string;
  contactId?: string;
  accountNumber?: string;
  token?: string;
  flinksAccountId?: string;
  flinksLoginId?: string;
  plaidPublicToken?: string;
  plaidAccessToken?: string;
  plaidAccountId?: string;
  plaidProcessorToken?: string;
  mxAuthorizationCode?: string;
  inveriteRequestGuid?: string;
}): boolean {
  return (
    isPresent(i.clientAccountId) ||
    isPresent(i.contactId) ||
    hasConnectorToken(i) ||
    isPresent(i.accountNumber)
  );
}

function modelEftValidation(
  i: VoPayFundInput,
  name: 'eft/fund' | 'eft/withdraw',
): string | null {
  if (!Number.isInteger(i.amountCents) || i.amountCents <= 0) {
    return `VoPay ${name} requires a positive integer amountCents`;
  }
  if (!isPresent(i.currency)) return `VoPay ${name} currency is required`;
  if (!isPresent(i.clientReferenceNumber)) return `VoPay ${name} clientReferenceNumber is required`;
  if (!isPresent(i.idempotencyKey)) return `VoPay ${name} idempotencyKey is required`;
  const anyBank =
    isPresent(i.accountNumber) ||
    isPresent(i.financialInstitutionNumber) ||
    isPresent(i.branchTransitNumber);
  const allBank =
    isPresent(i.accountNumber) &&
    isPresent(i.financialInstitutionNumber) &&
    isPresent(i.branchTransitNumber);
  if (anyBank && !allBank) {
    return `VoPay ${name} requires all bank account fields (accountNumber, financialInstitutionNumber, branchTransitNumber) when any are provided`;
  }
  if (!hasPaymentMethod(i)) {
    return `VoPay ${name} requires a payment method (clientAccountId, contactId, token, or full bank account details)`;
  }
  const hasClientOrToken =
    isPresent(i.clientAccountId) || isPresent(i.contactId) || hasConnectorToken(i);
  const hasName = (isPresent(i.firstName) && isPresent(i.lastName)) || isPresent(i.companyName);
  if (!hasClientOrToken && !hasName) {
    return `VoPay ${name} requires either firstName+lastName or companyName when bank account details are provided`;
  }
  return null;
}

const eftInputArb = fc.record({
  amountCents: amountArb,
  currency: optStr,
  clientReferenceNumber: optStr,
  idempotencyKey: optStr,
  clientAccountId: optStr,
  contactId: optStr,
  token: optStr,
  accountNumber: optStr,
  financialInstitutionNumber: optStr,
  branchTransitNumber: optStr,
  firstName: optStr,
  lastName: optStr,
  companyName: optStr,
  flinksAccountId: optStr,
  flinksLoginId: optStr,
  plaidPublicToken: optStr,
  plaidAccessToken: optStr,
  plaidAccountId: optStr,
  plaidProcessorToken: optStr,
  mxAuthorizationCode: optStr,
  inveriteRequestGuid: optStr,
}) as fc.Arbitrary<VoPayFundInput>;

describe('VoPay amount validation — property tests', () => {
  it('requestMoney rejects non-positive/non-integer amounts and accepts positive integers', async () => {
    await fc.assert(
      fc.asyncProperty(amountArb, async (n) => {
        const client = createVoPayClient(baseConfig(), successFetch() as unknown as typeof fetch);
        const input = {
          amountCents: n,
          recipientEmail: 't@x.com',
          recipientName: 'T',
          message: 'm',
          clientReferenceNumber: 'r',
          idempotencyKey: 'i',
        };
        if (Number.isInteger(n) && n > 0) {
          await expect(client.requestMoney(input)).resolves.toBeDefined();
        } else {
          await expect(client.requestMoney(input)).rejects.toThrow(/positive integer/);
        }
      }),
    );
  });

  it('converts a positive integer amountCents to a 2-decimal Amount field', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10_000_000 }), async (n) => {
        let captured: RequestInit | undefined;
        const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
          captured = init;
          return new Response(JSON.stringify({ TransactionID: 'tx' }), { status: 200 });
        });
        const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
        await client.requestMoney({
          amountCents: n,
          recipientEmail: 't@x.com',
          recipientName: 'T',
          message: 'm',
          clientReferenceNumber: 'r',
          idempotencyKey: 'i',
        });
        const form = new URLSearchParams(String(captured?.body ?? ''));
        expect(form.get('Amount')).toBe((n / 100).toFixed(2));
      }),
    );
  });
});

describe('VoPay generic post — property tests', () => {
  const safeKey = fc.integer({ min: 1, max: 99999 }).map((n) => `k${n}`);

  it('always sets AccountID/Key/Signature; IdempotencyKey only when non-empty; empty/undefined fields omitted', async () => {
    const fieldsArb = fc.dictionary(safeKey, optStr);
    const idemArb = optStr;
    await fc.assert(
      fc.asyncProperty(fieldsArb, idemArb, async (fields, idem) => {
        let captured: RequestInit | undefined;
        const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
          captured = init;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        });
        const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
        await client.post('custom/endpoint', fields, idem);
        const form = new URLSearchParams(String(captured?.body ?? ''));
        expect(form.get('AccountID')).toBe('account-1');
        expect(form.get('Key')).toBe('api-key-1');
        expect(form.get('Signature')).toMatch(/^[a-f0-9]{40}$/);
        // post() sets IdempotencyKey iff it is neither undefined nor '' (raw,
        // no trimming) — whitespace-only keys are forwarded verbatim.
        expect(form.get('IdempotencyKey')).toBe(idem !== undefined && idem !== '' ? idem : null);
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined && v !== '') expect(form.get(k)).toBe(v);
          else expect(form.get(k)).toBeNull();
        }
      }),
    );
  });

  it('throws "rejected: <ErrorMessage>" (trimmed) or "rejected: unknown" when Success=false', async () => {
    const bodyArb = fc.oneof(
      fc.record({ Success: fc.constant(false), ErrorMessage: fc.string({ maxLength: 20 }) }),
      fc.record({ Success: fc.constant(false) }),
    );
    await fc.assert(
      fc.asyncProperty(bodyArb, async (body) => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
        const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
        const msg =
          typeof body.ErrorMessage === 'string' && body.ErrorMessage.trim()
            ? body.ErrorMessage.trim()
            : 'unknown';
        await expect(client.post('custom/endpoint', {})).rejects.toThrow(
          `VoPay custom/endpoint rejected: ${msg}`,
        );
      }),
    );
  });

  it('emits a 40-hex SHA-1 signature bound to apiKey+sharedSecret+todayUtc', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (_unused) => {
        let captured: RequestInit | undefined;
        const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
          captured = init;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        });
        const client = createVoPayClient(baseConfig(), fetchMock as unknown as typeof fetch);
        await client.post('custom/endpoint', {});
        const form = new URLSearchParams(String(captured?.body ?? ''));
        const sig = form.get('Signature')!;
        expect(sig).toMatch(/^[a-f0-9]{40}$/);
        // todayUtc() is date-dependent; recompute the same way the client does.
        const today = new Date().toISOString().slice(0, 10);
        expect(sig).toBe(voPaySha1('api-key-1' + 'shared-1' + today));
      }),
    );
  });
});

describe('VoPay eft/fund validation — property tests', () => {
  it('matches the modelled validation contract for every input', async () => {
    await fc.assert(
      fc.asyncProperty(eftInputArb, async (input) => {
        const expected = modelEftValidation(input, 'eft/fund');
        const client = createVoPayClient(baseConfig(), successFetch() as unknown as typeof fetch);
        if (expected) {
          await expect(client.eftFund(input)).rejects.toThrow(expected);
        } else {
          await expect(client.eftFund(input)).resolves.toBeDefined();
        }
      }),
    );
  });
});

describe('VoPay eft/withdraw validation — property tests', () => {
  it('matches the modelled validation contract for every input', async () => {
    const withdrawInputArb = eftInputArb as fc.Arbitrary<VoPayWithdrawInput>;
    await fc.assert(
      fc.asyncProperty(withdrawInputArb, async (input) => {
        const expected = modelEftValidation(input, 'eft/withdraw');
        const client = createVoPayClient(baseConfig(), successFetch() as unknown as typeof fetch);
        if (expected) {
          await expect(client.eftWithdraw(input)).rejects.toThrow(expected);
        } else {
          await expect(client.eftWithdraw(input)).resolves.toBeDefined();
        }
      }),
    );
  });
});
