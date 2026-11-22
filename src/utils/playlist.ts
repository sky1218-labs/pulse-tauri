import { canonicalize } from "./audioPath";

export interface Track {
  id: string;
  path: string;
  title: string;
  artist?: string;
  album?: string;
  /** milliseconds */
  durationMs: number;
  fileSizeBytes: number;
  addedAt?: number;
  artworkPath?: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export function displayTitle(track: Track): string {
  if (track.title && track.title.trim()) return track.title;
  const base = track.path.split("/").pop() ?? track.path;
  return base;
}

/** Adds tracks to a playlist, skipping duplicates by canonical path (mirrors Playlist.addFiles). Returns the same reference when nothing changed. */
export function addTracksToPlaylist(
  playlist: Playlist,
  candidates: Track[],
  libraryByPath: Map<string, Track>,
): Playlist {
  const existing = new Set(playlist.trackIds.map((id) => id));
  const existingPaths = new Set<string>();
  // Build path set from ids via library lookup provided by caller through candidates map
  for (const t of libraryByPath.values()) {
    if (existing.has(t.id)) existingPaths.add(canonicalize(t.path));
  }
  const toAdd: Track[] = [];
  for (const t of candidates) {
    const cp = canonicalize(t.path);
    if (existingPaths.has(cp)) continue;
    existingPaths.add(cp);
    toAdd.push(t);
  }
  if (toAdd.length === 0) return playlist;
  return {
    ...playlist,
    trackIds: [...playlist.trackIds, ...toAdd.map((t) => t.id)],
    updatedAt: Date.now(),
  };
}

export function containsPath(playlist: Playlist, path: string, tracksById: Map<string, Track>): boolean {
  const cp = canonicalize(path);
  return playlist.trackIds.some((id) => {
    const t = tracksById.get(id);
    return t ? canonicalize(t.path) === cp : false;
  });
}

/** Remove a track from a playback queue; returns the same array when absent. */
export function removeTrackFromQueue<T extends { id: string }>(queue: T[], trackId: string): T[] {
  if (!queue.some((t) => t.id === trackId)) return queue;
  return queue.filter((t) => t.id !== trackId);
}

export function removeTrack(playlist: Playlist, trackId: string): Playlist {
  return { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId), updatedAt: Date.now() };
}

export function reorderTracks(playlist: Playlist, oldIndex: number, newIndex: number): Playlist {
  const ids = [...playlist.trackIds];
  if (oldIndex < 0 || oldIndex >= ids.length || newIndex < 0 || newIndex >= ids.length) return playlist;
  const [item] = ids.splice(oldIndex, 1);
  ids.splice(newIndex, 0, item);
  return { ...playlist, trackIds: ids, updatedAt: Date.now() };
}

export function totalDurationMs(playlist: Playlist, tracksById: Map<string, Track>): number {
  return playlist.trackIds.reduce((sum, id) => sum + (tracksById.get(id)?.durationMs ?? 0), 0);
}

/** Immediate parent folder name of a file path ("/a/b/c.mp3" → "b"); null for root-level files and non-filesystem paths. */
export function parentFolderName(path: string): string | null {
  if (!path || path.startsWith("blob:") || path.startsWith("data:")) return null;
  const parts = canonicalize(path).split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 2];
}

/** Group tracks by immediate parent folder name; folderless tracks are omitted. */
export function groupTracksByFolderName(tracks: Track[]): Map<string, Track[]> {
  const groups = new Map<string, Track[]>();
  for (const t of tracks) {
    const name = parentFolderName(t.path);
    if (!name) continue;
    const list = groups.get(name);
    if (list) list.push(t);
    else groups.set(name, [t]);
  }
  return groups;
}

/**
 * Folder-import rule: one playlist per folder, matched by exact name
 * (case-sensitive as stored). A missing playlist is created; an existing
 * one — including a same-named manual playlist — gains only the track ids
 * it does not already have, so re-importing a folder never duplicates
 * tracks or playlists. Pure: unchanged playlists keep their reference.
 */
export function ensureFolderPlaylists(
  playlists: Playlist[],
  groups: { name: string; trackIds: string[] }[],
  makeId: () => string,
  now: number = Date.now(),
): Playlist[] {
  let out = playlists;
  for (const g of groups) {
    const ids = [...new Set(g.trackIds)];
    if (!g.name || ids.length === 0) continue;
    const idx = out.findIndex((p) => p.name === g.name);
    if (idx === -1) {
      out = [...out, { id: makeId(), name: g.name, trackIds: ids, createdAt: now, updatedAt: now }];
    } else {
      const existing = out[idx];
      const missing = ids.filter((id) => !existing.trackIds.includes(id));
      if (missing.length > 0) {
        out = out.map((p, i) => (i === idx ? { ...p, trackIds: [...p.trackIds, ...missing], updatedAt: now } : p));
      }
    }
  }
  return out;
}

/** Dedupe a list of tracks by canonical path, keeping the first occurrence. */
export function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    const cp = canonicalize(t.path);
    if (seen.has(cp)) continue;
    seen.add(cp);
    out.push({ ...t, path: cp });
  }
  return out;
}
