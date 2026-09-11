/**
 * Interac money request for `@clocklobster/vopay-client`.
 *
 * Runs offline: synthetic config plus a mocked fetch, no credentials and no
 * network. Live calls need sandbox credentials and an allowlisted egress IP —
 * see the README "Quick start" and "Sandbox testing".
 *
 * Run with any TypeScript runner, e.g. `npx tsx examples/interac-request.ts`.
 */
import { createVoPayClient } from '../src/index.js';

const syntheticFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ Success: true, TransactionID: 'req-synthetic-123' }), {
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

  const result = await vopay.requestMoney({
    amountCents: 5000,
    recipientEmail: 'recipient@example.com',
    recipientName: 'Jane Doe',
    message: 'Synthetic offline request',
    clientReferenceNumber: 'synthetic-request-001',
    idempotencyKey: 'synthetic-request-001-idem',
  });
  console.log('requestMoney success:', result.providerTransactionId);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
