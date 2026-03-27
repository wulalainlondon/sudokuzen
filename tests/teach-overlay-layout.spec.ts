import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('teach overlay dialog layout', () => {
  it('uses inset+margin centering to avoid transform conflicts', () => {
    const source = fs.readFileSync('src/features/teach/components/TeachOverlay.tsx', 'utf8');

    expect(source).toContain("inset: 0");
    expect(source).toContain("margin: 'auto'");
    expect(source).toContain("maxHeight: 'calc(100dvh - 24px)'");

    // Regression guard: centering should not depend on translate transform here,
    // because framer-motion animates transform and can override it.
    expect(source).not.toContain("transform: 'translate(-50%, -50%)'");
  });
});
