import type { RecoveryCell } from './recoveryBoard';
import offlineTemplates from './outfitDigitTemplates.json';

export interface GridCrop {
  x: number;
  y: number;
  size: number;
}
export interface ScreenshotResult {
  cells: RecoveryCell[];
  uncertain: number[];
}

function canvas(width: number, height: number): CanvasRenderingContext2D {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  return ctx;
}

export async function readScreenshot(file: File): Promise<HTMLCanvasElement> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    throw new Error('file');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40_000_000)
      throw new Error('file');
    const scale = Math.min(1, 1080 / img.naturalWidth, 2400 / img.naturalHeight);
    const ctx = canvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
    return ctx.canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function peaks(scores: number[], threshold: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < threshold) continue;
    const start = i;
    while (i + 1 < scores.length && scores[i + 1] >= threshold) i++;
    result.push((start + i) / 2);
  }
  return result;
}

/** Detect ten equally spaced grid edges, rather than assuming a device's screenshot layout. */
export function detectGrid(image: HTMLCanvasElement): GridCrop | null {
  const ctx = image.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width: w, height: h } = image;
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const lum = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    return (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3;
  };
  const rows = Array.from({ length: h }, () => 0);
  for (let y = 3; y < h - 3; y++) {
    let hits = 0;
    let total = 0;
    for (let x = Math.floor(w * 0.08); x < w * 0.92; x += 3) {
      if (Math.abs(lum(x, y - 3) - lum(x, y + 3)) > 22) hits++;
      total++;
    }
    rows[y] = hits / total;
  }
  const lines = peaks(rows, 0.48);
  let best: GridCrop | null = null;
  let bestScore = 0;
  for (const top of lines) {
    for (const bottom of lines) {
      const size = bottom - top;
      if (size < w * 0.5 || size > w || bottom >= h) continue;
      let score = 0;
      for (let n = 0; n <= 9; n++) {
        const expected = top + (size * n) / 9;
        if (lines.some((line) => Math.abs(line - expected) < Math.max(5, size * 0.008))) score++;
      }
      if (score < 9 || score <= bestScore) continue;
      const cols = Array.from({ length: w }, () => 0);
      for (let x = 3; x < w - 3; x++) {
        let hits = 0;
        let total = 0;
        for (let y = Math.ceil(top + size * 0.05); y < bottom - size * 0.05; y += 3) {
          if (Math.abs(lum(x - 3, y) - lum(x + 3, y)) > 22) hits++;
          total++;
        }
        cols[x] = hits / total;
      }
      const verticals = peaks(cols, 0.48);
      for (const left of verticals) {
        if (left + size > w + 5) continue;
        const matches = Array.from({ length: 10 }, (_, n) => left + (size * n) / 9).filter((p) =>
          verticals.some((line) => Math.abs(line - p) < Math.max(5, size * 0.008)),
        ).length;
        if (matches < 9) continue;
        bestScore = score;
        best = { x: Math.max(0, left), y: top, size: Math.min(size, w - left, h - top) };
        break;
      }
    }
  }
  return best;
}

interface Glyph {
  pixels: number[];
  ratio: number;
  colored: boolean;
}

function extractGlyph(image: ImageData, minHeight: number): Glyph | null {
  const { data, width: w, height: h } = image;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  const bg = [0, 1, 2].map((c) => corners.reduce((sum, p) => sum + data[p + c], 0) / 4);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    mask[i] = Math.max(...bg.map((b, c) => Math.abs(data[p + c] - b))) > 65 ? 1 : 0;
  }
  // Keep a central, full-size connected component; small pencil marks are not filled digits.
  const visited = new Uint8Array(mask.length);
  let best: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    const group = [i];
    visited[i] = 1;
    for (let at = 0; at < group.length; at++) {
      const p = group[at];
      const x = p % w;
      for (const next of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (next >= 0 && next < mask.length && mask[next] && !visited[next]) {
          visited[next] = 1;
          group.push(next);
        }
      }
    }
    if (group.length > best.length) best = group;
  }
  if (!best.length) return null;
  const xs = best.map((p) => p % w);
  const ys = best.map((p) => Math.floor(p / w));
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  if (bottom - top + 1 < minHeight) return null;
  const selected = new Set(best);
  const normalized = Array.from({ length: 24 * 32 }, (_, i) => {
    const x = Math.min(right, left + Math.floor((((i % 24) + 0.5) * (right - left + 1)) / 24));
    const y = Math.min(bottom, top + Math.floor(((Math.floor(i / 24) + 0.5) * (bottom - top + 1)) / 32));
    return selected.has(y * w + x) ? 1 : 0;
  });
  const colored =
    best.filter((i) => {
      const p = i * 4;
      return Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]) > 55;
    }).length >
    best.length * 0.5;
  return { pixels: normalized, ratio: (right - left + 1) / (bottom - top + 1), colored };
}

/** Also used by the offline template generator. */
export function createDigitTemplates(families = ['Outfit', 'Inter', 'Arial', 'sans-serif']) {
  const templates: Array<{ digit: number; glyph: Glyph }> = [];
  const template = canvas(100, 120);
  for (const family of families) {
    for (const weight of [300, 400, 600, 700]) {
      for (let digit = 1; digit <= 9; digit++) {
        template.fillStyle = '#fff';
        template.fillRect(0, 0, 100, 120);
        template.fillStyle = '#000';
        template.font = `${weight} 76px ${family}`;
        template.textAlign = 'center';
        template.textBaseline = 'middle';
        template.fillText(String(digit), 50, 60);
        const glyph = extractGlyph(template.getImageData(0, 0, 100, 120), 20);
        if (glyph) templates.push({ digit, glyph });
      }
    }
  }
  return templates;
}

/** Local template OCR for this app's screenshot fonts; every result stays editable for verification. */
export async function recognizeGrid(image: HTMLCanvasElement, crop: GridCrop): Promise<ScreenshotResult> {
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
  const templates = [
    ...offlineTemplates.map(({ digit, ratio, bits }) => ({
      digit,
      glyph: {
        ratio,
        colored: false,
        pixels: [...bits].flatMap((hex) => [...parseInt(hex, 16).toString(2).padStart(4, '0')].map(Number)),
      },
    })),
    ...createDigitTemplates(),
  ];
  const board = canvas(720, 720);
  board.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, 720, 720);
  const uncertain: number[] = [];
  const cells = Array.from({ length: 81 }, (_, i): RecoveryCell => {
    const glyph = extractGlyph(board.getImageData((i % 9) * 80 + 12, Math.floor(i / 9) * 80 + 10, 56, 60), 22);
    if (!glyph) return { value: 0, fixed: false, notes: [] };
    const scores = Array.from({ length: 9 }, () => Infinity);
    for (const { digit, glyph: candidate } of templates) {
      const mismatch =
        glyph.pixels.reduce((sum, bit, p) => sum + Math.abs(bit - candidate.pixels[p]), 0) / glyph.pixels.length;
      const score = mismatch + Math.abs(glyph.ratio - candidate.ratio) * 0.15;
      scores[digit - 1] = Math.min(scores[digit - 1], score);
    }
    const ranked = scores.map((score, n) => ({ score, value: n + 1 })).sort((a, b) => a.score - b.score);
    if (ranked[0].score > 0.24 || ranked[1].score - ranked[0].score < 0.025) uncertain.push(i);
    return { value: ranked[0].value, fixed: !glyph.colored, notes: [] };
  });
  return { cells, uncertain };
}
