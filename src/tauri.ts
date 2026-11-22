import type { Track } from "./utils/playlist";

/** Bridge to the Rust side. Every call degrades gracefully in a plain browser
 *  (Vite dev / preview / screenshots), where Tauri APIs are absent. */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True when running inside the Android WebView (its UA always names Android). */
export function isAndroid(): boolean {
  return isTauri() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/** Standard on-device music locations scanned by Android Auto Scan. */
export const ANDROID_MUSIC_DIRS = [
  "/storage/emulated/0/Music",
  "/storage/emulated/0/Download",
  "/storage/emulated/0",
] as const;

export interface ScannedTrack {
  path: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  durationMs: number;
  fileSizeBytes: number;
}

export async function scanFolder(path: string): Promise<ScannedTrack[]> {
  if (!isTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ScannedTrack[]>("scan_folder", { path });
}

export async function getAudioMetadata(path: string): Promise<ScannedTrack> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ScannedTrack>("get_audio_metadata", { path });
}

export async function canonicalizePath(path: string): Promise<string> {
  if (!isTauri()) return path;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("canonicalize_path", { path });
}

/** Convert an absolute file path to a URL the WebView can play (asset protocol). */
export async function fileSrc(path: string): Promise<string> {
  if (!isTauri()) return path;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function pickFiles(): Promise<string[]> {
  if (!isTauri()) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    directory: false,
    multiple: true,
    filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "aac", "ogg", "m4a"] }],
  });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export function toTrack(s: ScannedTrack, id: string): Track {
  return {
    id,
    path: s.path,
    title: s.title,
    artist: s.artist ?? undefined,
    album: s.album ?? undefined,
    durationMs: s.durationMs,
    fileSizeBytes: s.fileSizeBytes,
    addedAt: Date.now(),
  };
}
