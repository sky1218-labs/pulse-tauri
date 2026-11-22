import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadLibrary, sanitizeLibrary, DEFAULT_SETTINGS } from "../../repository";

const KEY = "pulse-tauri.library.v1";
const backing = new Map<string, string>();

beforeEach(() => {
  backing.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  });
});

describe("loadLibrary persistence integrity", () => {
  it("falls back to defaults on corrupted JSON", () => {
    backing.set(KEY, "{not json");
    const data = loadLibrary();
    expect(data.tracks).toEqual([]);
    expect(data.playlists).toEqual([]);
    expect(data.positions).toEqual({});
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults on a non-object payload", () => {
    expect(sanitizeLibrary(42).tracks).toEqual([]);
    expect(sanitizeLibrary([1, 2]).playlists).toEqual([]);
    expect(sanitizeLibrary(null).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("drops wrong-typed collections and malformed tracks", () => {
    const data = sanitizeLibrary({
      tracks: [{ id: "a", path: "/m/a.mp3", title: "A", durationMs: 1000, fileSizeBytes: 5 }, { id: "b" }, "junk"],
      playlists: "nope",
      positions: [],
    });
    expect(data.tracks.map((t) => t.id)).toEqual(["a"]);
    expect(data.playlists).toEqual([]);
    expect(data.positions).toEqual({});
  });

  it("prunes playlist track ids that no longer exist and dedupes them", () => {
    const data = sanitizeLibrary({
      tracks: [{ id: "a", path: "/m/a.mp3" }],
      playlists: [{ id: "p", name: "P", trackIds: ["a", "ghost", "a", 7], createdAt: 1, updatedAt: 2 }],
    });
    expect(data.playlists[0].trackIds).toEqual(["a"]);
  });

  it("keeps only finite, non-negative positions", () => {
    const data = sanitizeLibrary({
      positions: { "/m/a.mp3": 12000, "/m/b.mp3": -5, "/m/c.mp3": "9000", "/m/d.mp3": Number.NaN },
    });
    expect(data.positions).toEqual({ "/m/a.mp3": 12000 });
  });

  it("merges stored settings over the defaults", () => {
    const data = sanitizeLibrary({ settings: { darkMode: false, skipForwardSeconds: 30 } });
    expect(data.settings.darkMode).toBe(false);
    expect(data.settings.skipForwardSeconds).toBe(30);
    expect(data.settings.defaultVolume).toBe(DEFAULT_SETTINGS.defaultVolume);
  });
});
