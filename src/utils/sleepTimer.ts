/** Port of the original Flutter `SleepTimer` entity + `VersionUtils`. */

/** Zero means "end of track" in the original UI. */
export const SLEEP_TIMER_PRESETS_MS = [
  15 * 60_000,
  30 * 60_000,
  45 * 60_000,
  60 * 60_000,
  90 * 60_000,
  2 * 60 * 60_000,
];

export interface SleepTimerState {
  durationMs: number;
  startedAt: number; // epoch ms
  fadeOutEnabled: boolean;
  /** true when durationMs === 0 in "end of track" mode */
  endOfTrack: boolean;
}

export function startSleepTimer(
  durationMs: number,
  fadeOutEnabled = true,
  now = Date.now(),
): SleepTimerState {
  return { durationMs, startedAt: now, fadeOutEnabled, endOfTrack: durationMs === 0 };
}

export function remainingMs(timer: SleepTimerState, now = Date.now()): number {
  if (timer.endOfTrack) return Number.POSITIVE_INFINITY;
  return Math.max(0, timer.durationMs - (now - timer.startedAt));
}

export function isExpired(timer: SleepTimerState, now = Date.now()): boolean {
  return !timer.endOfTrack && remainingMs(timer, now) === 0;
}

export function sleepProgress(timer: SleepTimerState, now = Date.now()): number {
  if (timer.endOfTrack) return 0;
  if (timer.durationMs === 0) return 1;
  return Math.min(1, Math.max(0, (now - timer.startedAt) / timer.durationMs));
}

/** 0..1 fade progress during the final `fadeOutSeconds` of the timer, or null when not fading. */
export function fadeProgress(
  timer: SleepTimerState,
  fadeOutSeconds: number,
  now = Date.now(),
): number | null {
  if (!timer.fadeOutEnabled || timer.endOfTrack || fadeOutSeconds <= 0) return null;
  const remaining = remainingMs(timer, now);
  const fadeMs = fadeOutSeconds * 1000;
  if (remaining > fadeMs) return null;
  return 1 - remaining / fadeMs;
}

export function displayVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

/** Semver-ish comparison for the GitHub Releases update check: 1 if a>b, -1 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
