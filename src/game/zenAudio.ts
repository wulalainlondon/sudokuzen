// Zen audio — world-mode-specific synthesized sounds.
// Uses the shared audio graph from audio.ts (AudioContext, reverb, dry/wet routing).
// Evokes temple bells, ink brush, water drops, bronze bowls — organic, meditative.

import { gs } from './state';
import { getCtx, ensureGraph, connectToRoom } from './audio';

// ── Helper: connect dry-only (no reverb) ─────────────────────────────

function connectDryOnly(node: AudioNode, ctx: AudioContext): void {
  if (gs._dryGain) node.connect(gs._dryGain);
  else node.connect(gs._masterGain || ctx.destination);
}

// ── Helper: create longer noise buffer for zen sounds ────────────────

function getLongNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}


// ── File-based playback ──────────────────────────────────────────────────────

function playFile(src: string, volume = 0.6): void {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── 1. Wooden temple bell (mokugyo) ──────────────────────────────────

export function playZenEnter(): void {
  playFile('/sounds/zen_bell.ogg', 0.7);
}

// ── 2. Brush on paper (ASMR texture) ─────────────────────────────────

export function playZenEncounter(): void {
  playFile('/sounds/zen_encounter.ogg', 0.55);
}

// ── 3. Sword unsheathe / wind cut ────────────────────────────────────

export function playZenCast(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = getLongNoiseBuffer(ctx, 0.4);

    // Rising highpass: 800 -> 4000Hz over 200ms
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(800, t);
    hp.frequency.exponentialRampToValueAtTime(4000, t + 0.2);
    hp.Q.value = 0.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    src.connect(hp);
    hp.connect(g);
    connectToRoom(g, ctx);

    src.start(t);
    src.stop(t + 0.4);
  } catch {
    /* ignore */
  }
}

// ── 4. Water drop with pitch parameter ───────────────────────────────

export function playZenStrike(pitch = 880): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    // Boost reverb for water pool echo
    if (gs._reverbGain) gs._reverbGain.gain.setValueAtTime(0.5, t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = pitch;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(g);
    connectToRoom(g, ctx);

    osc.start(t);
    osc.stop(t + 0.2);

    // Restore reverb
    if (gs._reverbGain) {
      gs._reverbGain.gain.setValueAtTime(0.5, t + 0.18);
      gs._reverbGain.gain.linearRampToValueAtTime(0.28, t + 0.4);
    }
  } catch {
    /* ignore */
  }
}

// ── 5. Bronze bowl strike ────────────────────────────────────────────

export function playZenComplete(peakGain = 0.04): void {
  playFile('/sounds/zen_complete.ogg', 0.7);
}

// ── 6. Bronze bowl + wind chime cascade ──────────────────────────────

export function playZenLevelUp(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    // Bowl strike first
    playZenComplete();

    const t = ctx.currentTime;
    const chimes = [1047, 1319, 1568]; // C6, E6, G6

    chimes.forEach((freq, i) => {
      const start = t + 0.4 + i * 0.2;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.025, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
      osc.connect(g);
      connectToRoom(g, ctx);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  } catch {
    /* ignore */
  }
}

// ── 7. String snap ───────────────────────────────────────────────────

export function playZenFail(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.4);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 250;
    lp.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc.connect(lp);
    lp.connect(g);
    // Dry only — failure is immediate, not spacious
    connectDryOnly(g, ctx);

    osc.start(t);
    osc.stop(t + 0.65);
  } catch {
    /* ignore */
  }
}

// ── 8. Distant thunder ───────────────────────────────────────────────

export function playZenBoss(): void {
  playFile('/sounds/zen_boss.ogg', 0.65);
}

// ── 9. Temple bell x3 ───────────────────────────────────────────────

export function playZenSessionComplete(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const peaks = [0.04, 0.035, 0.03];
    peaks.forEach((peak, i) => {
      setTimeout(() => playZenComplete(peak), i * 1000);
    });
  } catch {
    /* ignore */
  }
}

// ── 10. Page turn ────────────────────────────────────────────────────

export function playZenDiscover(): void {
  playFile('/sounds/zen_discover.ogg', 0.55);
}

// ── 11. Ink drop in water ────────────────────────────────────────────

export function playZenMentor(): void {
  playFile('/sounds/zen_mentor.ogg', 0.5);
}
