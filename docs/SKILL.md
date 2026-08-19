---
name: vopay
description: >
  Integrate the VoPay payment API (Canadian EFT / bank-to-bank, card) into software
  platforms — request signature auth (API key + shared secret + SHA1 of key+secret+UTC date),
  idempotency, input-validation rules, and the core endpoints (eft/fund, eft/withdraw,
  client accounts, iq11 embed-url iFrame). Includes the saved getting-started + api-overview
  guide and the gotchas that block a first call (IP allowlisting, signature timezone). Use when
  integrating VoPay into your platform or your platform (the chosen processor replacing
  Stripe, per the 2026-08-13 decision), debugging a VoPay auth/signature failure, or wiring
  EFT fund/withdraw flows.
triggers:
  - user
  - model
---

# VoPay — payment-integration skill

## Purpose
Reference for integrating VoPay (the payment processor adopted on **your platform**
and **your platform**, replacing Stripe — operator decision 2026-08-13). Full API detail,
the saved getting-started + api-overview guide, and the integration gotchas live in
`REFERENCE.md` (this folder). **Code wins over this doc** — re-fetch the live docs when
endpoint specifics matter.

## When to use
- Building VoPay EFT fund/withdraw, client-account, or iFrame bank-connect flows.
- Debugging a `401` / signature failure (almost always the date timezone or a stale secret).
- Onboarding VoPay behind the provider-agnostic subscription gate in your platform.
- Replacing a Stripe billing surface with VoPay.

## The auth model (the part that bites)
Every request is **HTTP POST form-encoded → JSON**, and carries `APIkey` + `Signature` where:

```
Signature = sha1( APIkey + SharedSecret + Date )    // Date = YYYY-MM-DD
```

- **Pin the date timezone deliberately** (UTC via `toISOString()` is the safe default) and
  verify against the server on first call — a date mismatch is the #1 signature failure.
- **Only whitelisted IPs** may call the API. Register the caller's egress IP (Lambda/NAT EIP)
  in the VoPay portal **before** the first call — this is an ops step that silently blocks you.
- Code samples (Node/PHP/C#) and the full input-validation table are in `REFERENCE.md` §3–5.

## Core endpoints (entry points)
| Flow | Endpoint | Use |
|---|---|---|
| Collect (EFT CA) | `eft/fund` | pull from a Canadian bank account |
| Send (EFT CA) | `eft/withdraw` | pay out to bank details or a Token |
| Segregated ledger | `account/client-accounts/individual` | virtual ledger for platforms/subscriptions |
| Bank-connect iFrame | `iq11/generate-embed-url` | user connects bank → returns a Token |

## Idempotency
All transaction endpoints take an `IdempotencyKey`; a duplicate key is **rejected** (not
"return original"). Retry with a *new* key and reconcile the original separately.

## Secrets & red lines
- Store `VOPAY_API_KEY` + `VOPAY_SHARED_SECRET` in **AWS Secrets Manager**; inject at runtime.
  **Never** hardcode, log, or commit them (the no-leak rule).
- Sandbox keys first; promote to production only after the integration + IP allowlist are verified.
- Webhook signature verification is **not yet captured** here — fetch + add it before wiring
  async status updates (do not trust unsigned webhook payloads for money state).

## Pointers
- Detailed guide + validation tables: `REFERENCE.md` (this folder).
- Why VoPay (the Stripe-replacement decision): `(internal handoff doc - removed)`.
- Live docs: `https://docs.vopay.com/docs/getting-started` + `/docs/api-overview`.
