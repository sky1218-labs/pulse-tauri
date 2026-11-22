/** Port of the original Flutter `VolumeUtils`. Volume is 0.0–1.0. */
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 1;
export const DEFAULT_VOLUME = 1;
export const VOLUME_STEP = 0.05;

export const clampVolume = (v: number) => Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, v));
export const increaseVolume = (v: number, step = VOLUME_STEP) => clampVolume(v + step);
export const decreaseVolume = (v: number, step = VOLUME_STEP) => clampVolume(v - step);
export const volumeToPercentage = (v: number) => Math.round(clampVolume(v) * 100);
export const volumeFromPercentage = (p: number) => clampVolume(p / 100);
export const isMuted = (v: number) => v <= 0;
export const isMaxVolume = (v: number) => v >= MAX_VOLUME;
export const formatVolumePercentage = (v: number) => `${volumeToPercentage(v)}%`;

/** Sleep-timer fade-out: progress 0 (start of fade) → 1 (silent). */
export function calculateFadeOutVolume(originalVolume: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return originalVolume * (1 - p);
}
