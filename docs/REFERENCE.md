# VoPay API — Reference (saved guide)

> Saved from `https://docs.vopay.com/docs/getting-started` and
> `https://docs.vopay.com/docs/api-overview` on 2026-08-13. **Code wins** — if this
> guide and the live VoPay docs disagree, the live docs win; re-fetch before relying on
> endpoint specifics. Re-fetch: `WebFetch`/`webReader` the URLs above.

VoPay is a Canadian payment-infrastructure API (EFT / bank-to-bank, card, etc.) used by
software platforms to move money without building the rails themselves. Adopted on
**your platform** and **your platform** (operator decision 2026-08-13) as the
payment processor replacing Stripe.

---

## 1. Get started

1. **Get Sandbox keys** — sandbox environment for building/testing before production.
2. **API Overview** — auth model + conventions (below).
3. **Integration Recipes** — pre-built workflows to speed up the build.
4. **Glossary / FAQ** — payment lingo + common questions.

### Most common workflows (entry-point endpoints)
| Workflow | Endpoint | Use |
|---|---|---|
| Send funds (EFT, Canada) | `eft/withdraw` | Pay out using customer bank details or a Token |
| Collect funds (EFT, Canada) | `eft/fund` | Pull funds from a Canadian bank account (Token or banking details) |
| Segregate / hold funds | `account/client-accounts/individual` | Virtual ledger entity — for platforms & subscription services |
| Embedded bank-connect iFrame | `iq11/generate-embed-url` | Generate a URL that lets a user connect their bank account and returns a Token to you |

---

## 2. API conventions (api-overview)

- All API methods accept **HTTP POST form-encoded** parameters and return **JSON**.
- **Only whitelisted IP addresses** are accepted — register the caller's IP in the account portal.
- Auth = **API key + shared secret**, supplied via a **signature** on every request (see §3).
- If a key/secret is lost or compromised, it can be **regenerated from the account portal**.
- All transaction endpoints support **idempotency** (see §4).

---

## 3. Authentication — the request signature

Every request must include the **API key** and a **Signature** parameter. The signature is a
**SHA1 hash** of `APIkey + SharedSecret + Date` where Date is the current date in `YYYY-MM-DD`.

> Example credentials from the docs (NOT real — illustrative):
> - API Key: `3da541559918a808c2402bba5012f6c60b27661c`
> - Shared Secret: `OTEyZWM4MDNiMmNlNDk=`

### Signature generation

**Node.js / TypeScript:**
```js
const crypto = require('crypto');
const key = '3da541559918a808c2402bba5012f6c60b27661c';
const secret = 'OTEyZWM4MDNiMmNlNDk=';
const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
const signature = crypto.createHash('sha1').update(key + secret + date).digest('hex');
```

> ⚠️ **Date/timezone:** the docs example uses "current date" without pinning a timezone.
> Safest is **UTC** (`toISOString()`), but verify against the server on first integration —
> a date mismatch is the #1 signature failure. Pin the timezone deliberately and test it.

**PHP:**
```php
$key = "3da541559918a808c2402bba5012f6c60b27661c";
$secret = "OTEyZWM4MDNiMmNlNDk=";
$date = date('Y-m-d');
$signature = sha1($key . $secret . $date);
```

**C# (.NET):**
```csharp
string key = "3da541559918a808c2402bba5012f6c60b27661c";
string secret = "OTEyZWM4MDNiMmNlNDk=";
string date = DateTime.UtcNow.ToString("yyyy-MM-dd");
var sig = string.Concat(key, secret, date);
using var sha1 = SHA1.Create();
var hash = sha1.ComputeHash(Encoding.UTF8.GetBytes(sig));
var signature = string.Concat(hash.Select(b => b.ToString("x2")));
```

---

## 4. Idempotency

All transaction endpoints support idempotency for safe retries.

- Pass an **`IdempotencyKey`** in the POST body.
- VoPay stores the key on the transaction record; a second request with the same key is
  **rejected with an error** (asking the caller to retry with a different key).
- Use case: a network error mid-`eft/fund` — retry with the same key to guarantee no double-charge.

> Note the model: it's **reject-on-duplicate**, not "return the original result." The caller
> must generate a new key to retry, and reconcile the original separately if it actually succeeded.

---

## 5. Input validations (enforced on every API)

| Field | Rule |
|---|---|
| Province | valid 2-letter Canadian provincial/territorial code |
| State | valid 2-letter US state alpha code |
| Country | ISO 3166-1 alpha-2 (2 letters) |
| Financial Institution Number | 3-digit integer (the 3-digit bank number) |
| Branch Transit Number | 5-digit integer |
| Bank Account Number | integer, max 160 digits |
| IDs (Shareholder/Tx/Account…) | integer |
| Currency | ISO-4217 (3 letters) |
| Address / City | max 150 chars (allowed-char table below) |
| Postal Code | `A9A 9A9` format |
| Zip Code | 5-digit integer |
| IP Address | `x.x.x.x`, octets 0–255 |
| URL | W3C-valid, max 1024 chars |
| First/Last Name | max 100 chars |
| Business Name | max 255 chars |
| Email | RFC `local-part@domain`, max 145 chars |
| Phone Number | integer, 6–11 digits |
| Amount | positive, non-zero numeric |
| Date | `YYYY-MM-DD` |
| Timestamp | `YYYY-MM-DD HH:MM:SS` |
| Language | `EN` or `FR` (case-insensitive) |
| Question | max 40 chars, no `,` or `&` |
| Answer | max 64 chars, no `,` or `&` |

### Allowed characters by field
| Char | Address | City | Email | Names | Business |
|---|---|---|---|---|---|
| `a-z A-Z` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `0-9` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `'` `-` `.` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `,` | ✓ | ✗ | ✗ | ✓ | ✓ |
| `&` | ✗ | ✗ | ✗ | ✓ | ✓ |
| `! # + ? |` | ✗ | ✗ | ✓ | ✗ | ✗ |
| `_ /` | ✓ | ✗ | ✓ | ✓ | ✗ |
| `$ *` | ✗ | ✗ | ✗ | ✓ (`$` only) | ✗ |
| `( )` | ✓ | ✗ | ✗ | ✓ | ✗ |
| `: ` (space) | ✓ | ✓ | ✗ | ✓ | ✓ |

> Full canonical table is in the live api-overview page — re-fetch if you need every cell.

---

## 6. Integration notes for our products

- **Secrets storage:** store `VOPAY_API_KEY` + `VOPAY_SHARED_SECRET` in **AWS Secrets Manager**
  (per the no-leak rule). Never hardcode; never print. Inject at runtime like the other
  payment-provider secrets. For local sandbox calls, use the safe-read wrapper
  `a secrets-loader helper` to load the values into the test
  process environment without printing them; do not write them to a `.env` file.
- **IP allowlisting:** VoPay rejects non-whitelisted IPs. For AWS-deployed callers, allowlist
  the Lambda/EC2 egress IPs (or NAT Gateway EIP) in the VoPay portal. **This is an operations
  step that blocks first call** — surface it early.
- **Date/timezone for the signature:** pin to UTC and verify on first integration.
- **Replacing Stripe:** the the subscription gate is provider-agnostic at
  runtime (`subscription-gate.ts` reads only the local `subscriptions` table) — so VoPay can
  slot in behind the gate without rewiring the 20 route groups. See
  `(internal handoff doc - removed)`.
- **Webhooks:** confirm VoPay's webhook model + signing (not yet captured here — fetch when
  wiring async status updates).

## 7. Endpoint reference (to expand)
Core flows to document as the build proceeds (fetch each from docs.vopay.com when implementing):
- `eft/fund`, `eft/withdraw` — Canadian EFT collect / send
- `account/client-accounts/individual` — segregated virtual ledger
- `iq11/generate-embed-url` — iFrame bank-connect → Token
- card / Interac / pre-authorized debit variants as needed
- webhook events + signature verification
