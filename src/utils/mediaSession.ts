import type { Track } from "./playlist";
import { displayTitle } from "./playlist";

/**
 * Media Session API integration: exposes the player to the OS (Android
 * notification shade / lock screen, desktop media keys) where the WebView
 * surfaces it. Everything is guarded — where `navigator.mediaSession` is
 * absent or a call throws, this is a silent no-op.
 */

export interface MediaSessionActions {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
  skipForward: () => void;
  skipBackward: () => void;
}

export interface MediaSessionActionDetailsLike {
  seekTime?: number | null;
  seekOffset?: number | null;
  fastSeek?: boolean | null;
}

export interface MediaSessionLike {
  metadata: unknown;
  playbackState: "none" | "paused" | "playing";
  setActionHandler: (
    action: string,
    handler: ((details: MediaSessionActionDetailsLike) => void) | null,
  ) => void;
  setPositionState?: (state: { duration: number; position: number; playbackRate: number }) => void;
}

interface MediaMetadataInitLike {
  title: string;
  artist: string;
  album: string;
  artwork?: { src: string }[];
}

type MediaMetadataCtor = new (init: MediaMetadataInitLike) => unknown;

function artworkFor(track: Track): { src: string }[] | undefined {
  const p = track.artworkPath;
  // Only URL-like artwork can go to the OS; raw filesystem paths cannot.
  if (p && /^(https?:|blob:|data:)/.test(p)) return [{ src: p }];
  return undefined;
}

export class MediaSessionController {
  constructor(private readonly session: MediaSessionLike | null) {}

  static create(): MediaSessionController {
    let session: MediaSessionLike | null = null;
    try {
      if (typeof navigator !== "undefined") {
        session = (navigator as { mediaSession?: MediaSessionLike }).mediaSession ?? null;
      }
    } catch {
      session = null;
    }
    return new MediaSessionController(session);
  }

  get available(): boolean {
    return this.session !== null;
  }

  bindActions(actions: MediaSessionActions): void {
    const ms = this.session;
    if (!ms) return;
    const set = (action: string, handler: (d: MediaSessionActionDetailsLike) => void) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action unsupported by this WebView */
      }
    };
    set("play", () => actions.play());
    set("pause", () => actions.pause());
    set("previoustrack", () => actions.previous());
    set("nexttrack", () => actions.next());
    set("seekbackward", () => actions.skipBackward());
    set("seekforward", () => actions.skipForward());
    set("seekto", (d) => {
      if (typeof d.seekTime === "number" && Number.isFinite(d.seekTime)) {
        actions.seek(d.seekTime * 1000);
      }
    });
  }

  setTrack(track: Track | null): void {
    const ms = this.session;
    if (!ms) return;
    try {
      if (!track) {
        ms.metadata = null;
        ms.playbackState = "none";
        return;
      }
      const init: MediaMetadataInitLike = {
        title: displayTitle(track),
        artist: track.artist ?? "",
        album: track.album ?? "",
        artwork: artworkFor(track),
      };
      const Ctor = (globalThis as { MediaMetadata?: MediaMetadataCtor }).MediaMetadata;
      ms.metadata = Ctor ? new Ctor(init) : init;
    } catch {
      /* metadata is best-effort */
    }
  }

  setPlaybackState(state: "none" | "paused" | "playing"): void {
    const ms = this.session;
    if (!ms) return;
    try {
      ms.playbackState = state;
    } catch {
      /* best-effort */
    }
  }

  /** duration/position in ms; the API wants seconds. Skipped for live/unknown durations. */
  setPosition(durationMs: number, positionMs: number, playbackRate: number): void {
    const ms = this.session;
    if (!ms || typeof ms.setPositionState !== "function") return;
    const duration = durationMs / 1000;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const position = Math.min(Math.max(0, positionMs / 1000), duration);
    try {
      ms.setPositionState({ duration, position, playbackRate: playbackRate || 1 });
    } catch {
      /* best-effort */
    }
  }
}
