/**
 * EFT fund + withdraw for `@clocklobster/vopay-client`.
 *
 * Runs offline: synthetic config plus a mocked fetch, no credentials and no
 * network. Also demonstrates config-from-env fail-fast and input validation.
 * Live calls need sandbox credentials and an allowlisted egress IP — see the
 * README "Quick start" and "Sandbox testing".
 *
 * Run with any TypeScript runner, e.g. `npx tsx examples/eft-fund-withdraw.ts`.
 */
import { createVoPayClient, createVoPayConfigFromEnv } from '../src/index.js';

// 1. Config from the environment (null when VOPAY_API_KEY is unset → disabled).
const disabled = createVoPayConfigFromEnv({ ...process.env, VOPAY_API_KEY: '' });
console.log('disabled when key is absent:', disabled === null); // true

// 2. Synthetic fetch so the example runs with no credentials and no network.
const syntheticFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ Success: true, TransactionID: 'txn-synthetic-123' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function main(): Promise<void> {
  // 3. Client construction with placeholder sandbox credentials (never real ones).
  const vopay = createVoPayClient(
    {
      baseUrl: 'https://earthnode-dev.vopay.com',
      accountId: 'sandbox-account-id',
      apiKey: 'sandbox-api-key',
      sharedSecret: 'sandbox-shared-secret',
    },
    syntheticFetch,
  );
  console.log('client created:', typeof vopay.eftFund === 'function'); // true

  // 4. EFT fund input shape (collect $50.00 CAD from bank details).
  const fundInput = {
    amountCents: 5000,
    currency: 'CAD',
    clientReferenceNumber: 'order-1234',
    idempotencyKey: 'idem-order-1234-1',
    firstName: 'Jane',
    lastName: 'Doe',
    accountNumber: '12345678',
    financialInstitutionNumber: '001',
    branchTransitNumber: '12345',
  } as const;
  console.log('fund amount dollars:', (fundInput.amountCents / 100).toFixed(2)); // "50.00"
  const fund = await vopay.eftFund({ ...fundInput });
  console.log('eftFund success:', fund.providerTransactionId);

  // 5. EFT withdraw input shape (pay out $250.00 CAD to a tokenized account).
  const withdrawInput = {
    amountCents: 25000,
    currency: 'CAD',
    clientReferenceNumber: 'payout-5678',
    idempotencyKey: 'idem-payout-5678-1',
    token: 'token-from-iq11-iframe-flow',
  } as const;
  console.log('withdraw amount dollars:', (withdrawInput.amountCents / 100).toFixed(2)); // "250.00"
  const withdraw = await vopay.eftWithdraw({ ...withdrawInput });
  console.log('eftWithdraw success:', withdraw.providerTransactionId);

  // 6. Fail-fast validation demo: no payment method → throws before any network call.
  try {
    await vopay.eftFund({
      amountCents: 5000,
      currency: 'CAD',
      clientReferenceNumber: 'invalid-no-method',
      idempotencyKey: 'idem-invalid-1',
    });
    console.log('validation enforced:', false);
  } catch (err) {
    console.log('validation enforced:', err instanceof Error); // true
  }

  // Live calls (require network + sandbox credentials):
  // const fund = await vopay.eftFund({ ...fundInput });
  // console.log(fund.providerTransactionId, fund.flagged, fund.flaggedReason);
  // const withdraw = await vopay.eftWithdraw({ ...withdrawInput });
  // console.log(withdraw.providerTransactionId);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
