// Audio feedback — zen-quality sound design
// Layered oscillators + filters + convolution reverb for physical materiality.
// Sounds evoke wood, ceramic, paper, wind chimes — never raw electronic tones.

import { gs } from './state';

// ── Shared audio graph ──────────────────────────────────────────────

function getCtx(): AudioContext | null {
  try {
    if (!gs._audioCtx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      gs._audioCtx = new AC();
    }
    if (gs._audioCtx!.state === 'suspended') gs._audioCtx!.resume();
    return gs._audioCtx;
  } catch {
    return null;
  }
}

function ensureGraph(ctx: AudioContext): GainNode {
  if (gs._masterGain) return gs._masterGain;

  // Master output
  const master = ctx.createGain();
  master.gain.value = 0.14;
  master.connect(ctx.destination);
  gs._masterGain = master;

  // Reverb send (synthetic impulse)
  try {
    const len = Math.floor(ctx.sampleRate * 0.7);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.28;
    conv.connect(reverbGain);
    reverbGain.connect(master);
    gs._reverbNode = conv;
    gs._reverbGain = reverbGain;
  } catch {
    /* reverb optional */
  }

  // Dry path
  const dry = ctx.createGain();
  dry.gain.value = 0.75;
  dry.connect(master);
  gs._dryGain = dry;

  return master;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (gs._noiseBuffer) return gs._noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.15);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  gs._noiseBuffer = buf;
  return buf;
}

/** Route a source node through dry + reverb sends */
function connectToRoom(node: AudioNode, ctx: AudioContext): void {
  if (gs._dryGain) node.connect(gs._dryGain);
  else node.connect(gs._masterGain || ctx.destination);
  if (gs._reverbNode) node.connect(gs._reverbNode);
}

// ── Sound: cell select — paper brush ────────────────────────────────

export function playCellSelectSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    hp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(hp);
    hp.connect(g);
    connectToRoom(g, ctx);
    src.start(t);
    src.stop(t + 0.04);
  } catch {
    /* ignore */
  }
}

// ── Sound: number fill — ceramic pebble on wood ─────────────────────

export function playFillSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    // Body: warm triangle tone
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.06);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.Q.value = 0.7;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.065, t + 0.004);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(lp);
    lp.connect(g1);
    connectToRoom(g1, ctx);
    osc.start(t);
    osc.stop(t + 0.12);

    // Transient: noise click
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 1.2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.04, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    src.connect(bp);
    bp.connect(g2);
    connectToRoom(g2, ctx);
    src.start(t);
    src.stop(t + 0.025);
  } catch {
    /* ignore */
  }
}

// ── Sound: note toggle — pencil tick ────────────────────────────────

export function playNoteToggleSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.014, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(g);
    connectToRoom(g, ctx);
    osc.start(t);
    osc.stop(t + 0.05);
  } catch {
    /* ignore */
  }
}

// ── Sound: erase — soft brush sweep ─────────────────────────────────

export function playEraseSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.06);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(bp);
    bp.connect(g);
    connectToRoom(g, ctx);
    src.start(t);
    src.stop(t + 0.08);
  } catch {
    /* ignore */
  }
}

// ── Sound: unit complete — wind chime, two notes ────────────────────

export function playUnitCompleteSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;
    const notes: [number, number, number][] = [
      [784, t, 0.04], // G5
      [1175, t + 0.12, 0.03], // D6 — perfect fifth
    ];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    lp.Q.value = 0.5;
    connectToRoom(lp, ctx);
    // Boost reverb for this sound
    if (gs._reverbGain) gs._reverbGain.gain.setValueAtTime(0.45, t);

    for (const [freq, start, peak] of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.65);
      osc.connect(g);
      g.connect(lp);
      osc.start(start);
      osc.stop(start + 0.7);
    }

    // Restore reverb level
    if (gs._reverbGain) {
      gs._reverbGain.gain.setValueAtTime(0.45, t + 0.8);
      gs._reverbGain.gain.linearRampToValueAtTime(0.28, t + 1.2);
    }
  } catch {
    /* ignore */
  }
}

// ── Sound: win — pentatonic cascade with afterglow ──────────────────

export function playWinSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;
    const freqs = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    lp.Q.value = 0.5;
    connectToRoom(lp, ctx);
    if (gs._reverbGain) gs._reverbGain.gain.setValueAtTime(0.55, t);

    freqs.forEach((freq, i) => {
      const start = t + i * 0.18;
      const isLast = i === freqs.length - 1;
      const decay = isLast ? 2.2 : 1.3;
      const peak = isLast ? 0.04 : 0.035;

      // Main tone
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, start + decay);
      osc.connect(g);
      g.connect(lp);
      osc.start(start);
      osc.stop(start + decay + 0.1);

      // Shimmer: slightly detuned octave
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2.008;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, start + 0.02);
      g2.gain.linearRampToValueAtTime(0.009, start + 0.04);
      g2.gain.exponentialRampToValueAtTime(0.001, start + decay * 0.6);
      osc2.connect(g2);
      g2.connect(lp);
      osc2.start(start);
      osc2.stop(start + decay + 0.1);
    });

    // Restore reverb
    if (gs._reverbGain) {
      gs._reverbGain.gain.setValueAtTime(0.55, t + 3.5);
      gs._reverbGain.gain.linearRampToValueAtTime(0.28, t + 4.2);
    }
  } catch {
    /* ignore */
  }
}

// ── Sound: error — muted wooden thunk ───────────────────────────────

export function playErrorFeedback(): void {
  const ctx = getCtx();
  if (!ctx) return;
  ensureGraph(ctx);
  try {
    const t = ctx.currentTime;

    // Low thud
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.06);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 350;
    lp.Q.value = 1.0;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.045, t + 0.003);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(lp);
    lp.connect(g1);
    // Dry only — error should feel immediate, not spacious
    if (gs._dryGain) g1.connect(gs._dryGain);
    else g1.connect(gs._masterGain || ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);

    // Transient thud
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 1.8;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.03, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
    src.connect(bp);
    bp.connect(g2);
    if (gs._dryGain) g2.connect(gs._dryGain);
    else g2.connect(gs._masterGain || ctx.destination);
    src.start(t);
    src.stop(t + 0.04);
  } catch {
    /* ignore */
  }
}

// ── Shared helpers (used by zenAudio.ts) ─────────────────────────────

export { getCtx, ensureGraph, connectToRoom, getNoiseBuffer };
