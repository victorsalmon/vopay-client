# vopay-client

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-97%20passing-brightgreen.svg)](#testing)

A product-neutral TypeScript client for the [VoPay](https://vopay.com) payment API —
Canadian EFT (bank-to-bank), Interac money requests, client accounts, iFrame bank-connect,
and webhook signature verification.

> **Status: deprecated / unmaintained.** This client was extracted from a private monorepo
> and published for reference. VoPay did not provide an API key for the originating project,
> so the integration was never completed in production. The code is correct against the VoPay
> sandbox docs as of 2026-08-13, but **re-fetch the [live VoPay docs](https://docs.vopay.com)**
> before relying on endpoint specifics. Pull requests are welcome.

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Auth model](#auth-model-the-part-that-bites)
- [API reference](#api-reference)
  - [`createVoPayClient(config, fetchImpl?)`](#createvopayclientconfig-fetchimpl)
  - [`createVoPayConfigFromEnv(env?)`](#createvopayconfigfromenvenv)
  - [EFT fund — `eftFund(input)`](#eft-fund--eftfundinput)
  - [EFT withdraw — `eftWithdraw(input)`](#eft-withdraw--eftwithdrawinput)
  - [Interac money request — `requestMoney(input)`](#interac-money-request--requestmoneyinput)
  - [Client account — `createClientAccount(input)`](#client-account--createclientaccountinput)
  - [Embed URL — `generateEmbedUrl(input?)`](#embed-url--generateembedurlinput)
  - [Webhook verification — `verifyVoPayWebhook(...)`](#webhook-verification--verifyvopaywebhook)
  - [Sandbox helpers](#sandbox-helpers)
- [Error handling](#error-handling)
- [Idempotency](#idempotency)
- [Webhooks](#webhooks)
- [Sandbox testing](#sandbox-testing)
- [Testing](#testing)
- [Development](#development)
- [Project layout](#project-layout)
- [VoPay endpoint reference](#vopay-endpoint-reference)
- [Validation rules](#validation-rules)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

VoPay is a Canadian payment-infrastructure API that lets software platforms move money
via EFT (Electronic Funds Transfer), Interac, and card without building the rails
themselves. This client wraps the core transactional endpoints behind a small, typed,
product-neutral surface so a consuming application can:

- **Collect funds** from a Canadian bank account (`eft/fund`)
- **Send funds** to bank details or a previously-tokenized account (`eft/withdraw`)
- **Request money via Interac** email money transfer (`interac/money-request`)
- **Create client accounts** — VoPay's segregated virtual ledger for platforms and
  subscription services (`account/client-accounts/individual`)
- **Generate iFrame embed URLs** so end users connect their bank and receive a Token
  back to your application (`iq11/generate-embed-url`)
- **Verify webhook signatures** with timing-safe comparison (`verifyVoPayWebhook`)

The client is intentionally narrow: it posts requests, validates responses, and returns
provider identifiers without touching product state. Product-specific orchestration
(charges, tenants, ledgers, retry policy) lives in the consuming application.

---

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
- **Fetch injection** — pass a custom `fetch` for testing or for environments without
  a global `fetch`
- **Provider-error detection** — recognizes `Success: false`, `Status: error|failed|declined`,
  and non-2xx HTTP statuses and throws a typed `Error`
- **Mutation-tested** — 96.52% mutation score via [Stryker](https://stryker-mutator.io/)

---

## Install

```bash
npm install vopay-client
# or
pnpm add vopay-client
# or
yarn add vopay-client
```

### Requirements

- **Node.js >= 18** (uses the global `fetch` API)
- **TypeScript >= 5** (for type consumers; the package ships `.d.ts` files)
- A VoPay account with sandbox or production credentials
- The caller's egress IP **allowlisted** in the VoPay portal (see [Auth model](#auth-model-the-part-that-bites))

---

## Quick start

```typescript
import { createVoPayClient, createVoPayConfigFromEnv } from 'vopay-client';

// 1. Build config from environment variables (returns null if VOPAY_API_KEY is unset)
const config = createVoPayConfigFromEnv();
if (!config) {
  throw new Error('VOPAY_API_KEY is not set — VoPay integration is disabled');
}

// 2. Create the client
const vopay = createVoPayClient(config);

// 3. Collect $50.00 CAD from a Canadian bank account
const fundResult = await vopay.eftFund({
  amountCents: 5000,
  currency: 'CAD',
  clientReferenceNumber: 'order-1234',
  idempotencyKey: 'idem-order-1234-1',
  firstName: 'Jane',
  lastName: 'Doe',
  accountNumber: '12345678',
  financialInstitutionNumber: '001', // 3-digit bank number
  branchTransitNumber: '12345',       // 5-digit transit
});

console.log(fundResult.providerTransactionId); // VoPay TransactionID
console.log(fundResult.flagged);                // true if VoPay flagged the transaction
console.log(fundResult.flaggedReason);          // string reason, or null
```

### Send funds to a tokenized account

```typescript
const withdrawResult = await vopay.eftWithdraw({
  amountCents: 25000,
  currency: 'CAD',
  clientReferenceNumber: 'payout-5678',
  idempotencyKey: 'idem-payout-5678-1',
  token: 'token-from-iq11-iframe-flow',
});

console.log(withdrawResult.providerTransactionId);
```

### Request money via Interac email

```typescript
const requestResult = await vopay.requestMoney({
  amountCents: 1299,
  recipientEmail: 'customer@example.com',
  recipientName: 'Customer Name',
  message: 'Invoice #INV-001',
  clientReferenceNumber: 'inv-001',
  idempotencyKey: 'idem-inv-001-1',
});

console.log(requestResult.providerTransactionId);
```

### Generate an iFrame bank-connect URL

```typescript
const embed = await vopay.generateEmbedUrl({
  clientAccountId: 'client-acct-1',
  redirectUrl: 'https://yourapp.com/bank-connect/callback',
  redirectMethod: 'innerredirect',
  language: 'en',
  country: 'CA',
  paymentSelectionMethod: 'bank',
});

// Render embed.url in an <iframe>; when the user connects their bank,
// VoPay redirects back to redirectUrl with a Token you can use for eft/fund or eft/withdraw.
console.log(embed.url);
console.log(embed.iframeKey);
```

---

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VOPAY_API_KEY` | yes | — | VoPay API key. When absent, `createVoPayConfigFromEnv()` returns `null` (integration disabled). |
| `VOPAY_ACCOUNT_ID` | yes* | — | VoPay account ID. Required when `VOPAY_API_KEY` is set. |
| `VOPAY_SHARED_SECRET` | yes* | — | Shared secret used in the request signature. Required when `VOPAY_API_KEY` is set. |
| `VOPAY_BASE_URL` | no | `https://earthnode-dev.vopay.com` | Override the base URL (e.g. for production). Trailing slash is stripped. |
| `VOPAY_SANDBOX_INTEGRATION` | no | — | Set to `1` to enable live sandbox integration tests (see [Sandbox testing](#sandbox-testing)). |

\* Required only when `VOPAY_API_KEY` is present. If any of these is missing while
`VOPAY_API_KEY` is set, `createVoPayConfigFromEnv()` throws a fail-fast error.

> **Never** hardcode or commit secrets. Load them from a secrets manager (AWS Secrets
> Manager, Vault, Doppler, etc.) at runtime.

### Programmatic config

You can also build the config object directly without environment variables:

```typescript
import { createVoPayClient, VO_PAY_DEFAULT_BASE_URL } from 'vopay-client';

const vopay = createVoPayClient({
  baseUrl: VO_PAY_DEFAULT_BASE_URL, // or 'https://earthnode.vopay.com' for production
  accountId: process.env.VOPAY_ACCOUNT_ID!,
  apiKey: process.env.VOPAY_API_KEY!,
  sharedSecret: process.env.VOPAY_SHARED_SECRET!,
});
```

---

## Auth model (the part that bites)

Every request is **HTTP POST form-encoded → JSON**, and carries `AccountID` + `Key` +
`Signature` where:

```
Signature = sha1( APIkey + SharedSecret + Date )    // Date = YYYY-MM-DD (UTC)
```

The client computes this automatically on every call using `todayUtc()` (UTC via
`toISOString()`).

### The two gotchas that block a first call

1. **Date timezone** — pin to UTC (`toISOString()`) and verify against the server on
   first call. A date mismatch is the **#1 signature failure**. This client uses UTC
   by default, but if you override the date logic, verify it.
2. **IP allowlisting** — only whitelisted IPs may call the API. Register the caller's
   egress IP (Lambda/NAT EIP, EC2, or your office IP) in the VoPay portal **before**
   the first call. This silently blocks you with a `401`/`403` and no useful error body.

See [`docs/SKILL.md`](docs/SKILL.md) and [`docs/REFERENCE.md`](docs/REFERENCE.md) for
the full integration guide, validation tables, and gotchas.

---

## API reference

### `createVoPayClient(config, fetchImpl?)`

Creates a VoPay client. The optional `fetchImpl` parameter lets you inject a custom
`fetch` (useful for testing or for runtimes without a global `fetch`).

```typescript
import { createVoPayClient, type VoPayConfig } from 'vopay-client';

const config: VoPayConfig = {
  baseUrl: 'https://earthnode-dev.vopay.com',
  accountId: '...',
  apiKey: '...',
  sharedSecret: '...',
};

const vopay = createVoPayClient(config);

// With a custom fetch (e.g. for testing)
const vopayWithCustomFetch = createVoPayClient(config, customFetch);
```

**Returns:** an object with `post`, `requestMoney`, `eftFund`, `eftWithdraw`,
`createClientAccount`, and `generateEmbedUrl` methods.

#### `post(endpoint, fields, idempotencyKey?)`

The low-level POST method used by all endpoint helpers. Useful for calling endpoints
not yet wrapped by a typed helper.

```typescript
const { raw } = await vopay.post('custom/endpoint', {
  Foo: 'bar',
  Baz: undefined, // undefined/empty values are omitted from the form body
}, 'idempotency-key-optional');
```

---

### `createVoPayConfigFromEnv(env?)`

Builds a `VoPayConfig` from environment variables. Returns `null` when
`VOPAY_API_KEY` is absent (the integration is disabled). Throws if any required
value is present but incomplete, so a misconfiguration is fail-fast.

```typescript
import { createVoPayConfigFromEnv } from 'vopay-client';

const config = createVoPayConfigFromEnv();      // reads process.env
const config2 = createVoPayConfigFromEnv(myEnv); // reads a custom env object
```

---

### EFT fund — `eftFund(input)`

Collect funds from a Canadian bank account (`eft/fund`).

```typescript
const result = await vopay.eftFund({
  amountCents: 5000,          // positive integer, in cents
  currency: 'CAD',            // ISO-4217
  clientReferenceNumber: 'order-1234',
  idempotencyKey: 'idem-1',
  // Payment method — one of:
  //   clientAccountId, contactId, token, or full bank details (accountNumber +
  //   financialInstitutionNumber + branchTransitNumber)
  // Bank details (all three required if any is provided):
  accountNumber: '12345678',
  financialInstitutionNumber: '001',
  branchTransitNumber: '12345',
  // Name (required when using bank details without a clientAccountId/token):
  firstName: 'Jane',
  lastName: 'Doe',
  // OR companyName: 'Acme Inc.',
  // Optional:
  address1: '123 Main St',
  city: 'Toronto',
  province: 'ON',
  country: 'CA',
  postalCode: 'M5V 3A8',
  transactionLabel: 'Subscription',
  notes: 'Monthly billing',
});
```

**Returns:** `{ providerTransactionId, flagged, flaggedReason, raw }`

**Validation** (throws before the network call):
- `amountCents` must be a positive integer
- `currency`, `clientReferenceNumber`, `idempotencyKey` are required non-empty strings
- If any bank field (`accountNumber`, `financialInstitutionNumber`, `branchTransitNumber`)
  is provided, **all three** must be provided
- A payment method is required (`clientAccountId`, `contactId`, `token`, connector
  token, or full bank details)
- When using bank details without a `clientAccountId`/`token`, either
  `firstName`+`lastName` or `companyName` is required

**Connector tokens** (any one satisfies the payment-method requirement):
`token`, `flinksAccountId`+`flinksLoginId`, `plaidPublicToken`+`plaidAccessToken`+
`plaidAccountId`, `plaidProcessorToken`, `mxAuthorizationCode`, `inveriteRequestGuid`

---

### EFT withdraw — `eftWithdraw(input)`

Send funds to bank details or a Token (`eft/withdraw`). Same input shape and validation
as `eftFund`, plus an optional `parentTransactionId` for linked transactions (e.g.
refunding a fund).

```typescript
const result = await vopay.eftWithdraw({
  amountCents: 25000,
  currency: 'CAD',
  clientReferenceNumber: 'payout-5678',
  idempotencyKey: 'idem-payout-1',
  token: 'token-from-iq11-iframe',
  // OR full bank details as in eftFund
});
```

**Returns:** `{ providerTransactionId, flagged, flaggedReason, raw }`

---

### Interac money request — `requestMoney(input)`

Send an Interac email money request (`interac/money-request`). The recipient receives
an email and completes the transfer via their bank.

```typescript
const result = await vopay.requestMoney({
  amountCents: 1299,           // positive integer, in cents
  recipientEmail: 'customer@example.com',
  recipientName: 'Customer Name',
  message: 'Invoice #INV-001',
  clientReferenceNumber: 'inv-001',
  idempotencyKey: 'idem-inv-001-1',
});
```

**Returns:** `{ providerTransactionId, raw }`

The `providerTransactionId` is read from the first present key among
`TransactionID`, `TransactionId`, `RequestID`, `RequestId`, `ID`, `id`.

---

### Client account — `createClientAccount(input)`

Create a client account in VoPay's segregated virtual ledger
(`account/client-accounts/individual`). Used by platforms and subscription services
to hold funds on behalf of end users.

```typescript
const result = await vopay.createClientAccount({
  clientAccountId: 'client-acct-1',  // your internal ID
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  currency: 'CAD',
  phoneNumber: '4165551234',         // 6-11 digits
  dateOfBirth: '1990-01-15',         // YYYY-MM-DD
  sinLastDigits: 1234,               // 4-digit integer (0-9999)
  // Optional:
  address1: '123 Main St',
  city: 'Toronto',
  province: 'ON',
  country: 'CA',
  postalCode: 'M5V 3A8',
  nationality: 'CA',
  token: 'token-from-iq11-iframe',
  label: 'Primary account',
});
```

**Returns:** `{ clientAccountId, status, verificationLink, raw }`

> Note: VoPay's response uses the key `VerifcationLink` (sic — missing the 'i'). The
> client checks both `VerifcationLink` and `VerificationLink` so you get the value
> either way.

---

### Embed URL — `generateEmbedUrl(input?)`

Generate an iFrame embed URL for bank-connect (`iq11/generate-embed-url`). Render the
returned `url` in an `<iframe>`; when the user connects their bank, VoPay redirects
back to your `redirectUrl` with a Token you can use for `eftFund`/`eftWithdraw`.

```typescript
const result = await vopay.generateEmbedUrl({
  clientAccountId: 'client-acct-1',
  redirectUrl: 'https://yourapp.com/bank-connect/callback',
  redirectMethod: 'innerredirect',  // 'innerredirect' | 'outerredirect' | 'javascriptmessage'
  companyName: 'Your Company',
  language: 'en',                    // 'en' | 'fr'
  accountSelectionMethod: 'any',     // 'any' | 'online' | 'manual'
  paymentSelectionMethod: 'bank',    // 'any'|'bank'|'email'|'credit'|'debitcard'|'googlepay'|'applepay'|'paypal'|'venmo'
  clientReferenceNumber: 'session-1',
  country: 'CA',                     // 'CA' | 'US'
  accountHolderType: 'individual',   // 'individual' | 'business'
  clientControlled: true,
  requireDebitAuthorityAgreement: true,
  cardTypeValidation: true,
  trigger3DS: false,
  darkMode: false,
  verify: 'optional-verify-token',
  acceptedCardBrands: 'visa,mastercard',
});
```

All parameters are optional; call `generateEmbedUrl()` with no arguments for a
default-configured embed URL.

**Returns:** `{ url, iframeKey, raw }`

---

### Webhook verification — `verifyVoPayWebhook(...)`

Verify a VoPay webhook signature using timing-safe comparison. VoPay signs webhook
payloads with `ValidationKey = SHA1(shared secret + provider record id)`.

```typescript
import { verifyVoPayWebhook, getVoPayWebhookValue } from 'vopay-client';

// recordId: the provider's record/transaction id from the webhook payload
// validationKey: the ValidationKey field from the webhook payload
// sharedSecret: your VOPAY_SHARED_SECRET
const valid = verifyVoPayWebhook(recordId, validationKey, sharedSecret);

if (!valid) {
  // reject the webhook — do not trust unsigned payloads for money state
  return { statusCode: 401 };
}

// Extract a value from the payload using a list of possible keys
const txId = getVoPayWebhookValue(payload, ['TransactionID', 'TransactionId', 'ID']);
```

`getVoPayWebhookValue(payload, keys)` returns the first non-empty string value from
the payload using a list of possible keys (numbers are coerced to strings; empty/
whitespace values are skipped).

---

### Sandbox helpers

Import from the `vopay-client/sandbox` subpath:

```typescript
import {
  isSandboxEnabled,
  requireSandboxCredentials,
  uniqueClientReference,
  isAuthOrSignatureRejection,
  isProviderErrorStatus,
} from 'vopay-client/sandbox';
```

| Function | Description |
|---|---|
| `isSandboxEnabled(env?)` | Returns `true` when `VOPAY_SANDBOX_INTEGRATION=1`. |
| `requireSandboxCredentials(env?)` | Loads sandbox creds from env; throws if `VOPAY_SANDBOX_INTEGRATION` is unset or any cred is missing. |
| `uniqueClientReference(prefix?)` | Generates a unique `prefix-<timestamp>-<random>` string for sandbox client reference numbers / idempotency keys. |
| `isAuthOrSignatureRejection(response, bodyText)` | Heuristic for failures indicating incomplete sandbox onboarding (wrong creds, bad signature, IP not allowlisted). Returns `false` for business validation errors. |
| `isProviderErrorStatus(raw)` | Detects a provider-declared `error`/`failed`/`failure`/`declined` status in a parsed JSON response. |

---

## Error handling

The client throws `Error` instances with descriptive messages. There are three failure
modes:

1. **Input validation errors** (thrown before the network call):
   - `"VoPay eft/fund requires a positive integer amountCents"`
   - `"VoPay eft/fund requires all bank account fields (...) when any are provided"`
   - `"VoPay eft/fund requires a payment method (...)"`
   - `"VoPay eft/fund requires either firstName+lastName or companyName when bank account details are provided"`
   - `"VoPay createClientAccount requires a 4-digit sinLastDigits"`
   - `"VoPay <name> is required"` for missing required strings

2. **HTTP errors** (non-2xx responses):
   - `"VoPay <endpoint> failed with HTTP <status>"`

3. **Provider-declared errors** (2xx response with an error status):
   - `"VoPay <endpoint> rejected: <ErrorMessage>"` when `Success: false`
   - `"VoPay <endpoint> rejected"` when `Status`/`Result` is `error`/`failed`/`failure`/`declined`

The raw provider response is always available on the `raw` field of the result object
for successful calls. For failed calls, the raw body is **not** echoed into the error
message to avoid leaking sensitive provider error details into logs.

```typescript
try {
  const result = await vopay.eftFund(input);
} catch (err) {
  if (err instanceof Error) {
    console.error(err.message); // e.g. "VoPay eft/fund failed with HTTP 401"
  }
}
```

---

## Idempotency

All transaction endpoints (`eftFund`, `eftWithdraw`, `requestMoney`) take an
`IdempotencyKey`. VoPay's model is **reject-on-duplicate**, not "return the original
result":

- Pass a unique `IdempotencyKey` in the POST body.
- VoPay stores the key on the transaction record; a second request with the same key
  is **rejected with an error**.
- On a network error mid-call, retry with a **new** key and reconcile the original
  separately (it may have succeeded).

```typescript
// Generate a unique key per attempt
import { uniqueClientReference } from 'vopay-client/sandbox';
const idempotencyKey = uniqueClientReference('fund'); // e.g. "fund-1679876543210-k7f3a"
```

---

## Webhooks

VoPay signs webhook payloads with `ValidationKey = SHA1(shared secret + record id)`.
Always verify the signature before trusting a webhook for money state — unsigned or
unverified payloads must not update transaction status.

```typescript
import { verifyVoPayWebhook, getVoPayWebhookValue } from 'vopay-client';

export async function handleVoPayWebhook(event: {
  body: string;
  headers: Record<string, string>;
}): Promise<{ statusCode: number }> {
  const payload = JSON.parse(event.body) as Record<string, unknown>;
  const recordId = getVoPayWebhookValue(payload, ['TransactionID', 'RecordID', 'ID']) ?? '';
  const validationKey = getVoPayWebhookValue(payload, ['ValidationKey']) ?? '';

  const valid = verifyVoPayWebhook(recordId, validationKey, process.env.VOPAY_SHARED_SECRET!);
  if (!valid) {
    return { statusCode: 401 };
  }

  // Process the verified webhook...
  return { statusCode: 200 };
}
```

The verification uses `crypto.timingSafeEqual` to prevent timing attacks.

---

## Sandbox testing

Live sandbox integration tests are gated behind `VOPAY_SANDBOX_INTEGRATION=1` so a
normal `npm test` never reaches the live VoPay sandbox. To run them:

```bash
# 1. Get sandbox credentials from the VoPay portal
# 2. Allowlist your egress IP in the VoPay portal
# 3. Set env vars and enable integration tests
export VOPAY_SANDBOX_INTEGRATION=1
export VOPAY_ACCOUNT_ID=your-sandbox-account-id
export VOPAY_API_KEY=your-sandbox-api-key
export VOPAY_SHARED_SECRET=your-sandbox-shared-secret

# 4. Run the full suite (now includes live sandbox calls)
npm test
```

Without `VOPAY_SANDBOX_INTEGRATION=1`, the sandbox contract tests are **skipped**
(not failed), so CI runs without credentials stay green.

---

## Testing

The suite uses [Vitest](https://vitest.dev/) and covers three layers:

| Test file | Layer | Tests |
|---|---|---|
| `test/vopay-client.test.ts` | Unit — config, webhook verification, sha1 | 25 |
| `test/vopay-endpoints.test.ts` | Unit — endpoint field building, validation, error handling | 64 |
| `test/vopay-sandbox.test.ts` | Unit — sandbox helpers | 15 (7 skipped without creds) |
| `test/vopay-sandbox-contract.test.ts` | Integration — live sandbox API contract | 7 (all skipped without creds) |

**Total: 111 tests (97 passing, 14 skipped without sandbox credentials).**

Mutation testing via [Stryker](https://stryker-mutator.io/) achieves a **96.52% mutation
score**, verifying the tests catch real bugs (not just line coverage).

```bash
npm test                # vitest run (unit + endpoint tests, no live calls)
npm run test:mutation   # stryker mutation testing
```

---

## Development

```bash
# Install dependencies
pnpm install

# Typecheck
pnpm run typecheck    # tsc --noEmit

# Run unit tests (no live calls)
pnpm test             # vitest run

# Run mutation tests
pnpm run test:mutation # stryker run

# Build (emit to dist/)
pnpm run build        # tsc -p tsconfig.build.json
```

### Requirements

- Node.js >= 18
- pnpm (or npm/yarn — the package has no runtime dependencies)
- TypeScript >= 5

---

## Project layout

```text
vopay-client/
├── src/
│   ├── client.ts     # createVoPayClient — EFT, Interac, client accounts, embed URL
│   ├── config.ts     # createVoPayConfigFromEnv, VO_PAY_DEFAULT_BASE_URL
│   ├── webhook.ts    # verifyVoPayWebhook, getVoPayWebhookValue
│   ├── sandbox.ts    # sandbox test helpers (gated integration tests)
│   ├── util.ts       # sha1, todayUtc, firstString, isProviderErrorStatus
│   └── index.ts      # public exports
├── test/
│   ├── vopay-client.test.ts          # config + webhook + util unit tests
│   ├── vopay-endpoints.test.ts       # endpoint field building + validation tests
│   ├── vopay-sandbox.test.ts         # sandbox helper unit tests
│   └── vopay-sandbox-contract.test.ts # live sandbox API contract tests (gated)
├── docs/
│   ├── SKILL.md       # integration skill — when to use, auth model, gotchas
│   └── REFERENCE.md   # saved VoPay API reference — endpoints, validation tables, code samples
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── stryker.config.json
├── LICENSE
└── README.md
```

---

## VoPay endpoint reference

| Flow | Endpoint | Method | Use |
|---|---|---|---|
| Collect (EFT CA) | `eft/fund` | `eftFund()` | Pull funds from a Canadian bank account |
| Send (EFT CA) | `eft/withdraw` | `eftWithdraw()` | Pay out to bank details or a Token |
| Interac money request | `interac/money-request` | `requestMoney()` | Email money request via Interac |
| Segregated ledger | `account/client-accounts/individual` | `createClientAccount()` | Virtual ledger for platforms/subscriptions |
| Bank-connect iFrame | `iq11/generate-embed-url` | `generateEmbedUrl()` | User connects bank → returns a Token |
| Webhook verification | (client-side) | `verifyVoPayWebhook()` | Validate `ValidationKey` signature |

All endpoints are prefixed with `/api/v2/` on the configured base URL.

**Not yet implemented** (use the low-level `post()` method or open a PR):
- Card / Interac online / pre-authorized debit variants
- Webhook event retrieval (the client verifies signatures but does not fetch events)
- Account verification status checks
- Contact management

---

## Validation rules

VoPay enforces input validation on every API. The client mirrors the most important
rules locally (positive integer amounts, required fields, bank-field completeness) to
fail fast before the network call. The full VoPay validation table:

| Field | Rule |
|---|---|
| Province | valid 2-letter Canadian provincial/territorial code |
| State | valid 2-letter US state alpha code |
| Country | ISO 3166-1 alpha-2 (2 letters) |
| Financial Institution Number | 3-digit integer (the bank number) |
| Branch Transit Number | 5-digit integer |
| Bank Account Number | integer, max 160 digits |
| Currency | ISO-4217 (3 letters) |
| Postal Code | `A9A 9A9` format |
| Email | RFC `local-part@domain`, max 145 chars |
| Phone Number | integer, 6–11 digits |
| Amount | positive, non-zero numeric |
| Date | `YYYY-MM-DD` |
| Language | `EN` or `FR` (case-insensitive) |

See [`docs/REFERENCE.md`](docs/REFERENCE.md) §5 for the complete allowed-character table
by field.

---

## Security

- **Never** hardcode, log, commit, or print `VOPAY_API_KEY` or `VOPAY_SHARED_SECRET`.
  Load them from a secrets manager at runtime.
- **Always** verify webhook signatures with `verifyVoPayWebhook()` before trusting a
  webhook payload for money state. The verification uses `timingSafeEqual` to prevent
  timing attacks.
- **Do not** write secret values to a local `.env` file; if you create one for a one-off
  test, delete it immediately after.
- The client does **not** echo provider error bodies into thrown error messages, to
  avoid leaking sensitive provider details into application logs.
- Sandbox keys first; promote to production only after the integration and IP allowlist
  are verified.

If you discover a security issue, please open an issue or contact the maintainer
privately rather than filing a public issue.

---

## Contributing

Pull requests are welcome. This client was published for reference after the
originating project's VoPay integration was shelved, so the code is correct against
the sandbox docs as of 2026-08-13 but has not been exercised against the production
API. Before relying on endpoint specifics, **re-fetch the [live VoPay docs](https://docs.vopay.com)**.

### Guidelines

1. Add or update tests for any change (Vitest unit tests; Stryker mutation tests for
   logic changes).
2. Ensure `pnpm run typecheck` and `pnpm test` pass.
3. Do not commit secrets, `.env` files, or `dist/` output.
4. Follow the existing code style (strict TypeScript, no `any`, functional client
   factory pattern).
5. Update `docs/REFERENCE.md` if you add or change endpoint coverage.

---

## License

[MIT](LICENSE) © Victor Salmon
