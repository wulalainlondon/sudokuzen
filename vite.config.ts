import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const deployTarget = process.env.DEPLOY_TARGET;
const base = deployTarget === 'github-pages' ? '/sudokuzen/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    exclude: ['e2e/**', '.claude/**', 'node_modules/**'],
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      onwarn(warning, warn) {
        const msg = warning.message || '';
        // Existing app architecture intentionally mixes static + dynamic imports
        // for warm-start paths. Keep build output clean by suppressing this
        // non-actionable chunking notice.
        if (msg.includes('dynamically imported by') && msg.includes('will not move module into another chunk')) {
          return;
        }
        // index.html includes legacy non-module scripts on purpose.
        if (msg.includes('can\'t be bundled without type="module" attribute')) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          // Keep stable libraries and the largest feature domains independently
          // cacheable. These boundaries only affect delivery; runtime behavior
          // and the chapter rollout remain unchanged.
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('/src/i18n/locale/')) return 'locale-data';
          if (id.includes('/src/solver/')) return 'solver';
          if (
            id.includes('/src/features/skills/') ||
            id.endsWith('/src/features/chainMapPanel.ts') ||
            id.endsWith('/src/features/chainTracePanel.ts') ||
            id.endsWith('/src/features/strongLinkPanel.ts')
          ) {
            return 'feature-skills';
          }
          if (id.includes('/src/features/duo/')) return 'feature-duo';
          if (id.includes('/src/features/wild/')) return 'feature-world';
          return undefined;
        },
      },
    },
  },
});
