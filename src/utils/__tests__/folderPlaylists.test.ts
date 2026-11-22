import { describe, it, expect } from "vitest";
import {
  parentFolderName, groupTracksByFolderName, ensureFolderPlaylists,
  type Playlist, type Track,
} from "../playlist";

const mk = (id: string, path: string): Track => ({ id, path, title: id, durationMs: 1000, fileSizeBytes: 1 });
let seq = 0;
const makeId = () => `new-${++seq}`;
const NOW = 1_700_000_000_000;

describe("parentFolderName", () => {
  it("returns the immediate parent folder", () => {
    expect(parentFolderName("/storage/emulated/0/Music/Rock/song.mp3")).toBe("Rock");
    expect(parentFolderName("/a/b/c.flac")).toBe("b");
    expect(parentFolderName("C:\\Music\\Jazz\\x.mp3")).toBe("Jazz");
  });
  it("returns null for root files and non-filesystem paths", () => {
    expect(parentFolderName("/song.mp3")).toBeNull();
    expect(parentFolderName("song.mp3")).toBeNull();
    expect(parentFolderName("blob:https://x/1")).toBeNull();
    expect(parentFolderName("")).toBeNull();
  });
});

describe("groupTracksByFolderName", () => {
  it("groups by immediate parent folder, skipping folderless tracks", () => {
    const groups = groupTracksByFolderName([
      mk("1", "/m/Rock/a.mp3"), mk("2", "/m/Rock/b.mp3"),
      mk("3", "/m/Jazz/c.mp3"), mk("4", "/root.mp3"), mk("5", "blob:x"),
    ]);
    expect([...groups.keys()].sort()).toEqual(["Jazz", "Rock"]);
    expect(groups.get("Rock")?.map((t) => t.id)).toEqual(["1", "2"]);
    expect(groups.get("Jazz")?.map((t) => t.id)).toEqual(["3"]);
  });
});

describe("ensureFolderPlaylists", () => {
  const groups = [
    { name: "Rock", trackIds: ["1", "2"] },
    { name: "Jazz", trackIds: ["3"] },
  ];

  it("creates one playlist per folder group", () => {
    seq = 0;
    const out = ensureFolderPlaylists([], groups, makeId, NOW);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "Rock", trackIds: ["1", "2"], createdAt: NOW });
    expect(out[1]).toMatchObject({ name: "Jazz", trackIds: ["3"] });
    expect(out[0].id).not.toBe(out[1].id);
  });

  it("is idempotent: re-importing the same groups changes nothing", () => {
    seq = 0;
    const once = ensureFolderPlaylists([], groups, makeId, NOW);
    const twice = ensureFolderPlaylists(once, groups, makeId, NOW + 1000);
    expect(twice).toBe(once); // same reference — nothing was added
    expect(twice.filter((p) => p.name === "Rock")).toHaveLength(1);
    expect(twice.find((p) => p.name === "Rock")?.trackIds).toEqual(["1", "2"]);
  });

  it("adds only missing tracks on re-import with new files", () => {
    seq = 0;
    const once = ensureFolderPlaylists([], groups, makeId, NOW);
    const out = ensureFolderPlaylists(once, [{ name: "Rock", trackIds: ["2", "9"] }], makeId, NOW + 5);
    const rock = out.find((p) => p.name === "Rock");
    expect(rock?.trackIds).toEqual(["1", "2", "9"]);
    expect(rock?.updatedAt).toBe(NOW + 5);
    expect(out.find((p) => p.name === "Jazz")).toBe(once.find((p) => p.name === "Jazz"));
  });

  it("merges into a same-named manual playlist instead of duplicating it", () => {
    seq = 0;
    const manual: Playlist = { id: "manual-1", name: "Rock", trackIds: ["7"], createdAt: 1, updatedAt: 1 };
    const out = ensureFolderPlaylists([manual], groups, makeId, NOW);
    expect(out).toHaveLength(2); // Rock (merged) + Jazz (created)
    const rock = out.find((p) => p.name === "Rock");
    expect(rock?.id).toBe("manual-1");
    expect(rock?.trackIds).toEqual(["7", "1", "2"]);
  });

  it("matches names case-sensitively as stored", () => {
    seq = 0;
    const lower: Playlist = { id: "p-low", name: "rock", trackIds: [], createdAt: 1, updatedAt: 1 };
    const out = ensureFolderPlaylists([lower], [{ name: "Rock", trackIds: ["1"] }], makeId, NOW);
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.name === "Rock")?.trackIds).toEqual(["1"]);
  });

  it("skips empty groups and dedupes ids inside a group", () => {
    seq = 0;
    const out = ensureFolderPlaylists([], [
      { name: "", trackIds: ["1"] },
      { name: "Empty", trackIds: [] },
      { name: "Rock", trackIds: ["1", "1", "2"] },
    ], makeId, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].trackIds).toEqual(["1", "2"]);
  });

  it("two folders with the same name from different roots share one playlist", () => {
    seq = 0;
    const out = ensureFolderPlaylists([], [
      { name: "Rock", trackIds: ["1"] },
      { name: "Rock", trackIds: ["2"] },
    ], makeId, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].trackIds).toEqual(["1", "2"]);
  });
});
