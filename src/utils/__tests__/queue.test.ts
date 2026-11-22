import { describe, it, expect } from "vitest";
import { removeTrackFromQueue } from "../playlist";

const q = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("removeTrackFromQueue", () => {
  it("removes the matching track and keeps order", () => {
    expect(removeTrackFromQueue(q, "b").map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("returns the same reference when the track is absent", () => {
    expect(removeTrackFromQueue(q, "zzz")).toBe(q);
  });

  it("handles removing the only / last element", () => {
    expect(removeTrackFromQueue([{ id: "a" }], "a")).toEqual([]);
    expect(removeTrackFromQueue(q, "c").map((t) => t.id)).toEqual(["a", "b"]);
  });
});
