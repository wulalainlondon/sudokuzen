// BGM manager — HTML Audio element for looping background music.
// Separate from audio.ts which uses Web Audio API for short SFX.

import { getAudioSettings } from './audioSettings';

let _audio: HTMLAudioElement | null = null;
let _currentTrack: BgmTrack | null = null;
let _intendedTrack: BgmTrack | null = null; // track requested, regardless of enabled state
let _fadeTimer: ReturnType<typeof setInterval> | null = null;
let _loopListener: (() => void) | null = null;

const FADE_STEPS = 25;
const FADE_INTERVAL_MS = 40; // ~1 second total fade
const LOOP_CROSSFADE_SECONDS = 0.15;

const TRACKS = {
  wild: `${import.meta.env.BASE_URL}sounds/bgm/two_hands_one_board.mp3`,
  duo: `${import.meta.env.BASE_URL}sounds/bgm/thunder_at_the_gates.mp3`,
} as const;

export type BgmTrack = keyof typeof TRACKS;

export function playBgm(track: BgmTrack): void {
  _intendedTrack = track;

  const { bgmEnabled, bgmVolume } = getAudioSettings();
  if (!bgmEnabled) return;

  if (_currentTrack === track && _audio && !_audio.paused) return;

  _clearFade();
  _stopImmediate();

  const targetVol = bgmVolume;
  const audio = _createTrackAudio(track);
  audio.volume = 0;
  _audio = audio;
  _currentTrack = track;
  _bindManualLoop(audio, track);

  audio
    .play()
    .then(() => {
      let step = 0;
      _fadeTimer = setInterval(() => {
        step++;
        if (_audio === audio) {
          audio.volume = Math.min(targetVol, targetVol * (step / FADE_STEPS));
        }
        if (step >= FADE_STEPS) {
          _clearFade();
          if (_audio === audio) audio.volume = targetVol;
        }
      }, FADE_INTERVAL_MS);
    })
    .catch(() => {
      // Autoplay blocked — audio is stored; will play on next user gesture if needed
    });
}

export function stopBgm(): void {
  if (!_audio) return;
  _clearFade();

  const audio = _audio;
  const startVol = audio.volume;
  let step = 0;

  _fadeTimer = setInterval(() => {
    step++;
    audio.volume = Math.max(0, startVol * (1 - step / FADE_STEPS));
    if (step >= FADE_STEPS) {
      _clearFade();
      audio.pause();
      audio.src = '';
      if (_audio === audio) {
        _unbindManualLoop(audio);
        _audio = null;
        _currentTrack = null;
      }
    }
  }, FADE_INTERVAL_MS);
}

/** Called by settings panel when BGM volume changes (live update). */
export function applyBgmVolume(volume: number): void {
  if (_audio) _audio.volume = Math.max(0, Math.min(1, volume));
}

/** Called by settings panel when BGM enabled toggle changes (live update). */
export function applyBgmEnabled(enabled: boolean): void {
  if (!enabled) {
    stopBgm();
  } else if (_intendedTrack && (!_audio || _audio.paused)) {
    playBgm(_intendedTrack);
  }
}

function _clearFade(): void {
  if (_fadeTimer) {
    clearInterval(_fadeTimer);
    _fadeTimer = null;
  }
}

function _stopImmediate(): void {
  if (_audio) {
    _unbindManualLoop(_audio);
    _audio.pause();
    _audio.src = '';
    _audio = null;
    _currentTrack = null;
  }
}

function _createTrackAudio(track: BgmTrack): HTMLAudioElement {
  const audio = new Audio(TRACKS[track]);
  audio.loop = false; // handled by manual crossfade loop
  audio.preload = 'auto';
  return audio;
}

function _bindManualLoop(audio: HTMLAudioElement, track: BgmTrack): void {
  _unbindManualLoop(audio);
  const onTimeUpdate = () => _maybeCrossfadeLoop(audio, track);
  audio.addEventListener('timeupdate', onTimeUpdate);
  _loopListener = onTimeUpdate;
}

function _unbindManualLoop(audio: HTMLAudioElement): void {
  if (_loopListener) {
    audio.removeEventListener('timeupdate', _loopListener);
    _loopListener = null;
  }
}

function _maybeCrossfadeLoop(audio: HTMLAudioElement, track: BgmTrack): void {
  if (_audio !== audio) return;
  if (!_currentTrack || _currentTrack !== track) return;
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

  const remaining = audio.duration - audio.currentTime;
  if (remaining > LOOP_CROSSFADE_SECONDS) return;

  _unbindManualLoop(audio);

  const { bgmEnabled, bgmVolume } = getAudioSettings();
  if (!bgmEnabled) return;

  const next = _createTrackAudio(track);
  next.volume = 0;
  _audio = next;
  _bindManualLoop(next, track);

  next
    .play()
    .then(() => {
      const startVol = audio.volume;
      const targetVol = Math.max(0, Math.min(1, bgmVolume));
      let step = 0;
      const total = Math.max(2, Math.round((LOOP_CROSSFADE_SECONDS * 1000) / FADE_INTERVAL_MS));
      const timer = setInterval(() => {
        step++;
        const t = step / total;
        next.volume = targetVol * Math.min(1, t);
        audio.volume = startVol * Math.max(0, 1 - t);
        if (step >= total) {
          clearInterval(timer);
          next.volume = targetVol;
          audio.pause();
          audio.src = '';
        }
      }, FADE_INTERVAL_MS);
    })
    .catch(() => {
      // If next track cannot start, keep current playing; rebind loop probe.
      if (_audio === next) _audio = audio;
      _bindManualLoop(audio, track);
    });
}
