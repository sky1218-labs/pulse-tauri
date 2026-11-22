/** Port of the original Flutter `PlaybackSpeedUtils`. */
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.0;
export const DEFAULT_SPEED = 1.0;
export const FINE_STEP = 0.05;
export const SPEED_STEP = 0.25;
export const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

export function quantizeSpeed(speed: number, step = FINE_STEP): number {
  const clamped = clampSpeed(speed);
  const steps = Math.round((clamped - MIN_SPEED) / step);
  return parseFloat((MIN_SPEED + steps * step).toFixed(2));
}

export const increaseSpeed = (s: number, step = FINE_STEP) => quantizeSpeed(s + step, step);
export const decreaseSpeed = (s: number, step = FINE_STEP) => quantizeSpeed(s - step, step);

export function nearlyEquals(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) < epsilon;
}
export const isNormalSpeed = (s: number) => nearlyEquals(s, DEFAULT_SPEED);
export const isMinSpeed = (s: number) => s <= MIN_SPEED + 0.001;
export const isMaxSpeed = (s: number) => s >= MAX_SPEED - 0.001;

export function formatSpeed(speed: number): string {
  const q = quantizeSpeed(speed);
  if (Number.isInteger(q)) return `${q}x`;
  return `${q.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;
}

export function nextPreset(current: number): number {
  const exact = SPEED_PRESETS.findIndex((s) => nearlyEquals(s, current));
  if (exact !== -1) return SPEED_PRESETS[(exact + 1) % SPEED_PRESETS.length];
  const next = SPEED_PRESETS.find((s) => s > current + 0.001);
  return next ?? SPEED_PRESETS[0];
}

export function previousPreset(current: number): number {
  const exact = SPEED_PRESETS.findIndex((s) => nearlyEquals(s, current));
  if (exact !== -1)
    return SPEED_PRESETS[(exact - 1 + SPEED_PRESETS.length) % SPEED_PRESETS.length];
  const prev = [...SPEED_PRESETS].reverse().find((s) => s < current - 0.001);
  return prev ?? SPEED_PRESETS[SPEED_PRESETS.length - 1];
}

/** How long content of `durationMs` takes to play at `speed`. */
export function adjustedDuration(durationMs: number, speed: number): number {
  if (speed <= 0) return durationMs;
  return Math.round(durationMs / speed);
}
