import { fileSrc as tauriFileSrc, isAndroid } from "../tauri";

/**
 * The playback engine abstraction the store talks to. Two implementations:
 *
 * - NativeAudioEngine (Android): the real player is an ExoPlayer inside
 *   the mediasession plugin's Media3 MediaSessionService; this class is a
 *   controller that sends queue/transport commands and turns the native
 *   state snapshots (plugin `playback-event` triggers + a 500ms
 *   `get_state` poll) into EngineEvents.
 * - WebAudioEngine (desktop/web): wraps an HTMLAudioElement and reproduces
 *   the element-driven behavior the store used to wire by hand.
 *
 * All positions/durations are milliseconds. Queue semantics match the
 * app: next/previous wrap around, track end auto-advances with wrap, and
 * there is no shuffle/repeat setting.
 */

export interface EngineQueueItem {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
}

export interface EngineState {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  currentId: string;
  ended: boolean;
}

export interface EngineEvent {
  type: "tick" | "transition" | "playing" | "ended" | "error" | "needs-queue-restore";
  currentId?: string;
  previousId?: string;
  playing?: boolean;
  positionMs?: number;
  durationMs?: number;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackEngine {
  readonly kind: "web" | "native";
  setQueue(items: EngineQueueItem[], startIndex: number, startPositionMs: number, autoplay: boolean): void;
  /** Preserve current playback in the new list. */
  syncQueue(items: EngineQueueItem[]): void;
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  seekTo(ms: number): void;
  seekBy(deltaMs: number): void;
  setVolume(v: number): void;
  setSpeed(s: number): void;
  setStopAtTrackEnd(enabled: boolean): void;
  setRepeatMode(mode: RepeatMode): void;
  setShuffle(enabled: boolean): void;
  /**
   * Arm (epoch-ms deadline) or cancel (null) the timed sleep timer.
   * Native engines enforce it in the playback service — the WebView's
   * own timers freeze when the app is backgrounded, so expiry must not
   * depend on them. Web engines have no native side: `hasNativeSleepTimer`
   * is false and the store keeps enforcing expiry itself.
   */
  setSleepTimer(deadlineMs: number | null, fadeOutSeconds: number): void;
  readonly hasNativeSleepTimer: boolean;
  stop(): void;
  onEvent(cb: (e: EngineEvent) => void): void;
}

/* ------------------------------ injectable deps ----------------------------- */

export type EngineInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
export type EngineAddListener = (
  plugin: string,
  event: string,
  cb: (payload: unknown) => void,
) => Promise<{ unregister: () => Promise<void> }>;

/** The subset of HTMLAudioElement the web engine uses (fakeable in tests). */
export interface AudioLike {
  src: string;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  paused: boolean;
  ended: boolean;
  readyState: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, cb: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, cb: () => void): void;
}

export interface PlaybackEngineDeps {
  /** Defaults to isAndroid(). */
  android?: boolean;
  invoke?: EngineInvoke;
  addListener?: EngineAddListener;
  audioFactory?: () => AudioLike;
  fileSrc?: (path: string) => Promise<string>;
}

const defaultInvoke: EngineInvoke = async (c, args) => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(c, args);
};

const defaultAddListener: EngineAddListener = async (plugin, event, cb) => {
  const { addPluginListener } = await import("@tauri-apps/api/core");
  return addPluginListener(plugin, event, cb as (payload: unknown) => void) as Promise<{
    unregister: () => Promise<void>;
  }>;
};

const PLUGIN = "mediasession";
const cmd = (name: string) => `plugin:${PLUGIN}|${name}`;

/* ------------------------------ native engine ------------------------------- */

interface NativeSnapshot {
  type?: string;
  currentId?: string;
  previousId?: string;
  playing?: boolean;
  positionMs?: number;
  durationMs?: number;
  ended?: boolean;
  error?: string;
}

function sameQueueIds(a: EngineQueueItem[], b: EngineQueueItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id);
}

function toQueueItemPayload(item: EngineQueueItem): Record<string, unknown> {
  return {
    id: item.id,
    uri: item.path,
    title: item.title,
    artist: item.artist,
    album: item.album,
    durationMs: Math.round(item.durationMs),
  };
}

export class NativeAudioEngine implements PlaybackEngine {
  readonly kind = "native" as const;
  private cb: ((e: EngineEvent) => void) | null = null;
  private queue: EngineQueueItem[] = [];
  private subscribed = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopAtEnd = false;
  private lastCurrentId: string | null = null;
  private lastPlaying: boolean | null = null;
  private lastEndedForId: string | null = null;
  private lastPositionMs = 0;
  /**
   * Whether the native service's player is believed to exist. The service
   * stops when the app is swiped away while paused (or the system reclaims
   * it); from then on every transport command is silently dropped natively
   * and get_state returns the empty default state. That empty snapshot is
   * the death signal: mark it here and restore the queue (which restarts
   * the service) before the next transport command.
   */
  private alive = false;
  /** Remembered so they can be re-applied once the service's player exists. */
  private volume: number | null = null;
  private speed: number | null = null;
  private sleepTimer: { deadlineMs: number; fadeOutSeconds: number } | null = null;
  private repeatMode: RepeatMode = "all";
  private shuffle = false;

  constructor(private readonly deps: PlaybackEngineDeps = {}) {}

  private invoke(c: string, args?: Record<string, unknown>): Promise<unknown> {
    return (this.deps.invoke ?? defaultInvoke)(c, args);
  }

  /** Fire-and-forget command; failures are swallowed (best-effort control). */
  private send(name: string, args?: Record<string, unknown>): void {
    void this.invoke(cmd(name), args).catch(() => undefined);
  }

  private emit(e: EngineEvent): void {
    this.cb?.(e);
  }

  private ensureSubscribed(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    const addListener = this.deps.addListener ?? defaultAddListener;
    void addListener(PLUGIN, "playback-event", (payload) => {
      this.onNativeEvent(payload as NativeSnapshot);
    }).catch(() => {
      this.subscribed = false;
    });
    // Android 13+: notifications need a runtime grant or the media
    // notification silently never appears. Ask once, up front. (Served by
    // the native plugin manager, hence camelCase and no {payload} wrap.)
    void this.invoke(cmd("requestPermissions"), { permissions: ["postNotifications"] }).catch(() => undefined);
  }

  private onNativeEvent(snap: NativeSnapshot): void {
    if (!snap || typeof snap !== "object") return;
    if (snap.type === "needs-queue-restore") {
      // The native side left stop-at-track-end collapse mode and needs
      // the full queue back; answer with a preserve re-sync.
      if (this.queue.length > 0) this.syncQueue(this.queue);
      return;
    }
    this.ingest(snap);
  }

  /** Turn one native state snapshot into EngineEvents, in a safe order. */
  private ingest(snap: NativeSnapshot): void {
    const currentId =
      typeof snap.currentId === "string" && snap.currentId ? snap.currentId : null;

    if (!currentId && this.queue.length > 0 && this.lastCurrentId) {
      // Empty state while we hold a queue and a current track: the service
      // is gone. The snapshot carries no information (position 0, not
      // playing) — swallowing it keeps the UI where the user left it, and
      // `alive` makes the next transport command restore playback instead
      // of being dropped by the missing player.
      this.alive = false;
      return;
    }
    if (currentId) {
      this.alive = true;
      if (typeof snap.positionMs === "number") this.lastPositionMs = snap.positionMs;
    }

    if (currentId && this.lastCurrentId && currentId !== this.lastCurrentId) {
      this.emit({
        type: "transition",
        previousId: this.lastCurrentId,
        currentId,
        positionMs: snap.positionMs,
        durationMs: snap.durationMs,
      });
    } else if (
      currentId &&
      snap.previousId &&
      snap.previousId === currentId &&
      this.lastCurrentId === currentId
    ) {
      // Single-item repeat wrap: the same track started over.
      this.emit({
        type: "transition",
        previousId: currentId,
        currentId,
        positionMs: snap.positionMs,
        durationMs: snap.durationMs,
      });
    }
    if (currentId) this.lastCurrentId = currentId;

    if (snap.ended) {
      if (this.lastEndedForId !== (currentId ?? "")) {
        this.lastEndedForId = currentId ?? "";
        this.emit({ type: "ended", currentId: currentId ?? undefined });
      }
    } else {
      this.lastEndedForId = null;
    }

    if (snap.error) {
      this.emit({ type: "error", currentId: currentId ?? undefined });
    }

    if (typeof snap.playing === "boolean") {
      if (this.lastPlaying !== null && snap.playing !== this.lastPlaying) {
        this.emit({ type: "playing", playing: snap.playing, currentId: currentId ?? undefined });
      }
      this.lastPlaying = snap.playing;
    }

    this.emit({
      type: "tick",
      positionMs: snap.positionMs ?? 0,
      durationMs: snap.durationMs ?? 0,
      playing: snap.playing,
      currentId: currentId ?? undefined,
    });
  }

  /* Poll cadence follows playback: 500ms while playing (progress ticks),
     2s while paused (only external state changes — lock-screen / Bluetooth
     transport — need noticing). The old fixed 500ms poll kept the IPC
     bridge and the store busy even when nothing could change. */
  private startPoll(): void {
    if (this.pollTimer !== null) return;
    const step = async () => {
      this.pollTimer = null;
      await this.pollOnce();
      if (this.queue.length === 0) return;
      this.pollTimer = setTimeout(step, this.lastPlaying ? 500 : 2_000);
    };
    this.pollTimer = setTimeout(step, 500);
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      const res = (await this.invoke(cmd("get_state"))) as NativeSnapshot | null;
      if (res && typeof res === "object") this.ingest(res);
    } catch {
      /* player unavailable — the next tick retries */
    }
  }

  private sendQueue(items: EngineQueueItem[], startIndex: number, startPositionMs: number, autoplay: boolean, preserve: boolean): void {
    this.send("set_queue", {
      payload: {
        items: items.map(toQueueItemPayload),
        startIndex,
        startPositionMs: Math.round(startPositionMs),
        autoplay,
        preserve,
      },
    });
    // The player may not exist yet when volume/speed were first set (the
    // store applies them before setQueue); re-apply the remembered values.
    if (this.volume !== null) this.send("set_volume", { payload: { volume: this.volume } });
    if (this.speed !== null) this.send("set_speed", { payload: { speed: this.speed } });
    if (this.sleepTimer !== null) {
      this.send("set_sleep_timer", {
        payload: { deadlineMs: this.sleepTimer.deadlineMs, fadeOutSeconds: this.sleepTimer.fadeOutSeconds },
      });
    }
    this.send("set_repeat_mode", { payload: { mode: this.repeatMode } });
    this.send("set_shuffle", { payload: { enabled: this.shuffle } });
  }

  /**
   * Rebuild playback after the native service died: a fresh set_queue is
   * parked natively and restarts the service, landing on the remembered
   * track at the remembered position.
   */
  private restore(autoplay: boolean, startIndex?: number, startPositionMs?: number): void {
    if (this.queue.length === 0) return;
    const idx = startIndex ?? Math.max(0, this.queue.findIndex((i) => i.id === this.lastCurrentId));
    const pos = startPositionMs ?? this.lastPositionMs;
    this.sendQueue(this.queue, idx, pos, autoplay, false);
    const item = this.queue[idx];
    if (item) this.lastCurrentId = item.id;
    this.lastPositionMs = pos;
    this.alive = true;
    this.startPoll();
  }

  private get dead(): boolean {
    return this.queue.length > 0 && !this.alive;
  }

  setQueue(items: EngineQueueItem[], startIndex: number, startPositionMs: number, autoplay: boolean): void {
    // Fast path: the native player already holds this exact queue (the
    // common case — tapping another track in the list the user is already
    // playing from). Re-sending every item made each tap serialize the
    // whole library across the bridge and rebuild every MediaItem; a
    // seek-to-index carries the same intent in one small command. The
    // collapsed single-item list (stop-at-track-end) is excluded: its
    // indices do not line up with the full queue.
    if (
      items.length > 0 &&
      !this.stopAtEnd &&
      !this.dead &&
      sameQueueIds(items, this.queue)
    ) {
      const idx = Math.min(Math.max(0, startIndex), items.length - 1);
      this.send("seek_to_index", {
        payload: { index: idx, positionMs: Math.round(startPositionMs), autoplay },
      });
      const item = items[idx];
      if (item) {
        if (this.lastCurrentId && this.lastCurrentId !== item.id) {
          this.emit({ type: "transition", previousId: this.lastCurrentId, currentId: item.id });
        }
        this.lastCurrentId = item.id;
      }
      this.lastPositionMs = startPositionMs;
      this.lastPlaying = autoplay;
      this.startPoll();
      return;
    }
    this.queue = items;
    this.ensureSubscribed();
    this.sendQueue(items, startIndex, startPositionMs, autoplay, false);
    this.lastPositionMs = startPositionMs;
    // Optimistic: we just commanded the service into existence. If it
    // fails to materialise, the next empty poll snapshot marks it dead.
    this.alive = items.length > 0;
    if (items.length > 0) this.startPoll();
    else this.stopPoll();
  }

  syncQueue(items: EngineQueueItem[]): void {
    this.queue = items;
    this.ensureSubscribed();
    const startIndex = Math.max(0, items.findIndex((i) => i.id === this.lastCurrentId));
    this.sendQueue(items, startIndex, 0, this.lastPlaying ?? false, true);
  }

  play(): void {
    if (this.dead) {
      this.restore(true);
      return;
    }
    this.send("play");
  }

  pause(): void {
    this.send("pause");
  }

  next(): void {
    if (this.dead) {
      const idx = Math.max(0, this.queue.findIndex((i) => i.id === this.lastCurrentId));
      this.restore(this.lastPlaying ?? false, (idx + 1) % this.queue.length, 0);
      return;
    }
    this.send("next");
  }

  previous(): void {
    if (this.dead) {
      const idx = Math.max(0, this.queue.findIndex((i) => i.id === this.lastCurrentId));
      this.restore(this.lastPlaying ?? false, (idx - 1 + this.queue.length) % this.queue.length, 0);
      return;
    }
    this.send("previous");
  }

  seekTo(ms: number): void {
    const target = Math.round(Math.max(0, ms));
    if (this.dead) {
      this.restore(this.lastPlaying ?? false, undefined, target);
      return;
    }
    this.send("seek_to", { payload: { positionMs: target } });
  }

  seekBy(deltaMs: number): void {
    if (this.dead) {
      this.restore(this.lastPlaying ?? false, undefined, Math.max(0, this.lastPositionMs + deltaMs));
      return;
    }
    this.send("seek_by", { payload: { deltaMs: Math.round(deltaMs) } });
  }

  setVolume(v: number): void {
    this.volume = v;
    this.send("set_volume", { payload: { volume: v } });
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.send("set_speed", { payload: { speed: s } });
  }

  setStopAtTrackEnd(enabled: boolean): void {
    this.stopAtEnd = enabled;
    this.send("set_stop_at_track_end", { payload: { enabled } });
  }

  setRepeatMode(mode: RepeatMode): void {
    this.repeatMode = mode;
    this.send("set_repeat_mode", { payload: { mode } });
  }

  setShuffle(enabled: boolean): void {
    this.shuffle = enabled;
    this.send("set_shuffle", { payload: { enabled } });
  }

  readonly hasNativeSleepTimer = true;

  setSleepTimer(deadlineMs: number | null, fadeOutSeconds: number): void {
    this.sleepTimer = deadlineMs === null ? null : { deadlineMs, fadeOutSeconds };
    this.send("set_sleep_timer", {
      payload: { deadlineMs: deadlineMs ?? 0, fadeOutSeconds },
    });
  }

  stop(): void {
    this.send("stop_playback");
    this.sleepTimer = null;
    this.stopAtEnd = false;
    this.stopPoll();
    this.queue = [];
    this.lastCurrentId = null;
    this.lastPlaying = null;
    this.lastEndedForId = null;
    this.lastPositionMs = 0;
    this.alive = false;
  }

  onEvent(cb: (e: EngineEvent) => void): void {
    this.cb = cb;
    this.ensureSubscribed();
  }
}

/* -------------------------------- web engine -------------------------------- */

export class WebAudioEngine implements PlaybackEngine {
  readonly kind = "web" as const;
  private audio: AudioLike | null = null;
  private queue: EngineQueueItem[] = [];
  private index = -1;
  private cb: ((e: EngineEvent) => void) | null = null;
  private stopAtEnd = false;
  private repeatMode: RepeatMode = "all";
  private shuffle = false;
  private loadSeq = 0;
  private pendingVolume = 1;
  private pendingSpeed = 1;
  /** The element fires pause when a track ends; that flip is not a user pause. */
  private suppressNextPause = false;

  constructor(private readonly deps: PlaybackEngineDeps = {}) {}

  private resolveFileSrc(path: string): Promise<string> {
    return (this.deps.fileSrc ?? tauriFileSrc)(path);
  }

  private currentItem(): EngineQueueItem | null {
    return this.index >= 0 && this.index < this.queue.length ? this.queue[this.index] : null;
  }

  private emit(e: EngineEvent): void {
    this.cb?.(e);
  }

  private ensureAudio(): AudioLike {
    if (this.audio) return this.audio;
    const factory =
      this.deps.audioFactory ?? (() => new Audio() as unknown as AudioLike);
    const a = factory();
    a.volume = this.pendingVolume;
    a.playbackRate = this.pendingSpeed;
    a.addEventListener("timeupdate", () => this.emitTick());
    a.addEventListener("loadedmetadata", () => this.emitTick());
    a.addEventListener("play", () => {
      if (!this.currentItem()) return;
      this.emit({ type: "playing", playing: true, currentId: this.currentItem()?.id });
    });
    a.addEventListener("pause", () => {
      if (!this.currentItem()) return; // stale event after stop()
      if (this.suppressNextPause) {
        this.suppressNextPause = false;
        return;
      }
      this.emit({ type: "playing", playing: false, currentId: this.currentItem()?.id });
    });
    a.addEventListener("ended", () => this.onEnded());
    a.addEventListener("error", () => {
      this.emit({ type: "error", currentId: this.currentItem()?.id });
    });
    this.audio = a;
    return a;
  }

  private emitTick(): void {
    const a = this.audio;
    if (!a) return;
    const item = this.currentItem();
    const dur =
      Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : item?.durationMs ?? 0;
    this.emit({
      type: "tick",
      positionMs: Math.max(0, a.currentTime * 1000),
      durationMs: dur,
      playing: !a.paused,
      currentId: item?.id,
    });
  }

  private onEnded(): void {
    const item = this.currentItem();
    if (!item || this.queue.length === 0) return;
    this.suppressNextPause = true;
    if (this.stopAtEnd) {
      this.emit({ type: "ended", currentId: item.id });
      return;
    }
    if (this.repeatMode === "one") {
      // Replay the same item; the store's position resets via the tick.
      const a = this.audio;
      if (a) {
        a.currentTime = 0;
        void a.play().catch(() => undefined);
      }
      return;
    }
    if (this.repeatMode === "off" && !this.shuffle && this.index >= this.queue.length - 1) {
      this.emit({ type: "ended", currentId: item.id });
      return;
    }
    const nextIndex = this.pickNextIndex();
    const nextItem = this.queue[nextIndex];
    this.index = nextIndex;
    this.emit({ type: "transition", previousId: item.id, currentId: nextItem.id });
    void this.load(nextItem, 0, true);
  }

  private pickNextIndex(): number {
    if (this.shuffle && this.queue.length > 1) {
      let n = this.index;
      while (n === this.index) n = Math.floor(Math.random() * this.queue.length);
      return n;
    }
    return (this.index + 1) % this.queue.length;
  }

  private async load(item: EngineQueueItem, startPositionMs: number, autoplay: boolean): Promise<void> {
    const audio = this.ensureAudio();
    const seq = ++this.loadSeq;
    let src: string;
    try {
      src = await this.resolveFileSrc(item.path);
    } catch {
      if (seq === this.loadSeq) this.emit({ type: "error", currentId: item.id });
      return;
    }
    if (seq !== this.loadSeq) return; // superseded while resolving the URL
    audio.src = src;
    const begin = () => {
      if (seq !== this.loadSeq) return; // a newer load won meanwhile
      if (startPositionMs > 0) audio.currentTime = startPositionMs / 1000;
      if (autoplay) {
        void audio.play().catch(() => {
          this.emit({ type: "playing", playing: false, currentId: item.id });
        });
      }
    };
    if (audio.readyState >= 1) begin();
    else audio.addEventListener("loadedmetadata", begin, { once: true });
  }

  setQueue(items: EngineQueueItem[], startIndex: number, startPositionMs: number, autoplay: boolean): void {
    if (items.length > 0 && sameQueueIds(items, this.queue)) {
      const idx = Math.min(Math.max(0, startIndex), items.length - 1);
      const prev = this.currentItem();
      this.index = idx;
      const item = items[idx];
      if (prev && prev.id !== item.id) {
        this.emit({ type: "transition", previousId: prev.id, currentId: item.id });
      }
      void this.load(item, startPositionMs, autoplay);
      return;
    }
    this.queue = items;
    if (items.length === 0) {
      this.index = -1;
      return;
    }
    this.index = Math.min(Math.max(0, startIndex), items.length - 1);
    void this.load(items[this.index], startPositionMs, autoplay);
  }

  syncQueue(items: EngineQueueItem[]): void {
    const cur = this.currentItem();
    this.queue = items;
    if (cur) {
      const idx = items.findIndex((i) => i.id === cur.id);
      if (idx >= 0) this.index = idx;
      // If the current id vanished the store stops playback itself.
    }
  }

  play(): void {
    if (!this.audio || !this.currentItem()) return;
    void this.audio.play().catch(() => undefined);
  }

  pause(): void {
    this.audio?.pause();
  }

  next(): void {
    this.stepEngine(1);
  }

  previous(): void {
    this.stepEngine(-1);
  }

  private stepEngine(dir: 1 | -1): void {
    if (this.queue.length === 0 || this.index < 0) return;
    const prev = this.currentItem();
    // Manual next under shuffle jumps randomly (repeat-one never traps
    // the transport buttons); previous stays sequential.
    this.index = dir === 1 && this.shuffle
      ? this.pickNextIndex()
      : (this.index + dir + this.queue.length) % this.queue.length;
    const item = this.queue[this.index];
    this.emit({ type: "transition", previousId: prev?.id, currentId: item.id });
    void this.load(item, 0, true);
  }

  seekTo(ms: number): void {
    if (this.audio) this.audio.currentTime = Math.max(0, ms) / 1000;
  }

  seekBy(deltaMs: number): void {
    if (this.audio) {
      this.audio.currentTime = Math.max(0, this.audio.currentTime + deltaMs / 1000);
    }
  }

  setVolume(v: number): void {
    this.pendingVolume = v;
    if (this.audio) this.audio.volume = v;
  }

  setSpeed(s: number): void {
    this.pendingSpeed = s;
    if (this.audio) this.audio.playbackRate = s;
  }

  setStopAtTrackEnd(enabled: boolean): void {
    this.stopAtEnd = enabled;
  }

  setRepeatMode(mode: RepeatMode): void {
    this.repeatMode = mode;
  }

  setShuffle(enabled: boolean): void {
    this.shuffle = enabled;
  }

  readonly hasNativeSleepTimer = false;

  setSleepTimer(_deadlineMs: number | null, _fadeOutSeconds: number): void {
    // No native side exists; the store enforces expiry with its own tick.
  }

  stop(): void {
    this.loadSeq++;
    this.queue = [];
    this.index = -1;
    const a = this.audio;
    if (a) {
      this.suppressNextPause = true;
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
  }

  onEvent(cb: (e: EngineEvent) => void): void {
    this.cb = cb;
  }
}

/* --------------------------------- factory ---------------------------------- */

export function createPlaybackEngine(deps: PlaybackEngineDeps = {}): PlaybackEngine {
  const android = deps.android ?? isAndroid();
  return android ? new NativeAudioEngine(deps) : new WebAudioEngine(deps);
}
