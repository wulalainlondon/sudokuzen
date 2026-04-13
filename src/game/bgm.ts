// BGM manager — HTML Audio element for looping background music.
// Separate from audio.ts which uses Web Audio API for short SFX.

let _audio: HTMLAudioElement | null = null;
let _currentTrack: BgmTrack | null = null;
let _fadeTimer: ReturnType<typeof setInterval> | null = null;

const BGM_VOLUME = 0.45;
const FADE_STEPS = 25;
const FADE_INTERVAL_MS = 40; // ~1 second total fade

const TRACKS = {
  wild: '/sounds/bgm/two_hands_one_board.mp3',
  duo: '/sounds/bgm/thunder_at_the_gates.mp3',
} as const;

export type BgmTrack = keyof typeof TRACKS;

export function playBgm(track: BgmTrack): void {
  if (_currentTrack === track && _audio && !_audio.paused) return;

  _clearFade();
  _stopImmediate();

  const audio = new Audio(TRACKS[track]);
  audio.loop = true;
  audio.volume = 0;
  _audio = audio;
  _currentTrack = track;

  audio.play().then(() => {
    let step = 0;
    _fadeTimer = setInterval(() => {
      step++;
      if (_audio === audio) {
        audio.volume = Math.min(BGM_VOLUME, BGM_VOLUME * (step / FADE_STEPS));
      }
      if (step >= FADE_STEPS) {
        _clearFade();
        if (_audio === audio) audio.volume = BGM_VOLUME;
      }
    }, FADE_INTERVAL_MS);
  }).catch(() => {
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
        _audio = null;
        _currentTrack = null;
      }
    }
  }, FADE_INTERVAL_MS);
}

function _clearFade(): void {
  if (_fadeTimer) {
    clearInterval(_fadeTimer);
    _fadeTimer = null;
  }
}

function _stopImmediate(): void {
  if (_audio) {
    _audio.pause();
    _audio.src = '';
    _audio = null;
    _currentTrack = null;
  }
}
