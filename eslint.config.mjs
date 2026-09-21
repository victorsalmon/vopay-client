// ESLint flat config for vopay-client (TypeScript sources and tests).
//
// Run via `pnpm lint`. Base: @eslint/js recommended + typescript-eslint
// recommended, kept green on the tree as it stands.
//
// Tooling note: the repo builds with TypeScript 7 (`tsc` from the
// `@typescript/native` alias); typescript-eslint still needs the TypeScript 6
// programmatic API, so the `typescript` devDependency is aliased to
// `@typescript/typescript6` (the side-by-side setup documented in the
// TypeScript 7.0 release notes and already used by saas-modules).
//
// Deliberate deviation, with a reason:
//   - `@typescript-eslint/no-unused-vars` (configuration, not disabled):
//     underscore-prefixed args/vars/caught errors are intentional
//     (test doubles and API-shaped callbacks): `argsIgnorePattern` etc.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'stryker-report/**',
      'stryker-tmp/**',
      'coverage/**',
      '.worktrees/**',
      '.backup/**',
      '.quarantine/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  }
);
