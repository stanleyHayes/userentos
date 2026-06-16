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
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist', 'node_modules', 'uploads', 'eslint.config.js', 'vitest.config.ts'],
  },
)
