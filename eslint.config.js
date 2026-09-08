//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // public/sw.js is a plain-JS static asset served as-is (self.* /
    // ServiceWorkerGlobalScope, not part of the app's tsconfig project).
    // scripts/_scratch.ts is a gitignored throwaway verification script.
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'public/sw.js',
      'scripts/_scratch.ts',
    ],
  },
]
