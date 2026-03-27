import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const deployTarget = process.env.DEPLOY_TARGET;
const base = deployTarget === 'github-pages' ? '/sudokuzen/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy vendor libs — cached independently, rarely change
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-gsap': ['gsap'],
        },
      },
    },
  },
});
