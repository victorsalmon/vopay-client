/**
 * Interac money request for `@clocklobster/vopay-client`.
 *
 * Runs offline: synthetic config plus a mocked fetch, no credentials and no
 * network. Also demonstrates config-from-env fail-fast and input validation.
 * Live calls need sandbox credentials and an allowlisted egress IP —
 * see the README "Quick start" and "Sandbox testing".
 *
 * Run with any TypeScript runner, e.g. `npx tsx examples/interac-request.ts`.
 */
import { createVoPayClient, createVoPayConfigFromEnv } from '../src/index.js';

// 1. Config from the environment (null when VOPAY_API_KEY is unset → disabled).
const disabled = createVoPayConfigFromEnv({ ...process.env, VOPAY_API_KEY: '' });
console.log('disabled when key is absent:', disabled === null); // true

// 2. Synthetic fetch so the example runs with no credentials and no network.
const syntheticFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ Success: true, TransactionID: 'req-synthetic-123' }), {
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
  console.log('client created:', typeof vopay.requestMoney === 'function'); // true

  // 4. Interac money-request input shape ($12.99 CAD via recipient email).
  const moneyRequestInput = {
    amountCents: 1299,
    recipientEmail: 'customer@example.com',
    recipientName: 'Customer Name',
    message: 'Invoice #INV-001',
    clientReferenceNumber: 'inv-001',
    idempotencyKey: 'idem-inv-001-1',
  } as const;
  console.log('request amount dollars:', (moneyRequestInput.amountCents / 100).toFixed(2)); // "12.99"
  const result = await vopay.requestMoney({ ...moneyRequestInput });
  console.log('requestMoney success:', result.providerTransactionId);

  // 5. Fail-fast validation demo: non-positive amount → throws before any network call.
  try {
    await vopay.requestMoney({ ...moneyRequestInput, amountCents: 0 });
    console.log('validation enforced:', false);
  } catch (err) {
    console.log('validation enforced:', err instanceof Error); // true
  }

  // Live call (requires network + sandbox credentials):
  // const result = await vopay.requestMoney({ ...moneyRequestInput });
  // console.log(result.providerTransactionId);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
