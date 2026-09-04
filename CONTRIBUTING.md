# Contributing

## Setup

```bash
pnpm install
```

Requires Node.js >= 18 (see `.nvmrc`).

## Test

```bash
pnpm test              # vitest — unit tests, mocked fetch, no network calls
pnpm test:property     # fast-check property tests
pnpm run typecheck     # tsc --noEmit
pnpm run build         # emit dist/ + declarations
```

## Pull requests

- Keep PRs small and focused — one concern per PR.
- Add or update tests for every behavior change; all tests must use mocked `fetch`, never the VoPay sandbox.
- Use obviously synthetic account IDs, keys, and bank details in fixtures — never real credentials.
- Match the existing code style (strict TypeScript, ESM with `.js` import suffixes).
- Re-fetch the live VoPay docs before changing endpoint specifics, and update `README.md` and `CHANGELOG.md` when the public API or behavior changes.
