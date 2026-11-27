import { describe, it, expect } from "vitest";
import { sortTracks } from "../sortTracks";
import type { Track } from "../playlist";

const tr = (partial: Partial<Track>): Track => ({
  id: partial.id ?? Math.random().toString(36).slice(2),
  path: partial.path ?? "/music/x.mp3",
  title: partial.title ?? "X",
  durationMs: partial.durationMs ?? 180_000,
  fileSizeBytes: 1,
  ...partial,
});

describe("sortTracks", () => {
  it("title: natural numeric order (Track 2 before Track 10)", () => {
    const tracks = [tr({ title: "Track 10" }), tr({ title: "Track 2" }), tr({ title: "Track 1" })];
    expect(sortTracks(tracks, { key: "title", dir: "asc" }).map((t) => t.title))
      .toEqual(["Track 1", "Track 2", "Track 10"]);
    expect(sortTracks(tracks, { key: "title", dir: "desc" }).map((t) => t.title))
      .toEqual(["Track 10", "Track 2", "Track 1"]);
  });

  it("artist: falls through to album then title", () => {
    const tracks = [
      tr({ artist: "B", album: "Z", title: "one" }),
      tr({ artist: "B", album: "A", title: "two" }),
      tr({ artist: "A", album: "Z", title: "three" }),
    ];
    expect(sortTracks(tracks, { key: "artist", dir: "asc" }).map((t) => t.title))
      .toEqual(["three", "two", "one"]);
  });

  it("dateAdded: missing stamps count as oldest", () => {
    const tracks = [
      tr({ title: "new", addedAt: 300 }),
      tr({ title: "unstamped" }),
      tr({ title: "old", addedAt: 100 }),
    ];
    expect(sortTracks(tracks, { key: "dateAdded", dir: "desc" }).map((t) => t.title))
      .toEqual(["new", "old", "unstamped"]);
    expect(sortTracks(tracks, { key: "dateAdded", dir: "asc" }).map((t) => t.title))
      .toEqual(["unstamped", "old", "new"]);
  });

  it("duration: numeric with title tie-break", () => {
    const tracks = [
      tr({ title: "b", durationMs: 100 }),
      tr({ title: "a", durationMs: 100 }),
      tr({ title: "c", durationMs: 50 }),
    ];
    expect(sortTracks(tracks, { key: "duration", dir: "asc" }).map((t) => t.title))
      .toEqual(["c", "a", "b"]);
  });

  it("fileName: compares basenames, not folders", () => {
    const tracks = [
      tr({ path: "/zzz/b.mp3", title: "t1" }),
      tr({ path: "/aaa/c.mp3", title: "t2" }),
    ];
    expect(sortTracks(tracks, { key: "fileName", dir: "asc" }).map((t) => t.title))
      .toEqual(["t1", "t2"]);
  });

  it("does not mutate the input array", () => {
    const tracks = [tr({ title: "B" }), tr({ title: "A" })];
    sortTracks(tracks, { key: "title", dir: "asc" });
    expect(tracks.map((t) => t.title)).toEqual(["B", "A"]);
  });
});
