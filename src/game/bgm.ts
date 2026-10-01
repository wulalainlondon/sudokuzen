import { getAudioSettings } from './audioSettings';
import { isNativeApp } from '../platform/nativeApp';
import { musicTrack, type MusicMode, type MusicTrack } from '../music/catalog';
import { selectedMusic } from '../music/collection';

export type BgmTrack = MusicMode;
interface Voice {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  preview: boolean;
  startedAt: number;
  offset: number;
  loopStart: number;
  loopEnd: number;
  fade: { from: number; to: number; start: number; duration: number };
}
let context: AudioContext | null = null;
let master: GainNode | null = null;
let intendedMode: MusicMode | null = null;
let current: Voice | null = null;
let loadingId: string | null = null;
let requestKind: 'music' | 'preview' = 'music';
let error: string | null = null;
let generation = 0;
let fetchController: AbortController | null = null;
let checkpoint: { id: string; offset: number } | null = null;
const voices = new Set<Voice>();
const buffers = new Map<string, AudioBuffer>();
const TRANSITION_SECONDS = 0.45;

function emit(): void {
  window.dispatchEvent(new Event('sudoku:music-playback'));
}
export function getBgmPlaybackState(): {
  mode: MusicMode | null;
  trackId: string | null;
  previewId: string | null;
  loadingId: string | null;
  playing: boolean;
  error: string | null;
} {
  return {
    mode: intendedMode,
    trackId: current?.id ?? null,
    previewId: current?.preview ? current.id : null,
    loadingId,
    playing: !!current && context?.state === 'running',
    error,
  };
}
function audioContext(): AudioContext | null {
  if (context?.state === 'closed') {
    context = null;
    master = null;
    buffers.clear();
  }
  if (!context) {
    const AudioCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = Math.max(0, Math.min(1, getAudioSettings().bgmVolume));
    master.connect(context.destination);
    context.addEventListener('statechange', emit);
  }
  return context;
}

/** Make the decoded MP3 wrap on adjacent samples, independent of JS timers. */
export function prepareMusicLoop(
  ctx: BaseAudioContext,
  decoded: AudioBuffer,
  track: MusicTrack,
): {
  buffer: AudioBuffer;
  loopStart: number;
  loopEnd: number;
} {
  const expectedFrames = Math.round(track.duration * decoded.sampleRate);
  const length = Math.min(decoded.length, expectedFrames);
  const overlap = Math.min(Math.round(track.loopOverlap * decoded.sampleRate), Math.floor(length / 8));
  const result = ctx.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const samples = result.getChannelData(channel);
    samples.set(decoded.getChannelData(channel).subarray(0, length));
    for (let i = 0; i < overlap; i++) {
      const weight = (1 - Math.cos((Math.PI * i) / Math.max(1, overlap - 1))) * 0.5;
      const tail = length - overlap + i;
      samples[tail] = samples[tail] * (1 - weight) + samples[i] * weight;
    }
  }
  return { buffer: result, loopStart: overlap / decoded.sampleRate, loopEnd: length / decoded.sampleRate };
}
function voiceLevel(voice: Voice, time: number): number {
  const fade = voice.fade;
  if (voice.preview && fade.to === 1 && time >= voice.startedAt + 14.6) {
    return Math.max(0, (voice.startedAt + 15 - time) / 0.4);
  }
  const t = Math.max(0, Math.min(1, (time - fade.start) / Math.max(0.001, fade.duration)));
  return fade.from + (fade.to - fade.from) * t;
}
function disconnect(voice: Voice): void {
  voices.delete(voice);
  voice.source.disconnect();
  voice.gain.disconnect();
}
function fadeOut(voice: Voice, duration = TRANSITION_SECONDS): void {
  if (!context) return;
  const now = context.currentTime;
  const level = voiceLevel(voice, now);
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(level, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + duration);
  voice.fade = { from: level, to: 0, start: now, duration };
  try {
    voice.source.stop(now + duration);
  } catch {
    disconnect(voice);
  }
}
function cancelRequest(): void {
  generation++;
  fetchController?.abort();
  fetchController = null;
  loadingId = null;
}
function silence(clearIntent: boolean, immediate = false): void {
  cancelRequest();
  if (clearIntent) intendedMode = null;
  current = null;
  for (const voice of [...voices]) {
    if (immediate) {
      try {
        voice.source.stop();
      } catch {
        /* already ended */
      }
      disconnect(voice);
    } else fadeOut(voice, 0.22);
  }
  emit();
}
async function requestTrack(track: MusicTrack, preview: boolean): Promise<void> {
  if (!getAudioSettings().bgmEnabled || document.hidden) return;
  if (!preview && current?.id === track.id && !current.preview) {
    void context?.resume().catch(() => {});
    return;
  }
  if (loadingId === track.id && requestKind === (preview ? 'preview' : 'music')) return;
  cancelRequest();
  const token = generation;
  loadingId = track.id;
  requestKind = preview ? 'preview' : 'music';
  error = null;
  emit();
  try {
    const ctx = audioContext();
    if (!ctx || !master) throw new Error('此裝置無法播放背景音樂');
    void ctx.resume().catch(() => {});
    let decoded = buffers.get(track.id);
    if (!decoded) {
      const controller = new AbortController();
      fetchController = controller;
      const response = await fetch(`${import.meta.env.BASE_URL}${track.file}`, { signal: controller.signal });
      // Capacitor's local media scheme supplies bytes with status 0 on iOS.
      const bundledMedia =
        isNativeApp() && response.status === 0 && response.url.startsWith('capacitor://localhost/sounds/bgm/');
      if (!response.ok && !bundledMedia) throw new Error('音樂載入失敗，請確認連線後再試一次');
      const data = await response.arrayBuffer();
      if (token !== generation) return;
      decoded = await ctx.decodeAudioData(data);
      if (token !== generation) return;
      buffers.set(track.id, decoded);
      while (buffers.size > 2) buffers.delete(buffers.keys().next().value!);
    }
    if (token !== generation || !getAudioSettings().bgmEnabled || document.hidden) return;
    const loop = prepareMusicLoop(ctx, decoded, track);
    const source = ctx.createBufferSource();
    source.buffer = loop.buffer;
    source.loop = true;
    source.loopStart = loop.loopStart;
    source.loopEnd = loop.loopEnd;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const offset = !preview && checkpoint?.id === track.id ? checkpoint.offset : loop.loopStart;
    checkpoint = null;
    const voice: Voice = {
      id: track.id,
      source,
      gain,
      preview,
      startedAt: now,
      offset,
      loopStart: loop.loopStart,
      loopEnd: loop.loopEnd,
      fade: { from: 0, to: 1, start: now, duration: TRANSITION_SECONDS },
    };
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + TRANSITION_SECONDS);
    source.connect(gain);
    gain.connect(master);
    for (const old of [...voices]) fadeOut(old);
    voices.add(voice);
    current = voice;
    loadingId = null;
    fetchController = null;
    source.onended = () => {
      disconnect(voice);
      if (current !== voice) return;
      current = null;
      emit();
      if (preview && token === generation && intendedMode && getAudioSettings().bgmEnabled) playBgm(intendedMode);
    };
    source.start(now, Math.max(loop.loopStart, Math.min(loop.loopEnd - 0.001, offset)));
    if (preview) {
      gain.gain.setValueAtTime(1, now + 14.6);
      gain.gain.linearRampToValueAtTime(0, now + 15);
      source.stop(now + 15);
    }
    emit();
  } catch (reason) {
    if (token !== generation) return;
    loadingId = null;
    error = reason instanceof Error ? reason.message : '無法播放音樂';
    emit();
  }
}
export function playBgm(mode: BgmTrack): void {
  intendedMode = mode;
  void requestTrack(selectedMusic(mode), false);
}
export function stopBgm(): void {
  checkpoint = null;
  silence(true);
}
export function previewBgm(id: string): void {
  const track = musicTrack(id);
  if (track) void requestTrack(track, true);
}
export function stopBgmPreview(): void {
  if (!current?.preview && requestKind !== 'preview') return;
  silence(false);
  if (intendedMode && getAudioSettings().bgmEnabled) playBgm(intendedMode);
}
export function refreshBgmSelection(): void {
  if (intendedMode && !current?.preview) playBgm(intendedMode);
}
export function applyBgmVolume(volume: number): void {
  if (!context || !master) return;
  master.gain.cancelScheduledValues(context.currentTime);
  master.gain.setValueAtTime(master.gain.value, context.currentTime);
  master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), context.currentTime + 0.06);
}
export function applyBgmEnabled(enabled: boolean): void {
  if (!enabled) silence(false);
  else if (intendedMode) playBgm(intendedMode);
}
function resumeFromGesture(): void {
  if (!getAudioSettings().bgmEnabled || document.hidden) return;
  const ctx = audioContext();
  if (ctx && ctx.state !== 'running')
    void ctx
      .resume()
      .then(emit)
      .catch(() => {});
  if (intendedMode && !current && !loadingId) playBgm(intendedMode);
}
if (typeof document !== 'undefined') {
  for (const event of ['pointerdown', 'touchend', 'keydown'])
    document.addEventListener(event, resumeFromGesture, { passive: true });
  window.addEventListener('sudoku:music-changed', refreshBgmSelection);
  window.addEventListener('sudoku:profile-hydrated', refreshBgmSelection);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (current && !current.preview && context) {
        const duration = current.loopEnd - current.loopStart;
        checkpoint = {
          id: current.id,
          offset:
            current.loopStart +
            ((current.offset - current.loopStart + context.currentTime - current.startedAt) % duration),
        };
      }
      silence(false, true);
    } else resumeFromGesture();
  });
}
