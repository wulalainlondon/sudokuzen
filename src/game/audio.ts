// Audio feedback — all sound functions

import { gs } from './state';

function getAudioCtx(): AudioContext | null {
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

export function playFillSound(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(698, t);
    osc.frequency.exponentialRampToValueAtTime(784, t + 0.06);
    g.gain.setValueAtTime(0.025, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch { /* ignore */ }
}

export function playUnitCompleteSound(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    ([[587, t + 0.04], [880, t + 0.14]] as [number, number][]).forEach(([freq, start]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.035, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  } catch { /* ignore */ }
}

export function playWinSound(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.13;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.03, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.7);
    });
  } catch { /* ignore */ }
}

export function playErrorFeedback(): void {
  if (navigator.vibrate) navigator.vibrate(120);
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 180;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    setTimeout(() => ctx.close(), 150);
  } catch { /* ignore */ }
}
