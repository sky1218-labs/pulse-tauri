import type { Track } from "./playlist";

/**
 * Library sort orders, modelled on the mainstream players (Spotify /
 * Apple Music / YouTube Music all offer title, artist, album and
 * recently-added; file name matters here because Pulse is local-first
 * and many files carry weak tags).
 *
 * Comparators use a locale collator with numeric collation, so
 * "Track 2" sorts before "Track 10", and fall through to sensible
 * tie-breakers (artist → album → title) so equal keys stay stable and
 * meaningful instead of reshuffling.
 */
export type SortKey = "title" | "artist" | "album" | "dateAdded" | "duration" | "fileName";
export type SortDir = "asc" | "desc";

export interface SortChoice {
  key: SortKey;
  dir: SortDir;
}

export const SORT_KEYS: SortKey[] = ["title", "artist", "album", "dateAdded", "duration", "fileName"];

/** The direction each key is most useful in when first picked. */
export const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  title: "asc",
  artist: "asc",
  album: "asc",
  dateAdded: "desc",
  duration: "asc",
  fileName: "asc",
};

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function sortTracks(tracks: readonly Track[], choice: SortChoice, locale = "zh-TW"): Track[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const str = (a: string, b: string) => collator.compare(a, b);
  const byTitle = (a: Track, b: Track) => str(a.title, b.title) || str(a.artist ?? "", b.artist ?? "");
  const primary = (a: Track, b: Track): number => {
    switch (choice.key) {
      case "title":
        return byTitle(a, b);
      case "artist":
        return str(a.artist ?? "", b.artist ?? "") || str(a.album ?? "", b.album ?? "") || byTitle(a, b);
      case "album":
        return str(a.album ?? "", b.album ?? "") || byTitle(a, b);
      case "dateAdded":
        return (a.addedAt ?? 0) - (b.addedAt ?? 0) || byTitle(a, b);
      case "duration":
        return a.durationMs - b.durationMs || byTitle(a, b);
      case "fileName":
        return str(baseName(a.path), baseName(b.path)) || byTitle(a, b);
    }
  };
  const sign = choice.dir === "asc" ? 1 : -1;
  return [...tracks].sort((a, b) => sign * primary(a, b));
}
