import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Relax rules that conflict with the codebase style
      '@typescript-eslint/no-explicit-any': 'off',       // gradual typing
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
  {
    files: ['src/pwa/sw.template.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', Response: 'readonly', URL: 'readonly', clients: 'readonly' },
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'levels.js',
      'mid_pool.js',
      'techniques.js',
      'firebase-config*.js',
      'sw.js',
      'style.css',
      'scripts/**',
      'bump_version.js',
      'verify_levels.js',
      '*.py',
      'flutter_app/**',
      'output/**',
      'external_data/**',
    ],
  },
);
