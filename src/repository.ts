import type { Track, Playlist } from "./utils/playlist";
import type { LocaleCode } from "./i18n";

/** Mirrors the original Flutter `Settings` entity defaults (lib/domain/entities/settings.dart). */
export interface Settings {
  darkMode: boolean;
  locale: LocaleCode;
  defaultVolume: number;
  defaultPlaybackSpeed: number;
  autoResume: boolean;
  resumePlaybackOnTrackTap: boolean;
  skipForwardSeconds: number;
  skipBackwardSeconds: number;
  monitoredFolders: string[];
  sleepTimerFadeOutEnabled: boolean;
  sleepTimerFadeOutSeconds: number;
  navigateToPlayerOnResume: boolean;
  autoUpdateEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  darkMode: true,
  locale: "zh-TW",
  defaultVolume: 1.0,
  defaultPlaybackSpeed: 1.0,
  autoResume: true,
  resumePlaybackOnTrackTap: true,
  skipForwardSeconds: 10,
  skipBackwardSeconds: 10,
  monitoredFolders: [],
  sleepTimerFadeOutEnabled: true,
  sleepTimerFadeOutSeconds: 5,
  navigateToPlayerOnResume: false,
  autoUpdateEnabled: true,
};

export interface LibraryData {
  tracks: Track[];
  playlists: Playlist[];
  /** canonical path -> last position in ms */
  positions: Record<string, number>;
  settings: Settings;
}

export const EMPTY_LIBRARY: LibraryData = {
  tracks: [],
  playlists: [],
  positions: {},
  settings: DEFAULT_SETTINGS,
};

/**
 * Repository layer (v1: localStorage-backed).
 *
 * The original app persists to Drift/SQLite. For v1 of the Tauri rewrite the
 * repository interface below is backed by localStorage so the data model and
 * UI can be verified without the Tauri SQL plugin risk; swapping the backing
 * store only requires re-implementing these four functions.
 */
const KEY = "pulse-tauri.library.v1";
const SLEEP_DEADLINE_KEY = "pulse-tauri.sleep-deadline.v1";

/**
 * The armed sleep-timer deadline (epoch ms), persisted separately from
 * the library: the native service enforces it even if the WebView dies,
 * and on relaunch the UI rehydrates its countdown from it. Null = none.
 */
export function loadSleepDeadline(): number | null {
  try {
    const raw = localStorage.getItem(SLEEP_DEADLINE_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveSleepDeadline(deadlineMs: number | null): void {
  try {
    if (deadlineMs === null) localStorage.removeItem(SLEEP_DEADLINE_KEY);
    else localStorage.setItem(SLEEP_DEADLINE_KEY, String(deadlineMs));
  } catch {
    /* storage unavailable — the native side still holds the deadline */
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Validate persisted data before the app trusts it: wrong-typed collections
 * fall back to empty (a corrupt payload must never crash the library),
 * playlist track ids that no longer resolve to a track are dropped, and
 * positions keep only finite, non-negative numbers.
 */
export function sanitizeLibrary(parsed: unknown): LibraryData {
  if (!isPlainObject(parsed)) return structuredClone(EMPTY_LIBRARY);

  const rawTracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
  const tracks: Track[] = [];
  for (const t of rawTracks) {
    if (!isPlainObject(t) || typeof t.id !== "string" || typeof t.path !== "string") continue;
    tracks.push({
      ...(t as unknown as Track),
      title: typeof t.title === "string" ? t.title : "",
      durationMs: finiteOr(t.durationMs, 0),
      fileSizeBytes: finiteOr(t.fileSizeBytes, 0),
    });
  }
  const trackIds = new Set(tracks.map((t) => t.id));

  const rawPlaylists = Array.isArray(parsed.playlists) ? parsed.playlists : [];
  const playlists: Playlist[] = [];
  for (const p of rawPlaylists) {
    if (!isPlainObject(p) || typeof p.id !== "string" || typeof p.name !== "string") continue;
    const ids = Array.isArray(p.trackIds) ? p.trackIds : [];
    playlists.push({
      ...(p as unknown as Playlist),
      trackIds: [...new Set(ids.filter((id): id is string => typeof id === "string" && trackIds.has(id)))],
      createdAt: finiteOr(p.createdAt, 0),
      updatedAt: finiteOr(p.updatedAt, 0),
    });
  }

  const positions: Record<string, number> = {};
  if (isPlainObject(parsed.positions)) {
    for (const [k, v] of Object.entries(parsed.positions)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) positions[k] = v;
    }
  }

  return {
    tracks,
    playlists,
    positions,
    settings: { ...DEFAULT_SETTINGS, ...(isPlainObject(parsed.settings) ? (parsed.settings as Partial<Settings>) : {}) },
  };
}

export function loadLibrary(): LibraryData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY_LIBRARY);
    return sanitizeLibrary(JSON.parse(raw));
  } catch {
    return structuredClone(EMPTY_LIBRARY);
  }
}

export function saveLibrary(data: LibraryData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full / unavailable — playback continues in-memory
  }
}

export function clearLibraryStorage(): void {
  localStorage.removeItem(KEY);
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
