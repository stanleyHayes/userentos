import js from '@eslint/js'
import ts from 'typescript-eslint'
import globals from 'globals'

export default ts.config(
  js.configs.recommended,
  ts.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /*
       * A floating promise here is not a style issue. Node terminates the
       * process on an unhandled rejection, so an unawaited notification write
       * that failed took the whole API down. Deliberate fire-and-forget is
       * still allowed — mark it `void`, which says so at the call site.
       */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist', 'node_modules', 'uploads', 'eslint.config.js', 'vitest.config.ts'],
  },
)
