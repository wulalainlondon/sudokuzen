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
        manualChunks: {
          // Heavy vendor libs — cached independently, rarely change
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});
