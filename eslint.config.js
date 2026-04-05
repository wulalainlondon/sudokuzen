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
  // ── Circular import guard ──────────────────────────────────────
  // core ↔ duo ↔ levels ↔ core must use dynamic import() only.
  // Static imports between these files will cause bundler failures.
  {
    files: ['src/game/core.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../features/duo', '../features/duo.*'], message: 'Use dynamic import() to avoid circular dependency: core ↔ duo' },
          { group: ['../features/levels', '../features/levels.*'], message: 'Use dynamic import() to avoid circular dependency: core ↔ levels' },
          { group: ['../features/replay', '../features/replay.*'], message: 'Use dynamic import() to avoid circular dependency: core ↔ replay' },
          { group: ['../features/teach-legacy', '../features/teach-legacy.*'], message: 'Use dynamic import() to avoid circular dependency: core ↔ teach-legacy' },
          { group: ['**/app/navigation/navigationOrchestrator*'], message: 'Use emitNavigation() from navigationBus, not the orchestrator.' },
        ],
      }],
    },
  },
  {
    files: ['src/features/duo.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../game/core', '../game/core.*'], message: 'Use dynamic import() to avoid circular dependency: duo ↔ core' },
          { group: ['../features/levels', './levels', './levels.*'], message: 'Use dynamic import() to avoid circular dependency: duo ↔ levels' },
          { group: ['**/app/navigation/navigationOrchestrator*'], message: 'Use emitNavigation() from navigationBus, not the orchestrator.' },
        ],
      }],
    },
  },
  {
    files: ['src/features/levels.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../game/core', '../game/core.*'], message: 'Use dynamic import() to avoid circular dependency: levels ↔ core' },
          // levels ↔ duo circular dependency resolved (2026-04-05):
          // duoLobby.ts now imports scrollMemory.ts instead of levels.ts,
          // so static import of duo modules is safe again.
          { group: ['./replay', './replay.*'], message: 'Use dynamic import() to avoid circular dependency: levels ↔ replay' },
        ],
      }],
    },
  },
  {
    files: ['src/game/board.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['./core', './core.*'], message: 'Use dynamic import() to avoid circular dependency: board ↔ core' },
        ],
      }],
    },
  },
  // ── Navigation bus guard ──────────────────────────────────────
  // Feature modules must use emitNavigation() instead of importing the orchestrator.
  // (core.ts, duo.ts, levels.ts already have their own no-restricted-imports above)
  {
    files: ['src/features/**/*.ts'],
    ignores: ['src/features/duo.ts', 'src/features/levels.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/app/navigation/navigationOrchestrator*'],
          message: 'Features must not import orchestrator. Use emitNavigation() from navigationBus.',
        }],
      }],
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
