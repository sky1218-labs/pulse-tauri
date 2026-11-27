import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createPlaybackEngine,
  NativeAudioEngine,
  WebAudioEngine,
  type AudioLike,
  type EngineEvent,
  type EngineQueueItem,
  type PlaybackEngineDeps,
} from "../playbackEngine";

const itemA: EngineQueueItem = {
  id: "a", path: "/music/a.mp3", title: "Song A", artist: "Artist", album: "Album", durationMs: 180_000,
};
const itemB: EngineQueueItem = {
  id: "b", path: "/music/b.mp3", title: "Song B", artist: "Artist", album: "Album", durationMs: 240_000,
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

/* --------------------------------- fake audio -------------------------------- */

class FakeAudio implements AudioLike {
  src = "";
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  playbackRate = 1;
  paused = true;
  ended = false;
  readyState = 0;
  private listeners = new Map<string, { cb: () => void; once: boolean }[]>();

  play = vi.fn(async (): Promise<void> => {
    this.paused = false;
    this.ended = false;
    this.emit("play");
  });

  pause = vi.fn((): void => {
    if (!this.paused) {
      this.paused = true;
      this.emit("pause");
    }
  });

  load = vi.fn((): void => undefined);

  removeAttribute = vi.fn((name: string): void => {
    if (name === "src") this.src = "";
  });

  addEventListener(type: string, cb: () => void, options?: { once?: boolean }): void {
    const list = this.listeners.get(type) ?? [];
    list.push({ cb, once: options?.once ?? false });
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, cb: () => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => l.cb !== cb));
  }

  emit(type: string): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => !l.once));
    for (const l of list) l.cb();
  }

  /** Simulate the element reaching the end of the current track. */
  finishTrack(): void {
    this.ended = true;
    this.paused = true;
    this.emit("ended");
    this.emit("pause"); // real elements fire a pause around ended
  }
}

function makeWebEngine() {
  const audio = new FakeAudio();
  const engine = new WebAudioEngine({
    audioFactory: () => audio,
    fileSrc: async (p) => `src:${p}`,
  });
  const events: EngineEvent[] = [];
  engine.onEvent((e) => events.push(e));
  return { audio, engine, events };
}

/** Drive a pending web-engine load to completion (metadata + play). */
async function completeLoad(audio: FakeAudio, durationSec: number) {
  await flush();
  audio.duration = durationSec;
  audio.readyState = 1;
  audio.emit("loadedmetadata");
  await flush();
}

/* --------------------------------- web engine -------------------------------- */

describe("WebAudioEngine", () => {
  it("loads the start item, applies the start position on metadata, autoplays", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA, itemB], 0, 30_000, true);
    await flush();
    expect(audio.src).toBe("src:/music/a.mp3");
    await completeLoad(audio, 180);
    expect(audio.currentTime).toBe(30);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: "playing", playing: true, currentId: "a" });
  });

  it("emits ticks with element position and falls back to the item duration", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA], 0, 0, true);
    await completeLoad(audio, Number.NaN);
    audio.currentTime = 42;
    audio.emit("timeupdate");
    const tick = events.filter((e) => e.type === "tick").pop();
    expect(tick).toMatchObject({ positionMs: 42_000, durationMs: 180_000, currentId: "a" });
  });

  it("advances with wrap on ended and reports the transition", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA, itemB], 1, 0, true); // start on B (last)
    await completeLoad(audio, 240);
    events.length = 0;
    audio.finishTrack();
    expect(events).toContainEqual({ type: "transition", previousId: "b", currentId: "a" });
    // The pause the element fires around ended must not surface as a pause.
    expect(events.some((e) => e.type === "playing" && e.playing === false)).toBe(false);
    await completeLoad(audio, 180);
    expect(audio.src).toBe("src:/music/a.mp3");
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it("stopAtTrackEnd emits ended without advancing", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA, itemB], 0, 0, true);
    await completeLoad(audio, 180);
    engine.setStopAtTrackEnd(true);
    events.length = 0;
    audio.finishTrack();
    expect(events).toContainEqual({ type: "ended", currentId: "a" });
    expect(events.some((e) => e.type === "transition")).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(1); // never restarted
    expect(audio.src).toBe("src:/music/a.mp3");
  });

  it("next/previous wrap around the queue and play", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA, itemB], 0, 0, true);
    await completeLoad(audio, 180);
    engine.previous(); // wraps to B
    expect(events).toContainEqual({ type: "transition", previousId: "a", currentId: "b" });
    await completeLoad(audio, 240);
    expect(audio.src).toBe("src:/music/b.mp3");
    engine.next(); // wraps back to A
    expect(events).toContainEqual({ type: "transition", previousId: "b", currentId: "a" });
  });

  it("maps seek/volume/speed onto the element (volume/speed remembered pre-load)", async () => {
    const { audio, engine } = makeWebEngine();
    engine.setVolume(0.4);
    engine.setSpeed(1.5);
    engine.setQueue([itemA], 0, 0, false);
    await completeLoad(audio, 180);
    expect(audio.volume).toBe(0.4);
    expect(audio.playbackRate).toBe(1.5);
    engine.seekTo(45_000);
    expect(audio.currentTime).toBe(45);
    engine.seekBy(10_000);
    expect(audio.currentTime).toBe(55);
    engine.seekBy(-100_000);
    expect(audio.currentTime).toBe(0);
  });

  it("stop pauses, clears the source and the queue", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA, itemB], 0, 0, true);
    await completeLoad(audio, 180);
    engine.stop();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe("");
    events.length = 0;
    audio.finishTrack(); // stale element event after stop: no queue, no events
    expect(events).toHaveLength(0);
  });

  it("syncQueue keeps the current item and recomputes its index", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA, itemB], 0, 0, true);
    await completeLoad(audio, 180);
    engine.syncQueue([itemB, itemA]); // A moves to index 1
    audio.finishTrack(); // advance from A wraps to B (index 0)
    expect(events).toContainEqual({ type: "transition", previousId: "a", currentId: "b" });
  });
});

/* -------------------------------- native engine ------------------------------ */

interface NativeStateResponse {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  currentId: string;
  ended: boolean;
}

function makeNativeDeps(state: NativeStateResponse) {
  const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
  let listener: ((p: unknown) => void) | null = null;
  const deps: PlaybackEngineDeps = {
    android: true,
    invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args });
      if (cmd === "plugin:mediasession|get_state") return { ...state };
      return undefined;
    }),
    addListener: vi.fn(async (_plugin: string, _event: string, cb: (p: unknown) => void) => {
      listener = cb;
      return { unregister: async () => undefined };
    }),
  };
  return { deps, calls, state, fire: (p: unknown) => listener?.(p) };
}

describe("NativeAudioEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is selected by the factory on Android and serializes setQueue with {payload}", () => {
    const { deps, calls } = makeNativeDeps({ playing: false, positionMs: 0, durationMs: 0, currentId: "", ended: false });
    const engine = createPlaybackEngine(deps);
    expect(engine.kind).toBe("native");
    engine.setQueue([itemA, itemB], 1, 5_000, true);
    const call = calls.find((c) => c.cmd === "plugin:mediasession|set_queue");
    expect(call?.args).toEqual({
      payload: {
        items: [
          { id: "a", uri: "/music/a.mp3", title: "Song A", artist: "Artist", album: "Album", durationMs: 180_000 },
          { id: "b", uri: "/music/b.mp3", title: "Song B", artist: "Artist", album: "Album", durationMs: 240_000 },
        ],
        startIndex: 1,
        startPositionMs: 5_000,
        autoplay: true,
        preserve: false,
      },
    });
    expect(deps.addListener).toHaveBeenCalledWith("mediasession", "playback-event", expect.any(Function));
  });

  it("polls get_state every 500ms and turns snapshots into tick/transition events", async () => {
    vi.useFakeTimers();
    const { deps, state } = makeNativeDeps({ playing: true, positionMs: 1_000, durationMs: 180_000, currentId: "a", ended: false });
    const engine = new NativeAudioEngine(deps);
    const events: EngineEvent[] = [];
    engine.onEvent((e) => events.push(e));
    engine.setQueue([itemA, itemB], 0, 0, true);
    await vi.advanceTimersByTimeAsync(500);
    expect(events).toContainEqual({ type: "tick", positionMs: 1_000, durationMs: 180_000, playing: true, currentId: "a" });
    expect(events.some((e) => e.type === "transition")).toBe(false);
    state.currentId = "b";
    state.positionMs = 0;
    await vi.advanceTimersByTimeAsync(500);
    expect(events).toContainEqual({ type: "transition", previousId: "a", currentId: "b", positionMs: 0, durationMs: 180_000 });
    engine.stop();
    const pollsBefore = (deps.invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === "plugin:mediasession|get_state",
    ).length;
    await vi.advanceTimersByTimeAsync(2_000);
    const pollsAfter = (deps.invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === "plugin:mediasession|get_state",
    ).length;
    expect(pollsAfter).toBe(pollsBefore); // poll stopped with playback
  });

  it("routes playback-event snapshots: playing flips and ended (once per item)", () => {
    const { deps, fire } = makeNativeDeps({ playing: false, positionMs: 0, durationMs: 0, currentId: "", ended: false });
    const engine = new NativeAudioEngine(deps);
    const events: EngineEvent[] = [];
    engine.onEvent((e) => events.push(e));
    fire({ type: "event", currentId: "a", playing: false, positionMs: 0, durationMs: 180_000, ended: false });
    fire({ type: "event", currentId: "a", playing: true, positionMs: 0, durationMs: 180_000, ended: false });
    expect(events).toContainEqual({ type: "playing", playing: true, currentId: "a" });
    fire({ type: "event", currentId: "a", playing: false, positionMs: 180_000, durationMs: 180_000, ended: true });
    fire({ type: "event", currentId: "a", playing: false, positionMs: 180_000, durationMs: 180_000, ended: true });
    expect(events.filter((e) => e.type === "ended")).toHaveLength(1);
    // ended is delivered before the trailing pause flip
    const endedIdx = events.findIndex((e) => e.type === "ended");
    const pauseIdx = events.findIndex((e) => e.type === "playing" && e.playing === false);
    expect(endedIdx).toBeGreaterThanOrEqual(0);
    expect(pauseIdx).toBeGreaterThan(endedIdx);
  });

  it("answers needs-queue-restore with a preserve syncQueue of the remembered queue", () => {
    const { deps, calls, fire } = makeNativeDeps({ playing: false, positionMs: 0, durationMs: 0, currentId: "", ended: false });
    const engine = new NativeAudioEngine(deps);
    engine.onEvent(() => undefined);
    engine.setQueue([itemA, itemB], 0, 0, true);
    calls.length = 0;
    fire({ type: "needs-queue-restore", currentId: "a", playing: false, positionMs: 0, durationMs: 0, ended: true });
    const call = calls.find((c) => c.cmd === "plugin:mediasession|set_queue");
    expect(call?.args).toMatchObject({ payload: { preserve: true, startIndex: 0 } });
    expect((call?.args?.payload as { items: unknown[] }).items).toHaveLength(2);
  });

  it("maps transport calls onto plugin commands", () => {
    const { deps, calls } = makeNativeDeps({ playing: false, positionMs: 0, durationMs: 0, currentId: "", ended: false });
    const engine = new NativeAudioEngine(deps);
    engine.play();
    engine.pause();
    engine.next();
    engine.previous();
    engine.seekTo(12_000);
    engine.seekBy(-5_000);
    engine.setVolume(0.3);
    engine.setSpeed(2);
    engine.setStopAtTrackEnd(true);
    engine.stop();
    const cmds = calls.map((c) => c.cmd);
    expect(cmds).toEqual(expect.arrayContaining([
      "plugin:mediasession|play",
      "plugin:mediasession|pause",
      "plugin:mediasession|next",
      "plugin:mediasession|previous",
      "plugin:mediasession|seek_to",
      "plugin:mediasession|seek_by",
      "plugin:mediasession|set_volume",
      "plugin:mediasession|set_speed",
      "plugin:mediasession|set_stop_at_track_end",
      "plugin:mediasession|stop_playback",
    ]));
    expect(calls.find((c) => c.cmd === "plugin:mediasession|seek_to")?.args).toEqual({ payload: { positionMs: 12_000 } });
    expect(calls.find((c) => c.cmd === "plugin:mediasession|seek_by")?.args).toEqual({ payload: { deltaMs: -5_000 } });
    expect(calls.find((c) => c.cmd === "plugin:mediasession|set_volume")?.args).toEqual({ payload: { volume: 0.3 } });
    expect(calls.find((c) => c.cmd === "plugin:mediasession|set_speed")?.args).toEqual({ payload: { speed: 2 } });
    expect(calls.find((c) => c.cmd === "plugin:mediasession|set_stop_at_track_end")?.args).toEqual({ payload: { enabled: true } });
    void deps;
  });

  it("treats empty state as a dead service: swallows it and restores on play", async () => {
    vi.useFakeTimers();
    const { deps, calls, state } = makeNativeDeps({ playing: true, positionMs: 42_000, durationMs: 180_000, currentId: "a", ended: false });
    const engine = new NativeAudioEngine(deps);
    const events: EngineEvent[] = [];
    engine.onEvent((e) => events.push(e));
    engine.setQueue([itemA, itemB], 0, 0, true);
    await vi.advanceTimersByTimeAsync(500); // live snapshot ingested
    expect(events.some((e) => e.type === "tick")).toBe(true);
    events.length = 0;
    // The service dies (app swiped away while paused / reclaimed):
    // get_state now returns the empty default state.
    Object.assign(state, { playing: false, positionMs: 0, durationMs: 0, currentId: "", ended: false });
    await vi.advanceTimersByTimeAsync(1_000);
    // Nothing from the empty state reaches the store (no position reset).
    expect(events).toHaveLength(0);
    calls.length = 0;
    engine.play();
    // No bare play command (it would be dropped natively); the queue is
    // rebuilt at the remembered track + position, autoplaying.
    expect(calls.some((c) => c.cmd === "plugin:mediasession|play")).toBe(false);
    const restore = calls.find((c) => c.cmd === "plugin:mediasession|set_queue");
    expect(restore?.args).toMatchObject({
      payload: { startIndex: 0, startPositionMs: 42_000, autoplay: true, preserve: false },
    });
    engine.stop();
  });

  it("restores the stepped track on next() after the service died", async () => {
    vi.useFakeTimers();
    const { deps, calls, state } = makeNativeDeps({ playing: false, positionMs: 10_000, durationMs: 180_000, currentId: "a", ended: false });
    const engine = new NativeAudioEngine(deps);
    engine.onEvent(() => undefined);
    engine.setQueue([itemA, itemB], 0, 0, false);
    await vi.advanceTimersByTimeAsync(500);
    Object.assign(state, { playing: false, positionMs: 0, durationMs: 0, currentId: "", ended: false });
    // Paused polls run at the slower 2s cadence, so death detection takes
    // one slow tick (previously one 500ms tick).
    await vi.advanceTimersByTimeAsync(2_000);
    calls.length = 0;
    engine.next();
    expect(calls.some((c) => c.cmd === "plugin:mediasession|next")).toBe(false);
    const restore = calls.find((c) => c.cmd === "plugin:mediasession|set_queue");
    expect(restore?.args).toMatchObject({
      payload: { startIndex: 1, startPositionMs: 0, autoplay: false, preserve: false },
    });
    engine.stop();
  });
});

describe("same-queue fast path", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("native: re-tapping within the same queue sends seek_to_index, not a full set_queue", async () => {
    vi.useFakeTimers();
    const { deps, calls } = makeNativeDeps({ playing: true, positionMs: 0, durationMs: 180_000, currentId: "a", ended: false });
    const engine = new NativeAudioEngine(deps);
    const events: EngineEvent[] = [];
    engine.onEvent((e) => events.push(e));
    engine.setQueue([itemA, itemB], 0, 0, true);
    await vi.advanceTimersByTimeAsync(500); // live snapshot: alive + current a
    calls.length = 0;
    engine.setQueue([itemA, itemB], 1, 5_000, true);
    expect(calls.some((c) => c.cmd === "plugin:mediasession|set_queue")).toBe(false);
    expect(calls.find((c) => c.cmd === "plugin:mediasession|seek_to_index")?.args).toEqual({
      payload: { index: 1, positionMs: 5_000, autoplay: true },
    });
    expect(events).toContainEqual({ type: "transition", previousId: "a", currentId: "b" });
    engine.stop();
  });

  it("web: re-tapping within the same queue loads only the target item", async () => {
    const { audio, engine, events } = makeWebEngine();
    engine.setQueue([itemA, itemB], 0, 0, true);
    await completeLoad(audio, 180);
    events.length = 0;
    engine.setQueue([itemA, itemB], 1, 0, true);
    expect(events).toContainEqual({ type: "transition", previousId: "a", currentId: "b" });
    await completeLoad(audio, 240);
    expect(audio.src).toBe("src:/music/b.mp3");
  });
});

describe("native sleep timer", () => {
  it("arms and cancels through the set_sleep_timer command", () => {
    const { deps, calls } = makeNativeDeps({ playing: true, positionMs: 0, durationMs: 180_000, currentId: "a", ended: false });
    const engine = createPlaybackEngine(deps);
    expect(engine.hasNativeSleepTimer).toBe(true);
    engine.setSleepTimer(1_700_000_000_000, 5);
    expect(calls).toContainEqual({
      cmd: "plugin:mediasession|set_sleep_timer",
      args: { payload: { deadlineMs: 1_700_000_000_000, fadeOutSeconds: 5 } },
    });
    engine.setSleepTimer(null, 0);
    expect(calls).toContainEqual({
      cmd: "plugin:mediasession|set_sleep_timer",
      args: { payload: { deadlineMs: 0, fadeOutSeconds: 0 } },
    });
  });

  it("re-applies the armed timer when a fresh queue restarts the service", () => {
    const { deps, calls } = makeNativeDeps({ playing: false, positionMs: 0, durationMs: 0, currentId: "", ended: false });
    const engine = createPlaybackEngine(deps);
    engine.setSleepTimer(1_700_000_000_000, 5);
    calls.length = 0;
    engine.setQueue([itemA], 0, 0, true);
    const queueIdx = calls.findIndex((c) => c.cmd === "plugin:mediasession|set_queue");
    const timerIdx = calls.findIndex((c) => c.cmd === "plugin:mediasession|set_sleep_timer");
    expect(queueIdx).toBeGreaterThanOrEqual(0);
    expect(timerIdx).toBeGreaterThan(queueIdx);
  });

  it("web engine reports no native sleep timer (the store enforces expiry)", () => {
    const engine = createPlaybackEngine({ android: false, audioFactory: () => new FakeAudio() });
    expect(engine.hasNativeSleepTimer).toBe(false);
    expect(() => engine.setSleepTimer(123, 5)).not.toThrow();
  });
});

describe("createPlaybackEngine", () => {
  it("returns the web engine off Android", () => {
    const engine = createPlaybackEngine({ android: false, audioFactory: () => new FakeAudio() });
    expect(engine.kind).toBe("web");
  });
});
