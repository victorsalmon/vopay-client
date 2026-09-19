# API reference — `@clocklobster/vopay-client` (1.0.0)

Typed surface for the product-neutral VoPay client. Every entry below is
reproducible from the repository: public exports from `src/index.ts`, request
shapes from `src/client.ts`, config from `src/config.ts`, webhook helpers from
`src/webhook.ts`, sandbox helpers from `src/sandbox.ts`, and hashing/date
helpers from `src/util.ts`.

Package facts (verified in `package.json`): name
`@clocklobster/vopay-client`, version `1.0.0`, ESM (`"type": "module"`),
entry `dist/index.js` with types `dist/index.d.ts`, subpath
`./sandbox` → `dist/sandbox.js`. Requires Node.js `>= 22` (`engines`,
`README.md` Requirements). No runtime dependencies.

> Reference implementation: correct against the VoPay sandbox docs as of
> 2025-01-15 (`README.md`), but re-fetch the
> [live VoPay docs](https://docs.vopay.com) before relying on endpoint
> specifics. Never commit secrets; load `VOPAY_*` values from a secrets
> manager at runtime.

## Install

```bash
npm install @clocklobster/vopay-client
# or
pnpm add @clocklobster/vopay-client
```

Build from source: `npm run build` emits `dist/` via
`tsc -p tsconfig.build.json`. Typecheck: `npm run typecheck`
(`tsc --noEmit`). Lint/format gates: `npm run lint` (`eslint .`) and
`npm run format:check` (`prettier --check`). Tests: `npm test` (`vitest run`,
no live calls without `VOPAY_SANDBOX_INTEGRATION=1`).

## Configuration

```typescript
import {
  createVoPayClient,
  createVoPayConfigFromEnv,
  VO_PAY_DEFAULT_BASE_URL,
} from '@clocklobster/vopay-client';
```

`VO_PAY_DEFAULT_BASE_URL` is `'https://earthnode-dev.vopay.com'`
(`src/config.ts`). `createVoPayConfigFromEnv(env = process.env)` returns
`null` when `VOPAY_API_KEY` is absent (integration disabled) and throws
`VoPay is enabled but <NAME> is missing` when the key is set but
`VOPAY_ACCOUNT_ID` or `VOPAY_SHARED_SECRET` is missing. `VOPAY_BASE_URL`
overrides the base URL (trailing slash stripped). `createVoPayClient(config,
fetchImpl = fetch)` accepts an injectable `fetch` for tests and rejects a
non-HTTPS `baseUrl` (loopback `http://` is allowed for local test servers) so
credentials are never posted over cleartext.

```typescript
interface VoPayConfig {
  baseUrl: string;
  accountId: string;
  apiKey: string;
  sharedSecret: string;
}
```

`createVoPayClient` returns a `VoPayClient` exposing `post`, `requestMoney`,
`eftFund`, `eftWithdraw`, `createClientAccount`, and `generateEmbedUrl`.

## Client methods (`src/client.ts`)

All transactional calls POST form-encoded to
`<baseUrl>/api/v2/<endpoint>` with `AccountID` + `Key` + `Signature` where
`Signature = sha1(apiKey + sharedSecret + todayUtc())` (`todayUtc()` =
`new Date().toISOString().slice(0, 10)`, UTC `YYYY-MM-DD`). `undefined`/empty
fields are omitted. Non-2xx throws `VoPay <endpoint> failed with HTTP
<status>`; `Success: false` throws `VoPay <endpoint> rejected:
<ErrorMessage>`; provider `Status`/`Result` of `error`/`failed`/`failure`/
`declined` throws `VoPay <endpoint> rejected`. Amounts are input in integer
cents and sent as two-decimal dollar strings (`(cents / 100).toFixed(2)`).

| Method | Endpoint | Input type | Result type |
|---|---|---|---|
| `post(endpoint, fields, idempotencyKey?)` | any `/api/v2/*` | `Record<string, string \| undefined>` | `{ raw }` |
| `eftFund(input)` | `eft/fund` | `VoPayFundInput` | `VoPayFundResult` |
| `eftWithdraw(input)` | `eft/withdraw` | `VoPayWithdrawInput` | `VoPayWithdrawResult` |
| `requestMoney(input)` | `interac/money-request` | `VoPayMoneyRequestInput` | `VoPayMoneyRequestResult` |
| `createClientAccount(input)` | `account/client-accounts/individual` | `VoPayClientAccountInput` | `VoPayClientAccountResult` |
| `generateEmbedUrl(input = {})` | `iq11/generate-embed-url` | `VoPayGenerateEmbedUrlInput` | `VoPayGenerateEmbedUrlResult` |

### EFT fund / withdraw

`VoPayFundInput` / `VoPayWithdrawInput`: `amountCents` (positive integer),
`currency`, `clientReferenceNumber`, `idempotencyKey` (required non-empty);
payment method required — `clientAccountId`, `contactId`, `token`/connector
token, or full bank details (`accountNumber` + `financialInstitutionNumber` +
`branchTransitNumber`, all three when any is given). Bank-details-only calls
require `firstName`+`lastName` or `companyName`. Connector tokens: `token`,
`flinksAccountId`+`flinksLoginId`, `plaidPublicToken`+`plaidAccessToken`+
`plaidAccountId`, `plaidProcessorToken`, `mxAuthorizationCode`,
`inveriteRequestGuid`. `eftWithdraw` adds optional `parentTransactionId`.
Returns `{ providerTransactionId, flagged, flaggedReason, raw }` where
`providerTransactionId` is `TransactionID` and `flagged` is whether the
`Flagged` response string is non-empty. See `examples/eft-fund-withdraw.ts`.

### Interac money request

`VoPayMoneyRequestInput`: `amountCents` (positive integer),
`recipientEmail`, `recipientName`, `message`, `clientReferenceNumber`,
`idempotencyKey`. Sent as `Amount`, `Currency: 'CAD'`, `EmailAddress`,
`RecipientName`, `MessageForRecipient`, `ClientReferenceNumber`,
`GenerateURL: 'false'`. Returns `{ providerTransactionId, raw }` where the id
is the first present key among `TransactionID`, `TransactionId`,
`RequestID`, `RequestId`, `ID`, `id`. See `examples/interac-request.ts`.

### Client account

`VoPayClientAccountInput`: `clientAccountId`, `firstName`, `lastName`,
`email`, `currency`, `phoneNumber`, `dateOfBirth` (required non-empty) plus
`sinLastDigits` (integer `0`–`9999`). Optional: address fields,
`nationality`, `token`, `label`, `flinksAccountId`/`flinksLoginId`,
`plaidProcessorToken`, `mxProcessorToken`. Returns `{ clientAccountId,
status, verificationLink, raw }`; the link checks both `VerifcationLink`
(provider typo) and `VerificationLink`.

### Embed URL

`VoPayGenerateEmbedUrlInput` — all fields optional: `clientAccountId`,
`redirectUrl`, `redirectMethod` (`innerredirect` | `outerredirect` |
`javascriptmessage`), `companyName`, `language` (`en` | `fr`),
`accountSelectionMethod` (`any` | `online` | `manual`),
`paymentSelectionMethod` (`any` | `bank` | `email` | `credit` | `debitcard` |
`googlepay` | `applepay` | `paypal` | `venmo`), `clientControlled`,
`clientReferenceNumber`, `country` (`CA` | `US`),
`requireDebitAuthorityAgreement`, `verify`, `cardTypeValidation`,
`trigger3DS`, `acceptedCardBrands`, `accountHolderType` (`individual` |
`business`), `darkMode`. Booleans are stringified only when supplied.
Returns `{ url, iframeKey, raw }` from `EmbedURL` / `IframeKey`.

## Webhooks (`src/webhook.ts`)

```typescript
import { verifyVoPayWebhook, getVoPayWebhookValue } from '@clocklobster/vopay-client';

const valid = verifyVoPayWebhook(recordId, validationKey, sharedSecret);
// expected ValidationKey = sha1(sharedSecret + recordId), compared with timingSafeEqual
const txId = getVoPayWebhookValue(payload, ['TransactionID', 'RecordID', 'ID']);
```

`getVoPayWebhookValue` returns the first non-empty string (finite numbers
coerced; whitespace skipped) or `null`. Always verify before trusting a
webhook for money state.

`voPaySha1(value)` (re-export of `sha1` from `src/util.ts`) returns the
40-char SHA-1 hex digest used for request signatures and webhook validation.

## Sandbox helpers (`./sandbox` subpath, `src/sandbox.ts`)

```typescript
import {
  isSandboxEnabled,
  requireSandboxCredentials,
  uniqueClientReference,
  isAuthOrSignatureRejection,
  isProviderErrorStatus,
} from '@clocklobster/vopay-client/sandbox';
```

`isSandboxEnabled()` is true when `VOPAY_SANDBOX_INTEGRATION` is a non-empty,
non-off value (`0`, `false`, `off`, `no` are treated as disabled);
`requireSandboxCredentials()` throws unless integration is enabled and
`VOPAY_ACCOUNT_ID`/`VOPAY_API_KEY`/`VOPAY_SHARED_SECRET` are non-empty;
`uniqueClientReference(prefix = 'vopay-sandbox')` returns
`prefix-<Date.now()>-<6-char hex>` with a CSPRNG-backed suffix; `isAuthOrSignatureRejection(response,
bodyText)` is true on 401/403 or an auth/allowlist/signature/IP pattern (not
on 5xx or business validation errors); `isProviderErrorStatus(raw)` detects
`error`/`failed`/`failure`/`declined`.

## Idempotency

Transaction endpoints take `IdempotencyKey`. VoPay is reject-on-duplicate:
reusing a key is rejected, so use a fresh key per attempt (e.g.
`uniqueClientReference('fund')`) and reconcile the original separately after
a network error.

## Worked examples

- `examples/quickstart.ts` — offline config + webhook verification.
- `examples/eft-fund-withdraw.ts` — EFT fund/withdraw shapes + validation.
- `examples/interac-request.ts` — Interac money-request shape + validation.
