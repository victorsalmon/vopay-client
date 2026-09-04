# Security policy

## Supported versions

Security fixes are applied to the current `main` branch and the latest published release. Older releases should be upgraded before requesting a backport.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use the repository host's private security-advisory channel or contact the maintainers privately through the project profile. Include reproduction steps, affected versions, impact, and any suggested mitigation. Do not include live credentials or customer data.

You can expect an acknowledgement within five business days. The maintainers will validate the report, coordinate a fix and disclosure timeline, and credit the reporter unless anonymity is requested.

## Scope

Reports are especially useful for:

- webhook `ValidationKey` verification flaws (comparison, hashing, or secret handling);
- API-key or shared-secret leakage in headers, logs, or error messages;
- validation gaps that let malformed amounts, account numbers, or transit numbers reach the provider;
- idempotency-key handling that could cause duplicate charges or payouts.

The project does not accept real secrets in test cases. Use obviously synthetic account IDs, keys, and bank details (see `test/` for the convention) and never commit live `VOPAY_API_KEY` or `VOPAY_SHARED_SECRET` values.
