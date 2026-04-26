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
    const audio = new Audio(src);
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

// ── Shared helpers (used by zenAudio.ts) ─────────────────────────────

export { getCtx, ensureGraph, connectToRoom, getNoiseBuffer };
