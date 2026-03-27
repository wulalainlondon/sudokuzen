import fs from 'node:fs';

/**
 * Write TEACH_DATA to techniques.js with proper header + window exposure.
 * All scripts that modify techniques.js should use this instead of
 * writing directly, to ensure the window.TEACH_DATA line is always present.
 */
export function writeTeachData(TD) {
  const header = `/**
 * 數獨技巧教學資料 — 秘笈 1 ~ 40
 * 每個 key 是秘笈序號（1-40），由淺入深
 */
`;
  const footer = `
// Expose to window for React bridge
if (typeof window !== 'undefined') window.TEACH_DATA = TEACH_DATA;
`;
  const output = header + 'const TEACH_DATA = ' + JSON.stringify(TD, null, 2) + ';\n' + footer;
  fs.writeFileSync('techniques.js', output, 'utf8');
  console.log(`Wrote techniques.js (${Math.round(output.length / 1024)} KB)`);
}
