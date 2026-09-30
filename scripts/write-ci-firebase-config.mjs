import fs from 'node:fs';

// Build and browser fixtures need the correct realm, but normal CI must not
// create production anonymous accounts. Deployment workflows supply their own
// real configuration; optional live suites can provide FIREBASE_API_KEY.
const config = {
  apiKey: process.env.FIREBASE_API_KEY || 'ci-build-placeholder',
  authDomain: 'sudokuzen-f2aa3.firebaseapp.com',
  projectId: 'sudokuzen-f2aa3',
  storageBucket: 'sudokuzen-f2aa3.firebasestorage.app',
  messagingSenderId: '123072021375',
  appId: '1:123072021375:web:a7cee11c8bd7f6dffd904a',
};
fs.writeFileSync('public/firebase-config.js', `window.SUDOKU_FIREBASE_CONFIG = ${JSON.stringify(config)};\n`);
