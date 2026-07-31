// Audio feedback — zen-quality sound design
// Layered oscillators + filters + convolution reverb for physical materiality.
// Sounds evoke wood, ceramic, paper, wind chimes — never raw electronic tones.

import { gs } from './state';
import type { SudokuWindow } from '../facade/windowTypes';
import { getAudioSettings } from './audioSettings';

// ── Shared audio graph ──────────────────────────────────────────────

function getCtx(): AudioContext | null {
  try {
    if (!gs._audioCtx) {
      const win = window as SudokuWindow;
      const AC = win.AudioContext || win.webkitAudioContext;
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

// ── File-based playback (replaces synthesis when files are present) ──────────

function playFile(src: string, baseVolume = 0.6): void {
  try {
    const { sfxEnabled, sfxVolume } = getAudioSettings();
    if (!sfxEnabled) return;
    const resolved = src.startsWith('/') ? import.meta.env.BASE_URL + src.slice(1) : src;
    const audio = new Audio(resolved);
    audio.volume = Math.min(1, baseVolume * sfxVolume);
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── Sound: cell select — paper brush ────────────────────────────────

export function playCellSelectSound(): void {
  playFile('/sounds/cell_select.ogg', 0.55);
}

// ── Sound: number fill — ceramic pebble on wood ─────────────────────

export function playFillSound(): void {
  playFile('/sounds/fill.ogg', 0.65);
}

// ── Sound: note toggle — pencil tick ────────────────────────────────

export function playNoteToggleSound(): void {
  playFile('/sounds/note_toggle.ogg', 0.45);
}

// ── Sound: erase — soft brush sweep ─────────────────────────────────

export function playEraseSound(): void {
  playFile('/sounds/erase.ogg', 0.5);
}

// ── Sound: unit complete — wind chime, two notes ────────────────────

export function playUnitCompleteSound(): void {
  playFile('/sounds/unit_complete.ogg', 0.7);
}

// ── Sound: win — pentatonic cascade with afterglow ──────────────────

export function playWinSound(): void {
  playFile('/sounds/win.ogg', 0.75);
}

// ── Sound: error — muted wooden thunk ───────────────────────────────

export function playErrorFeedback(): void {
  playFile('/sounds/error.ogg', 0.6);
}

// ── Duo real-time event cues — synthesized tones (no asset files) ────
// 對手 / 賽況轉折的即時聽覺回饋。走既有 room graph（含 reverb），並尊重 sfx 設定。

interface CueNote {
  freq: number;
  start: number; // 相對起始秒
  dur: number; // 持續秒
  type?: OscillatorType;
}

function playCue(notes: CueNote[], baseVolume: number): void {
  try {
    const { sfxEnabled, sfxVolume } = getAudioSettings();
    if (!sfxEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    ensureGraph(ctx);
    const vol = Math.min(0.5, baseVolume * sfxVolume);
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.value = n.freq;
      const t0 = ctx.currentTime + n.start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(gain);
      connectToRoom(gain, ctx);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.03);
    }
  } catch {
    /* ignore */
  }
}

/** Opponent finished the puzzle — rising two-note attention alert. */
export function playOpponentFinishedCue(): void {
  playCue(
    [
      { freq: 587, start: 0, dur: 0.16, type: 'triangle' },
      { freq: 880, start: 0.12, dur: 0.22, type: 'triangle' },
    ],
    0.5,
  );
}

/** Opponent is closing in (soft) or just overtook you (strong) — tension cue. */
export function playOpponentThreatCue(strong: boolean): void {
  if (strong) {
    playCue(
      [
        { freq: 440, start: 0, dur: 0.1, type: 'sawtooth' },
        { freq: 392, start: 0.09, dur: 0.16, type: 'sawtooth' },
      ],
      0.32,
    );
  } else {
    playCue([{ freq: 523, start: 0, dur: 0.1, type: 'triangle' }], 0.22);
  }
}

/** You lost the duo — somber descending cue. */
export function playDefeatCue(): void {
  playCue(
    [
      { freq: 330, start: 0, dur: 0.22, type: 'sine' },
      { freq: 220, start: 0.18, dur: 0.34, type: 'sine' },
    ],
    0.4,
  );
}

/** Final Duo victory — a fast three-note rise with a bright resolving octave. */
export function playDuoVictoryCue(): void {
  playCue(
    [
      { freq: 523, start: 0, dur: 0.16, type: 'triangle' },
      { freq: 659, start: 0.09, dur: 0.18, type: 'triangle' },
      { freq: 784, start: 0.18, dur: 0.2, type: 'triangle' },
      { freq: 1047, start: 0.3, dur: 0.38, type: 'sine' },
    ],
    0.46,
  );
}

/** Final Duo draw — two balanced tones resolving together. */
export function playDuoDrawCue(): void {
  playCue(
    [
      { freq: 587, start: 0, dur: 0.2, type: 'triangle' },
      { freq: 698, start: 0.12, dur: 0.24, type: 'triangle' },
      { freq: 587, start: 0.3, dur: 0.28, type: 'sine' },
      { freq: 698, start: 0.3, dur: 0.28, type: 'sine' },
    ],
    0.38,
  );
}

// ── Shared helpers (used by zenAudio.ts) ─────────────────────────────

export { getCtx, ensureGraph, connectToRoom, getNoiseBuffer };
