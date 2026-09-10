# Plan Evidence — vopay-client-0-sandbox-reliability-deps-docs

## Sandbox surface

- No `sandbox-helper` module exists in the tree. The sandbox surface is the
  `./sandbox` package export (`src/sandbox.ts`). The vitest suite covers it:
  116 passed, 14 skipped, 0 failed (2026-09-10). No defect found; no
  behavior changed.

## Install-time build

- Removed `"postinstall": "tsc -p tsconfig.build.json"` from `package.json`.
  `npm install` no longer compiles; explicit `npm run build` (and CI) builds
  instead. `dist/` stays untracked per `.gitignore`.

## Advisories

- `npm audit` reports ENOLOCK (no package-lock.json; repo is pnpm-managed via
  `pnpm-lock.yaml`). `corepack pnpm audit --audit-level moderate` executes
  (exit 1 = findings, no tooling error): 5 moderate + 4 high (fast-uri chain
  via dev-only test/mutation tooling). Runtime dependencies: none
  (`dependencies: {}`), so there is no prod advisory surface; findings are
  dev-only.

## Docs

- `README.md`, `docs/FEATURES.md`, `docs/PUBLIC_PACKAGE.md` contain 0
  `current`-as-now claims (grep); dated snapshot docs untouched.
  Counts/claims already aligned; no relabel needed.

## Validation (this walk, branch off main @ 7b71784)

- `npx vitest run`: 116 passed, 14 skipped, 0 failed (exit 0).
- `npx tsc --noEmit`: exit 0.
- `git diff --check`: exit 0, no output.
