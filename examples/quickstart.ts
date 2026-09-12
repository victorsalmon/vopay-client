/**
 * Quickstart for `@clocklobster/vopay-client`.
 *
 * Runs offline: config handling plus webhook signature verification with
 * synthetic values. Live calls (`eftFund`, `eftWithdraw`, `requestMoney`, ...)
 * need sandbox credentials and an allowlisted egress IP — see the README
 * "Quick start" and "Sandbox testing".
 *
 * Run with any TypeScript runner, e.g. `npx tsx examples/quickstart.ts`.
 */
import {
  createVoPayClient,
  createVoPayConfigFromEnv,
  verifyVoPayWebhook,
  voPaySha1,
} from '../src/index.js';

// 1. Config from the environment (null when VOPAY_API_KEY is unset → disabled).
const disabled = createVoPayConfigFromEnv({ ...process.env, VOPAY_API_KEY: '' });
console.log('disabled when key is absent:', disabled === null); // true

// 2. Client construction with placeholder sandbox credentials (never real ones).
const vopay = createVoPayClient({
  baseUrl: 'https://earthnode-dev.vopay.com',
  accountId: 'sandbox-account-id',
  apiKey: 'sandbox-api-key',
  sharedSecret: 'sandbox-shared-secret',
});
console.log('client created:', typeof vopay.eftFund === 'function'); // true

// 3. Webhook verification: VoPay sends ValidationKey = SHA1(sharedSecret + id).
const recordId = 'example-transaction-id';
const validationKey = voPaySha1(`sandbox-shared-secret${recordId}`);
console.log(
  'valid webhook:',
  verifyVoPayWebhook(recordId, validationKey, 'sandbox-shared-secret'),
); // true
console.log('wrong secret:', verifyVoPayWebhook(recordId, validationKey, 'wrong-secret')); // false

// Live calls (require network + sandbox credentials):
// const fund = await vopay.eftFund({
//   amountCents: 5000,
//   currency: 'CAD',
//   clientReferenceNumber: 'order-1234',
//   idempotencyKey: 'idem-order-1234-1',
//   firstName: 'Jane',
//   lastName: 'Doe',
//   accountNumber: '12345678',
//   financialInstitutionNumber: '001',
//   branchTransitNumber: '12345',
// });
