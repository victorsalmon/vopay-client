# API reference — `@clocklobster/vopay-client`

Covers every export of `src/index.ts` (entry `.`) plus the `sandbox` subpath (`./sandbox` → `src/sandbox.ts`). Endpoint paths below match `src/client.ts` exactly.

## Install / entry points

```ts
import { createVoPayClient } from '@clocklobster/vopay-client';
import { isSandboxEnabled } from '@clocklobster/vopay-client/sandbox';
```

## Config

### `interface VoPayConfig`

```ts
interface VoPayConfig { baseUrl: string; accountId: string; apiKey: string; sharedSecret: string; }
```

- Synthetic credentials plus base URL for one VoPay account.

### `createVoPayConfigFromEnv(env?: NodeJS.ProcessEnv): VoPayConfig | null`

- Builds config from `VOPAY_ACCOUNT_ID` / `VOPAY_API_KEY` / `VOPAY_SHARED_SECRET` (optional `VOPAY_BASE_URL`); returns `null` when `VOPAY_API_KEY` is absent (integration disabled), throws when partially configured.

### `VO_PAY_DEFAULT_BASE_URL: string`

- Default base URL (`https://earthnode-dev.vopay.com`) used when `VOPAY_BASE_URL` is unset.

## Client factory

### `createVoPayClient(config: VoPayConfig, fetchImpl?: typeof fetch): VoPayClient`

- Constructs a narrow VoPay API client; inject a custom `fetch` for tests/examples (offline use).

### `type VoPayClient`

- Return type of `createVoPayClient`; exposes `post`, `requestMoney`, `eftFund`, `eftWithdraw`, `createClientAccount`, `generateEmbedUrl`.

### `post(endpoint: string, requestFields: Record<string, string | undefined>, idempotencyKey?: string): Promise<{ raw: Record<string, unknown> }>`

- Low-level signed `POST /api/v2/{endpoint}` returning the parsed body; prefer the typed methods above.

## EFT

### `eftFund(input: VoPayFundInput): Promise<VoPayFundResult>` — `POST /api/v2/eft/fund`

- Collects funds from a Canadian bank account, token, or connector credential.

### `eftWithdraw(input: VoPayWithdrawInput): Promise<VoPayWithdrawResult>` — `POST /api/v2/eft/withdraw`

- Sends funds to bank details, a tokenized account, or a parent transaction.

### `type VoPayFundInput` / `type VoPayFundResult`

- `VoPayFundInput`: `amountCents, currency, clientReferenceNumber, idempotencyKey` plus optional payee/bank/token/connector fields; `VoPayFundResult`: `{ providerTransactionId, flagged, flaggedReason, raw }`.

### `type VoPayWithdrawInput` / `type VoPayWithdrawResult`

- `VoPayWithdrawInput`: same base as fund plus optional `parentTransactionId`; `VoPayWithdrawResult`: `{ providerTransactionId, flagged, flaggedReason, raw }`.

## Interac

### `requestMoney(input: VoPayMoneyRequestInput): Promise<VoPayMoneyRequestResult>` — `POST /api/v2/interac/money-request`

- Requests money via recipient email (amount submitted in dollars, CAD).

### `type VoPayMoneyRequestInput` / `type VoPayMoneyRequestResult`

- `VoPayMoneyRequestInput`: `amountCents, recipientEmail, recipientName, message, clientReferenceNumber, idempotencyKey`; `VoPayMoneyRequestResult`: `{ providerTransactionId, raw }`.

## Accounts / embed

### `createClientAccount(input: VoPayClientAccountInput): Promise<VoPayClientAccountResult>` — `POST /api/v2/account/client-accounts/individual`

- Creates an individual virtual ledger account; tolerates the provider's `VerifcationLink` typo.

### `type VoPayClientAccountInput` / `type VoPayClientAccountResult`

- `VoPayClientAccountInput`: identity fields plus `sinLastDigits` (0–9999); `VoPayClientAccountResult`: `{ clientAccountId, status, verificationLink, raw }`.

### `generateEmbedUrl(input?: VoPayGenerateEmbedUrlInput): Promise<VoPayGenerateEmbedUrlResult>` — `POST /api/v2/iq11/generate-embed-url`

- Generates a bank-connect iFrame URL and iframe key for onboarding.

### `type VoPayGenerateEmbedUrlInput` / `type VoPayGenerateEmbedUrlResult`

- `VoPayGenerateEmbedUrlInput`: all-optional embed options (redirect, language, selection methods, booleans); `VoPayGenerateEmbedUrlResult`: `{ url, iframeKey, raw }`.

## Webhooks / hashing

### `verifyVoPayWebhook(recordId: string, validationKey: string, sharedSecret: string): boolean`

- Timing-safe check that `ValidationKey === SHA1(sharedSecret + recordId)`.

### `getVoPayWebhookValue(payload: Record<string, unknown>, keys: string[]): string | null`

- Picks the first non-empty payload value across candidate keys (numbers coerced).

### `voPaySha1(value: string): string`

- Re-export of `sha1` from `src/util.ts`; returns the 40-char SHA-1 hex digest used for request signatures.

## Sandbox helpers (`@clocklobster/vopay-client/sandbox`)

### `isSandboxEnabled(env?: NodeJS.ProcessEnv): boolean`

- True when `VOPAY_SANDBOX_INTEGRATION` is set; gates live sandbox calls.

### `requireSandboxCredentials(env?: NodeJS.ProcessEnv): VoPayConfig`

- Loads and fail-fasts on missing `VOPAY_ACCOUNT_ID` / `VOPAY_API_KEY` / `VOPAY_SHARED_SECRET` for sandbox runs.

### `uniqueClientReference(prefix?: string): string`

- Generates a unique `prefix-timestamp-random` reference/idempotency key for sandbox retries.

### `isAuthOrSignatureRejection(response: Response, bodyText: string): boolean`

- Heuristic for sandbox onboarding failures (bad credentials/signature or non-allowlisted IP; 401/403 or auth-pattern match, never 5xx).

### `isProviderErrorStatus(raw: unknown): boolean`

- True when a parsed response carries a provider-declared `error`/`failed`/`failure`/`declined` status.
