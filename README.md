# vopay-client

A product-neutral TypeScript client for the [VoPay](https://vopay.com) payment API —
Canadian EFT (bank-to-bank), Interac money requests, client accounts, iFrame bank-connect,
and webhook signature verification.

> **Status: deprecated / unmaintained.** This client was extracted from a private monorepo
> and published for reference. VoPay did not provide an API key for the originating project,
> so the integration was never completed in production. The code is correct against the VoPay
> sandbox docs as of 2026-08-13, but **re-fetch the [live VoPay docs](https://docs.vopay.com)**
> before relying on endpoint specifics. Pull requests are welcome.

## Features

- **EFT fund** (`eft/fund`) — collect from a Canadian bank account
- **EFT withdraw** (`eft/withdraw`) — pay out to bank details or a Token
- **Interac money requests** (`interac/money-request`)
- **Client accounts** (`account/client-accounts/individual`) — segregated virtual ledger
- **iFrame embed URL** (`iq11/generate-embed-url`) — bank-connect flow returning a Token
- **Webhook verification** — timing-safe `ValidationKey` = SHA1(shared secret + record id)
- **Input validation** — enforces required fields, positive integer amounts, bank-field
  completeness, and payment-method presence before the network call
- **Idempotency** — `IdempotencyKey` wired through all transaction endpoints
- **Config from env** — `createVoPayConfigFromEnv()` returns `null` when disabled (fail-fast)

## Install

```bash
npm install vopay-client
# or
pnpm add vopay-client
```

### Requirements

- Node.js >= 18 (uses global `fetch`)
- TypeScript >= 5 (for type consumers)

## Quick start

```typescript
import { createVoPayClient, createVoPayConfigFromEnv } from 'vopay-client';

const config = createVoPayConfigFromEnv();
if (!config) {
  throw new Error('VOPAY_API_KEY is not set — VoPay integration is disabled');
}

const vopay = createVoPayClient(config);

// Collect $50.00 CAD from a bank account
const result = await vopay.eftFund({
  amountCents: 5000,
  currency: 'CAD',
  clientReferenceNumber: 'order-1234',
  idempotencyKey: 'idem-order-1234-1',
  firstName: 'Jane',
  lastName: 'Doe',
  accountNumber: '12345678',
  financialInstitutionNumber: '001',
  branchTransitNumber: '12345',
});
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `VOPAY_API_KEY` | yes | VoPay API key (enables the integration when present) |
| `VOPAY_ACCOUNT_ID` | yes | VoPay account ID |
| `VOPAY_SHARED_SECRET` | yes | Shared secret used in the request signature |
| `VOPAY_BASE_URL` | no | Override the default sandbox base URL |

> **Never** hardcode or commit secrets. Load them from a secrets manager at runtime.

## Auth model (the part that bites)

Every request is HTTP POST form-encoded → JSON, and carries `APIkey` + `Signature`:

```
Signature = sha1( APIkey + SharedSecret + Date )    // Date = YYYY-MM-DD (UTC)
```

- **Pin the date timezone to UTC** (`toISOString()`) and verify on first call — a date
  mismatch is the #1 signature failure.
- **Only whitelisted IPs** may call the API. Register the caller's egress IP in the VoPay
  portal **before** the first call — this silently blocks you.

See [`docs/SKILL.md`](docs/SKILL.md) and [`docs/REFERENCE.md`](docs/REFERENCE.md) for the
full integration guide, validation tables, and gotchas.

## Webhook verification

```typescript
import { verifyVoPayWebhook } from 'vopay-client';

const valid = verifyVoPayWebhook(recordId, validationKey, sharedSecret);
if (!valid) {
  // reject the webhook — do not trust unsigned payloads for money state
}
```

## Sandbox testing

Sandbox integration tests are gated behind `VOPAY_SANDBOX_INTEGRATION=1` so a normal
`npm test` never reaches the live VoPay sandbox:

```typescript
import { requireSandboxCredentials, isSandboxEnabled } from 'vopay-client/sandbox';

if (isSandboxEnabled()) {
  const config = requireSandboxCredentials(); // throws if any cred is missing
  const vopay = createVoPayClient(config);
  // ...make real sandbox calls...
}
```

## Development

```bash
pnpm install          # install dev dependencies
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest run (unit + endpoint tests, no live calls)
pnpm run test:mutation # stryker mutation testing
pnpm run build        # emit to dist/
```

## Project layout

```text
vopay-client/
├── src/
│   ├── client.ts     # createVoPayClient — EFT, Interac, client accounts, embed URL
│   ├── config.ts     # createVoPayConfigFromEnv
│   ├── webhook.ts    # verifyVoPayWebhook, getVoPayWebhookValue
│   ├── sandbox.ts    # sandbox test helpers (gated integration tests)
│   ├── util.ts       # sha1, todayUtc, firstString, isProviderErrorStatus
│   └── index.ts      # public exports
├── test/             # vitest unit + endpoint + sandbox contract tests
├── docs/             # integration skill + saved VoPay API reference
└── stryker.config.json
```

## License

[MIT](LICENSE) © Victor Salmon
