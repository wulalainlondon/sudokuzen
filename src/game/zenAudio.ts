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

// ── 1. Wooden temple bell (mokugyo) ──────────────────────────────────

export function playZenEnter(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    // Lowpass filter for "wood body" warmth
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    lp.Q.value = 1.2;
    connectToRoom(lp, ctx);

    // Boost reverb for this sound
    if (gs._reverbGain) gs._reverbGain.gain.setValueAtTime(0.5, t);

    // Main tone: triangle 220Hz
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = 220;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.05, t + 0.003);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc1.connect(g1);
    g1.connect(lp);
    osc1.start(t);
    osc1.stop(t + 1.0);

    // Detuned oscillator for beating/warmth
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 221.5;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.04, t + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc2.connect(g2);
    g2.connect(lp);
    osc2.start(t);
    osc2.stop(t + 1.0);

    // Restore reverb
    if (gs._reverbGain) {
      gs._reverbGain.gain.setValueAtTime(0.5, t + 0.9);
      gs._reverbGain.gain.linearRampToValueAtTime(0.28, t + 1.3);
    }
  } catch {
    /* ignore */
  }
}

// ── 2. Brush on paper (ASMR texture) ─────────────────────────────────

export function playZenEncounter(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = getLongNoiseBuffer(ctx, 0.6);

    // Bandpass sweep 1200-3000Hz
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, t);
    bp.frequency.linearRampToValueAtTime(3000, t + 0.5);
    bp.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.05);
    g.gain.linearRampToValueAtTime(0.02, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    src.connect(bp);
    bp.connect(g);
    // Dry-heavy: mostly dry, little reverb
    connectDryOnly(g, ctx);

    src.start(t);
    src.stop(t + 0.6);
  } catch {
    /* ignore */
  }
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
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    // Heavy reverb
    if (gs._reverbGain) gs._reverbGain.gain.setValueAtTime(0.6, t);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    lp.Q.value = 0.5;
    connectToRoom(lp, ctx);

    // Fundamental: 180Hz
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 180;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(peakGain, t + 0.005);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    osc1.connect(g1);
    g1.connect(lp);
    osc1.start(t);
    osc1.stop(t + 2.2);

    // Octave: 360Hz
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 360;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(peakGain * 0.7, t + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    osc2.connect(g2);
    g2.connect(lp);
    osc2.start(t);
    osc2.stop(t + 2.2);

    // Shimmer: detuned 362Hz for beating
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = 362;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0, t);
    g3.gain.linearRampToValueAtTime(peakGain * 0.3, t + 0.02);
    g3.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    osc3.connect(g3);
    g3.connect(lp);
    osc3.start(t);
    osc3.stop(t + 2.0);

    // Restore reverb
    if (gs._reverbGain) {
      gs._reverbGain.gain.setValueAtTime(0.6, t + 2.1);
      gs._reverbGain.gain.linearRampToValueAtTime(0.28, t + 2.5);
    }
  } catch {
    /* ignore */
  }
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
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = getLongNoiseBuffer(ctx, 1.4);

    // Low rumble: lowpass 200Hz
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    lp.Q.value = 0.5;

    // Swell: ramp up 400ms, sustain 300ms, fade 500ms
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.4);
    g.gain.setValueAtTime(0.04, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    src.connect(lp);
    lp.connect(g);
    connectToRoom(g, ctx);

    // Very heavy reverb
    if (gs._reverbGain) gs._reverbGain.gain.setValueAtTime(0.6, t);

    src.start(t);
    src.stop(t + 1.4);

    // Restore reverb
    if (gs._reverbGain) {
      gs._reverbGain.gain.setValueAtTime(0.6, t + 1.3);
      gs._reverbGain.gain.linearRampToValueAtTime(0.28, t + 1.8);
    }
  } catch {
    /* ignore */
  }
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
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = getLongNoiseBuffer(ctx, 0.4);

    // Bandpass 1500-2500Hz
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.linearRampToValueAtTime(2500, t + 0.3);
    bp.Q.value = 0.6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.015, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    src.connect(bp);
    bp.connect(g);
    connectToRoom(g, ctx);

    src.start(t);
    src.stop(t + 0.4);
  } catch {
    /* ignore */
  }
}

// ── 11. Ink drop in water ────────────────────────────────────────────

export function playZenMentor(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    // Reverb-heavy for "spreading" feel
    if (gs._reverbGain) gs._reverbGain.gain.setValueAtTime(0.5, t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 330;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(g);
    connectToRoom(g, ctx);

    osc.start(t);
    osc.stop(t + 0.55);

    // Restore reverb
    if (gs._reverbGain) {
      gs._reverbGain.gain.setValueAtTime(0.5, t + 0.5);
      gs._reverbGain.gain.linearRampToValueAtTime(0.28, t + 0.8);
    }
  } catch {
    /* ignore */
  }
}
