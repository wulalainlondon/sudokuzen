/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--rz-surface)',
        panel: 'var(--rz-panel)',
        accent: 'var(--rz-accent)',
        text: 'var(--rz-text)',
        muted: 'var(--rz-muted)',
      },
      borderRadius: {
        card: '1.25rem',
      },
      boxShadow: {
        zen: '0 16px 48px rgba(0,0,0,.18)',
      },
      transitionTimingFunction: {
        zen: 'cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
};
