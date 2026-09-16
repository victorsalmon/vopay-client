# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- API reference (`docs/API.md`) — typed surface for `createVoPayClient`,
  `createVoPayConfigFromEnv`, webhook helpers, and sandbox helpers, covering
  every `src/index.ts` export plus the `sandbox` subpath; reproducible from
  `src/index.ts`, `src/client.ts`, `src/config.ts`, `src/webhook.ts`,
  `src/sandbox.ts`, and `src/util.ts`.
- Offline-safe examples: `examples/eft-fund-withdraw.ts` (EFT fund + withdraw
  input shapes and validation) and `examples/interac-request.ts` (Interac money
  request input shape and validation). Both follow `examples/quickstart.ts`
  (imports from `../src/index.js`, synthetic config, mocked fetch, no
  credentials, live calls left commented out).
- Packaging metadata in `package.json`: `engines` (`node >= 22`, matching
  `.nvmrc`), `sideEffects: false`, `./package.json` export, explicit `files`
  entries for `README.md`, `LICENSE`, and `CHANGELOG.md` alongside `dist`, and
  an `audit` script (`pnpm audit --prod`).
- CI dependency-audit gate (`pnpm audit --prod`) failing on HIGH-or-worse
  production advisories.

### Changed

- Packaging: replaced the `postinstall` build hook with `prepublishOnly`, so a
  plain install no longer requires the TypeScript toolchain while publishing
  still emits `dist/` via `tsc -p tsconfig.build.json`.
- No runtime source, test, or credential changes in this release.
- Added lint/format gates wired into CI: ESLint (flat config, `@eslint/js` +
  typescript-eslint recommended, `pnpm lint`) and Prettier (`pnpm
  format:check`). The `typescript` devDependency now aliases
  `@typescript/typescript6` so typescript-eslint keeps a programmatic API
  while `tsc` stays TypeScript 7 via the `@typescript/native` alias.

### Removed

- Retired `docs/plan-evidence.md`: stale orphan (referenced absent
  `docs/FEATURES.md` and `docs/PUBLIC_PACKAGE.md`, and pre-1.0 test counts)
  with no inbound links; its validation record lives in git history.

### Fixed

- Pending audit-plan fixes (by reference, unreleased): sandbox helper
  correctness and transport hardening.

## [1.0.0] - 2025-01-15

### Added

- EFT fund support (`eft/fund`) — collect funds from a Canadian bank account.
- EFT withdraw support (`eft/withdraw`) — send funds to bank details or a tokenized account.
- Interac money request support (`interac/money-request`) — request money via email.
- Client account creation (`account/client-accounts/individual`) — virtual ledger for platforms and subscriptions.
- iFrame embed URL generation (`iq11/generate-embed-url`) — bank-connect flow returning a Token.
- Webhook signature verification (`verifyVoPayWebhook`) — timing-safe SHA1 validation.
- Environment-based configuration helper, input validation, idempotency, and sandbox helpers.
- Vitest unit/property tests and Stryker mutation testing setup.
