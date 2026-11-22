import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MediaSessionController,
  type MediaSessionActions,
  type MediaSessionActionDetailsLike,
  type MediaSessionLike,
} from "../mediaSession";
import type { Track } from "../playlist";

class FakeSession implements MediaSessionLike {
  metadata: unknown = null;
  playbackState: "none" | "paused" | "playing" = "none";
  handlers = new Map<string, ((d: MediaSessionActionDetailsLike) => void) | null>();
  positionStates: { duration: number; position: number; playbackRate: number }[] = [];
  setActionHandler(action: string, handler: ((d: MediaSessionActionDetailsLike) => void) | null) {
    this.handlers.set(action, handler);
  }
  setPositionState(state: { duration: number; position: number; playbackRate: number }) {
    this.positionStates.push(state);
  }
  fire(action: string, details: MediaSessionActionDetailsLike = {}) {
    this.handlers.get(action)?.(details);
  }
}

class FakeMetadata {
  constructor(public init: unknown) {}
}

const track: Track = {
  id: "t1",
  path: "/music/song.mp3",
  title: "Song",
  artist: "Artist",
  album: "Album",
  durationMs: 200_000,
  fileSizeBytes: 1,
};

function makeActions(): MediaSessionActions & Record<string, ReturnType<typeof vi.fn>> {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
    skipForward: vi.fn(),
    skipBackward: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal("MediaMetadata", FakeMetadata);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MediaSessionController", () => {
  it("sets metadata on track change, clears it on null", () => {
    const s = new FakeSession();
    const c = new MediaSessionController(s);
    c.setTrack(track);
    expect(s.metadata).toBeInstanceOf(FakeMetadata);
    expect((s.metadata as FakeMetadata).init).toMatchObject({ title: "Song", artist: "Artist", album: "Album" });
    c.setTrack(null);
    expect(s.metadata).toBeNull();
    expect(s.playbackState).toBe("none");
  });

  it("registers all handlers and routes them to player actions", () => {
    const s = new FakeSession();
    const actions = makeActions();
    new MediaSessionController(s).bindActions(actions);
    for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"]) {
      expect(s.handlers.get(a)).toBeTypeOf("function");
    }
    s.fire("play");
    s.fire("pause");
    s.fire("nexttrack");
    s.fire("previoustrack");
    s.fire("seekforward");
    s.fire("seekbackward");
    expect(actions.play).toHaveBeenCalledTimes(1);
    expect(actions.pause).toHaveBeenCalledTimes(1);
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(actions.previous).toHaveBeenCalledTimes(1);
    expect(actions.skipForward).toHaveBeenCalledTimes(1);
    expect(actions.skipBackward).toHaveBeenCalledTimes(1);
  });

  it("seekto converts seconds to ms and ignores missing seekTime", () => {
    const s = new FakeSession();
    const actions = makeActions();
    new MediaSessionController(s).bindActions(actions);
    s.fire("seekto", { seekTime: 42.5 });
    expect(actions.seek).toHaveBeenCalledWith(42_500);
    s.fire("seekto", {});
    expect(actions.seek).toHaveBeenCalledTimes(1);
  });

  it("syncs playbackState", () => {
    const s = new FakeSession();
    const c = new MediaSessionController(s);
    c.setPlaybackState("playing");
    expect(s.playbackState).toBe("playing");
    c.setPlaybackState("paused");
    expect(s.playbackState).toBe("paused");
    c.setPlaybackState("none");
    expect(s.playbackState).toBe("none");
  });

  it("reports position in seconds, clamped, and skips invalid durations", () => {
    const s = new FakeSession();
    const c = new MediaSessionController(s);
    c.setPosition(200_000, 50_000, 1.5);
    expect(s.positionStates).toEqual([{ duration: 200, position: 50, playbackRate: 1.5 }]);
    c.setPosition(200_000, 999_000, 1);
    expect(s.positionStates[1].position).toBe(200);
    c.setPosition(0, 0, 1);
    c.setPosition(Number.NaN, 0, 1);
    c.setPosition(Infinity, 0, 1);
    expect(s.positionStates).toHaveLength(2);
  });

  it("is a silent no-op without a session", () => {
    const c = new MediaSessionController(null);
    const actions = makeActions();
    expect(c.available).toBe(false);
    expect(() => {
      c.bindActions(actions);
      c.setTrack(track);
      c.setPlaybackState("playing");
      c.setPosition(1000, 500, 1);
    }).not.toThrow();
  });
});
