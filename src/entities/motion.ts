export type MotionPreset = 'none' | 'subtle' | 'expressive' | 'cinematic';
export type PerformanceTier = 'low' | 'medium' | 'high';

export type MotionPolicy = {
  preset: MotionPreset;
  reducedMotion: boolean;
  performanceTier: PerformanceTier;
  allowCanvasFx: boolean;
  allowGsapTimeline: boolean;
};
