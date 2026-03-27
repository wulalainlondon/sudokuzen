// Bitmask utilities for candidate sets
// Candidates are stored as bits 1-9 in a 16-bit integer.
// e.g., candidates {1,4,7} = (1<<1)|(1<<4)|(1<<7) = 0b10010010 = 146

export function popcount(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

export function digitBit(d: number): number {
  return 1 << d;
}

export function bitsToDigits(mask: number): number[] {
  const digits: number[] = [];
  let m = mask;
  while (m) {
    const b = m & -m;
    digits.push(Math.log2(b) | 0);
    m ^= b;
  }
  return digits;
}

export function digitsToBits(digits: number[]): number {
  let m = 0;
  for (const d of digits) m |= 1 << d;
  return m;
}
