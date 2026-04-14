// Audio settings — persisted to localStorage, applied live to bgm.ts / audio.ts

import { SK, readJson, writeJson } from '../storage/keys';

export interface AudioSettings {
  sfxEnabled: boolean;
  sfxVolume: number;  // 0–1
  bgmEnabled: boolean;
  bgmVolume: number;  // 0–1
}

const DEFAULTS: AudioSettings = {
  sfxEnabled: true,
  sfxVolume: 0.8,
  bgmEnabled: true,
  bgmVolume: 0.6,
};

export function getAudioSettings(): AudioSettings {
  return {
    sfxEnabled: readJson(SK.SFX_ENABLED, DEFAULTS.sfxEnabled),
    sfxVolume: readJson(SK.SFX_VOLUME, DEFAULTS.sfxVolume),
    bgmEnabled: readJson(SK.BGM_ENABLED, DEFAULTS.bgmEnabled),
    bgmVolume: readJson(SK.BGM_VOLUME, DEFAULTS.bgmVolume),
  };
}

export function saveAudioSettings(patch: Partial<AudioSettings>): void {
  if (patch.sfxEnabled !== undefined) writeJson(SK.SFX_ENABLED, patch.sfxEnabled);
  if (patch.sfxVolume !== undefined) writeJson(SK.SFX_VOLUME, patch.sfxVolume);
  if (patch.bgmEnabled !== undefined) writeJson(SK.BGM_ENABLED, patch.bgmEnabled);
  if (patch.bgmVolume !== undefined) writeJson(SK.BGM_VOLUME, patch.bgmVolume);
}
