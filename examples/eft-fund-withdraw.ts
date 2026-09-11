/**
 * EFT fund + withdraw for `@clocklobster/vopay-client`.
 *
 * Runs offline: synthetic config plus a mocked fetch, no credentials and no
 * network. Live calls need sandbox credentials and an allowlisted egress IP —
 * see the README "Quick start" and "Sandbox testing".
 *
 * Run with any TypeScript runner, e.g. `npx tsx examples/eft-fund-withdraw.ts`.
 */
import { createVoPayClient } from '../src/index.js';

const syntheticFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ Success: true, TransactionID: 'txn-synthetic-123' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function main(): Promise<void> {
  const vopay = createVoPayClient(
    {
      baseUrl: 'https://earthnode-dev.vopay.com',
      accountId: 'sandbox-account-id',
      apiKey: 'sandbox-api-key',
      sharedSecret: 'sandbox-shared-secret',
    },
    syntheticFetch,
  );

  const fund = await vopay.eftFund({
    amountCents: 5000,
    currency: 'CAD',
    clientReferenceNumber: 'synthetic-fund-001',
    idempotencyKey: 'synthetic-fund-001-idem',
    firstName: 'Jane',
    lastName: 'Doe',
    accountNumber: '12345678',
    financialInstitutionNumber: '001',
    branchTransitNumber: '12345',
  });
  console.log('eftFund success:', fund.providerTransactionId);

  const withdraw = await vopay.eftWithdraw({
    amountCents: 2500,
    currency: 'CAD',
    clientReferenceNumber: 'synthetic-withdraw-001',
    idempotencyKey: 'synthetic-withdraw-001-idem',
    firstName: 'Jane',
    lastName: 'Doe',
    accountNumber: '12345678',
    financialInstitutionNumber: '001',
    branchTransitNumber: '12345',
  });
  console.log('eftWithdraw success:', withdraw.providerTransactionId);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
