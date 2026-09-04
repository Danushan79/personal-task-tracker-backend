import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Neither config file is part of a TS program; linting them would require
  // a second tsconfig for no real benefit.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'eslint.config.mjs',
      'vitest.config.mts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // `tests/tsconfig.json` covers test files; the projectService finds
        // it via its own directory walk, same as it finds the root config.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    },
  },
);
