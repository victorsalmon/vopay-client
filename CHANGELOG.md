# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
