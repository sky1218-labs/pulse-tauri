import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Track, Playlist } from "./utils/playlist";
import { dedupeTracks, addTracksToPlaylist, removeTrackFromQueue, ensureFolderPlaylists, displayTitle } from "./utils/playlist";
import { canonicalize } from "./utils/audioPath";
import {
  loadLibrary, saveLibrary, clearLibraryStorage, newId,
  loadSleepDeadline, saveSleepDeadline,
  type LibraryData, type Settings, DEFAULT_SETTINGS,
} from "./repository";
import { translate, type LocaleCode } from "./i18n";
import {
  startSleepTimer, remainingMs, isExpired, fadeProgress, type SleepTimerState,
} from "./utils/sleepTimer";
import { calculateFadeOutVolume, clampVolume } from "./utils/volume";
import { clampSpeed } from "./utils/playbackSpeed";
import { MediaSessionController } from "./utils/mediaSession";
import {
  createPlaybackEngine,
  type EngineEvent, type EngineQueueItem, type PlaybackEngine, type RepeatMode,
} from "./utils/playbackEngine";
import { tap } from "./utils/haptics";

/* ---------------------------------- library --------------------------------- */

interface LibraryCtx {
  data: LibraryData;
  tracksById: Map<string, Track>;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: LocaleCode;
  importTracks: (tracks: Track[]) => { added: number; total: number };
  /** Folder imports: ensure one playlist per folder group (by name), holding that folder's tracks. Paths are resolved against the library after import. */
  importFolderPlaylists: (groups: { name: string; paths: string[] }[]) => void;
  removeTrackFromLibrary: (trackId: string) => void;
  clearLibrary: () => void;
  createPlaylist: (name: string) => Playlist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  setPlaylistTracks: (playlist: Playlist) => void;
  addToPlaylist: (playlistId: string, tracks: Track[]) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleFavorite: (trackId: string) => void;
  resetSettings: () => void;
  clearAllData: () => void;
  savePosition: (path: string, ms: number) => void;
  clearPosition: (path: string) => void;
}

const LibraryContext = createContext<LibraryCtx | null>(null);
export const useLibrary = () => {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary outside provider");
  return ctx;
};

/* ---------------------------------- player ---------------------------------- */

export interface ResumePrompt {
  track: Track;
  positionMs: number;
  queue: Track[];
}

interface PlayerCtx {
  current: Track | null;
  queue: Track[];
  playing: boolean;
  volume: number;
  speed: number;
  sleepTimer: SleepTimerState | null;
  sleepRemainingMs: number | null;
  resumePrompt: ResumePrompt | null;
  playTrack: (track: Track, queue: Track[], opts?: { fromUserTap?: boolean }) => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
  skipForward: () => void;
  skipBackward: () => void;
  setVolume: (v: number) => void;
  setSpeed: (s: number) => void;
  repeatMode: RepeatMode;
  shuffle: boolean;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  startSleep: (durationMs: number) => void;
  stopSleep: () => void;
  answerResume: (resume: boolean) => void;
  dismissResume: () => void;
}

const PlayerContext = createContext<PlayerCtx | null>(null);
export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer outside provider");
  return ctx;
};

/* Playback progress lives in its own context: it changes twice a second
   while playing, and keeping it inside PlayerCtx re-rendered every
   usePlayer() consumer (the whole track list included) on every tick.
   Only true progress displays (mini-player bar, player screen) subscribe
   here; everything else reads the stable player context above. */
export interface ProgressCtx {
  positionMs: number;
  durationMs: number;
}

const ProgressContext = createContext<ProgressCtx>({ positionMs: 0, durationMs: 0 });
export const useProgress = () => useContext(ProgressContext);

function toEngineItem(track: Track): EngineQueueItem {
  return {
    id: track.id,
    path: track.path,
    title: displayTitle(track),
    artist: track.artist ?? "",
    album: track.album ?? "",
    durationMs: track.durationMs,
  };
}

/* --------------------------------- providers -------------------------------- */

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<LibraryData>(() => loadLibrary());
  const dataRef = useRef(data);
  /* Positions are the hottest writes in the app (every 5s tick, every
     seek, every pause). Routing them through setDataState re-rendered the
     whole library and synchronously JSON-serialized it to localStorage
     each time. They now live in this ref: writes are O(1), never trigger
     a render, and persistence is debounced into one save. setData merges
     the ref back in, and structural edits that change positions
     (remove track / clear library) replace the ref. */
  const positionsRef = useRef(data.positions);
  const persistTimerRef = useRef<number | null>(null);
  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      saveLibrary(dataRef.current);
    }, 800);
  }, []);
  const flushPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    saveLibrary(dataRef.current);
  }, []);
  const flushPersistRef = useRef(flushPersist);
  flushPersistRef.current = flushPersist;
  const savePositionFast = useCallback((path: string, ms: number) => {
    const key = canonicalize(path);
    const value = Math.floor(ms);
    if (positionsRef.current[key] === value) return;
    positionsRef.current = { ...positionsRef.current, [key]: value };
    dataRef.current = { ...dataRef.current, positions: positionsRef.current };
    schedulePersist();
  }, [schedulePersist]);
  const resetPositionsFast = useCallback(() => {
    positionsRef.current = {};
    dataRef.current = { ...dataRef.current, positions: positionsRef.current };
    schedulePersist();
  }, [schedulePersist]);
  const clearPositionFast = useCallback((path: string) => {
    const key = canonicalize(path);
    if (!(key in positionsRef.current)) return;
    const next = { ...positionsRef.current };
    delete next[key];
    positionsRef.current = next;
    dataRef.current = { ...dataRef.current, positions: next };
    schedulePersist();
  }, [schedulePersist]);
  // Assigned by the player section below; lets library mutations that remove
  // content (remove track / clear library / clear all data) stop playback of
  // something that no longer exists instead of leaving a ghost playing.
  const stopPlaybackRef = useRef<() => void>(() => {});
  const trackRemovedRef = useRef<(trackId: string) => void>(() => {});
  const setData = useCallback((updater: (d: LibraryData) => LibraryData) => {
    setDataState((prev) => {
      const raw = updater(prev);
      // An updater that touched positions wins and becomes the new ref;
      // otherwise the ref (which may hold newer tick/seek writes than the
      // state copy) is merged back so a structural save never rolls a
      // position backwards.
      const next = raw.positions !== prev.positions
        ? raw
        : { ...raw, positions: positionsRef.current };
      if (raw.positions !== prev.positions) positionsRef.current = raw.positions;
      dataRef.current = next;
      schedulePersist();
      return next;
    });
  }, [schedulePersist]);

  const tracksById = useMemo(() => new Map(data.tracks.map((t) => [t.id, t])), [data.tracks]);
  const locale = data.settings.locale;
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.darkMode ? "dark" : "light";
  }, [data.settings.darkMode]);

  const library = useMemo<LibraryCtx>(() => ({
    data, tracksById, t, locale,
    importTracks: (incoming) => {
      let added = 0;
      setData((d) => {
        const before = d.tracks.length;
        const merged = dedupeTracks([...d.tracks, ...incoming]);
        added = merged.length - before;
        return { ...d, tracks: merged };
      });
      return { added, total: incoming.length };
    },
    importFolderPlaylists: (groups) => {
      const byPath = new Map(dataRef.current.tracks.map((tr) => [canonicalize(tr.path), tr.id]));
      const resolved = groups.map((g) => ({
        name: g.name,
        trackIds: g.paths
          .map((p) => byPath.get(canonicalize(p)))
          .filter((id): id is string => !!id),
      }));
      setData((d) => ({ ...d, playlists: ensureFolderPlaylists(d.playlists, resolved, newId) }));
    },
    removeTrackFromLibrary: (trackId) => {
      // The position delete goes through clearPositionFast: rebuilding
      // positions from the state copy here would roll back every tick /
      // seek write that only exists in positionsRef so far.
      const removed = dataRef.current.tracks.find((x) => x.id === trackId);
      setData((d) => ({
        ...d,
        tracks: d.tracks.filter((x) => x.id !== trackId),
        playlists: d.playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((id) => id !== trackId) })),
      }));
      if (removed) clearPositionFast(removed.path);
      trackRemovedRef.current(trackId);
    },
    clearLibrary: () => {
      setData((d) => ({ ...d, tracks: [], playlists: d.playlists.map((p) => ({ ...p, trackIds: [] })) }));
      resetPositionsFast();
      stopPlaybackRef.current();
    },
    createPlaylist: (name) => {
      const p: Playlist = { id: newId(), name, trackIds: [], createdAt: Date.now(), updatedAt: Date.now() };
      setData((d) => ({ ...d, playlists: [...d.playlists, p] }));
      return p;
    },
    renamePlaylist: (id, name) =>
      setData((d) => ({ ...d, playlists: d.playlists.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p)) })),
    deletePlaylist: (id) => setData((d) => ({ ...d, playlists: d.playlists.filter((p) => p.id !== id) })),
    setPlaylistTracks: (playlist) =>
      setData((d) => ({ ...d, playlists: d.playlists.map((p) => (p.id === playlist.id ? playlist : p)) })),
    addToPlaylist: (playlistId, tracks) =>
      setData((d) => ({
        ...d,
        playlists: d.playlists.map((p) => {
          if (p.id !== playlistId) return p;
          const byPath = new Map(d.tracks.map((x) => [canonicalize(x.path), x]));
          return addTracksToPlaylist(p, tracks, byPath);
        }),
      })),
    updateSettings: (patch) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    toggleFavorite: (trackId) =>
      setData((d) => ({
        ...d,
        tracks: d.tracks.map((tr) => (tr.id === trackId ? { ...tr, favorite: !tr.favorite } : tr)),
      })),
    resetSettings: () => setData((d) => ({ ...d, settings: { ...DEFAULT_SETTINGS, locale: d.settings.locale } })),
    clearAllData: () => {
      clearLibraryStorage();
      const fresh = loadLibrary();
      positionsRef.current = fresh.positions;
      dataRef.current = fresh;
      setDataState(fresh);
      stopPlaybackRef.current();
    },
    savePosition: savePositionFast,
    clearPosition: clearPositionFast,
  }), [data, tracksById, t, locale, setData, savePositionFast, clearPositionFast, resetPositionsFast]);

  const libraryRef = useRef(library);
  libraryRef.current = library;

  /* ------------------------------ player state ----------------------------- */
  // The playback engine is the store's only window into actual playback:
  // a native ExoPlayer (in the mediasession plugin's service) on Android,
  // an HTMLAudioElement wrapper everywhere else.
  const engineRef = useRef<PlaybackEngine | null>(null);
  if (engineRef.current === null) engineRef.current = createPlaybackEngine();
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>(data.settings.repeatMode);
  const [shuffle, setShuffleState] = useState(data.settings.shuffleEnabled);
  const [volume, setVolumeState] = useState(data.settings.defaultVolume);
  const [speed, setSpeedState] = useState(data.settings.defaultPlaybackSpeed);
  const [sleepTimer, setSleepTimer] = useState<SleepTimerState | null>(null);
  const [sleepRemainingMs, setSleepRemainingMs] = useState<number | null>(null);
  const [resumePrompt, setResumePrompt] = useState<ResumePrompt | null>(null);
  const currentRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  const lastSaveRef = useRef(0);
  /** Last known playback position (mirror of positionMs state) for saves. */
  const positionMsRef = useRef(0);
  /** The track that just finished; its trailing pause flip must not
   *  re-save its position at ~100% (finished tracks restart from 0). */
  const endedTrackRef = useRef<string | null>(null);
  /** Track ids the store itself is switching to (tap / step): a transition
   *  into one of these is not a finish, so it must not clear the outgoing
   *  track's saved position the way an auto-advance does. */
  const initiatedIdsRef = useRef<string[]>([]);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  // Media Session (OS notification / lock-screen controls where the WebView
  // surfaces them) + a ref to the latest player object for its handlers.
  const msRef = useRef<MediaSessionController | null>(null);
  if (msRef.current === null) msRef.current = MediaSessionController.create();
  const lastMsPosRef = useRef(0);
  const playerRef = useRef<PlayerCtx | null>(null);

  const startPlayback = useCallback((track: Track, q: Track[], startAtMs: number) => {
    const engine = engineRef.current!;
    // Switching tracks: persist the outgoing track's position first (the
    // old element flow got this from the element's pause event).
    const outgoing = currentRef.current;
    if (outgoing && outgoing.id !== track.id) {
      libraryRef.current.savePosition(outgoing.path, positionMsRef.current);
    }
    initiatedIdsRef.current.push(track.id);
    currentRef.current = track;
    queueRef.current = q;
    setCurrent(track);
    setQueue(q);
    setPositionMs(startAtMs);
    positionMsRef.current = startAtMs;
    setDurationMs(track.durationMs);
    lastSaveRef.current = 0; // let the new track's first tick save promptly
    engine.setVolume(clampVolume(volume));
    engine.setSpeed(clampSpeed(speed));
    engine.setQueue(
      q.map(toEngineItem),
      q.findIndex((x) => x.id === track.id),
      startAtMs,
      true,
    );
  }, [speed, volume]);

  // Keep the player consistent when library content disappears.
  stopPlaybackRef.current = () => {
    engineRef.current!.stop();
    currentRef.current = null;
    queueRef.current = [];
    setCurrent(null);
    setQueue([]);
    setPlaying(false);
    setPositionMs(0);
    positionMsRef.current = 0;
    setDurationMs(0);
    setSleepTimer(null);
    setResumePrompt(null);
  };
  trackRemovedRef.current = (trackId) => {
    if (currentRef.current?.id === trackId) {
      stopPlaybackRef.current();
    } else if (queueRef.current.some((x) => x.id === trackId)) {
      const q = removeTrackFromQueue(queueRef.current, trackId);
      queueRef.current = q;
      setQueue(q);
      engineRef.current!.syncQueue(q.map(toEngineItem));
    }
  };

  const playTrack = useCallback(async (track: Track, q: Track[], opts?: { fromUserTap?: boolean }) => {
    const settings = dataRef.current.settings;
    const saved = positionsRef.current[canonicalize(track.path)] ?? 0;
    const hasProgress = saved > 5_000 && (track.durationMs === 0 || saved < track.durationMs - 5_000);
    if (opts?.fromUserTap && hasProgress && settings.autoResume && settings.resumePlaybackOnTrackTap) {
      setResumePrompt({ track, positionMs: saved, queue: q });
      return;
    }
    await startPlayback(track, q, settings.autoResume && hasProgress ? saved : 0);
  }, [startPlayback]);

  const step = useCallback((dir: 1 | -1) => {
    const q = queueRef.current;
    const cur = currentRef.current;
    if (!cur || q.length === 0) return;
    const idx = q.findIndex((x) => x.id === cur.id);
    const nxt = q[(idx + dir + q.length) % q.length];
    if (!nxt) return;
    // A manual step is not a finish: save the outgoing position and mark
    // the destination as store-initiated so the incoming transition does
    // not clear it (auto-advance transitions do clear — see the engine
    // event handler).
    libraryRef.current.savePosition(cur.path, positionMsRef.current);
    initiatedIdsRef.current.push(nxt.id);
    if (dir === 1) engineRef.current!.next();
    else engineRef.current!.previous();
  }, []);

  // Engine events drive all playback state. Subscribed once; the handler
  // reads through refs so it never goes stale.
  useEffect(() => {
    const engine = engineRef.current!;
    const onEvent = (e: EngineEvent) => {
      switch (e.type) {
        case "tick": {
          const cur = currentRef.current;
          if (!cur) return;
          const pos = e.positionMs ?? positionMsRef.current;
          const dur = e.durationMs && e.durationMs > 0 ? e.durationMs : cur.durationMs;
          positionMsRef.current = pos;
          setPositionMs((prev) => (prev === pos ? prev : pos));
          setDurationMs((prev) => (prev === dur ? prev : dur));
          const now = Date.now();
          if (now - lastSaveRef.current > 5_000) {
            lastSaveRef.current = now;
            libraryRef.current.savePosition(cur.path, pos);
          }
          if (now - lastMsPosRef.current > 500) {
            lastMsPosRef.current = now;
            msRef.current?.setPosition(dur, pos, speedRef.current);
          }
          break;
        }
        case "transition": {
          // A transition into a store-initiated track (tap / step) is not
          // a finish; an auto-advance transition is — the finished track's
          // saved position is cleared so it restarts from 0 next time.
          const isInitiated = e.currentId
            ? initiatedIdsRef.current.includes(e.currentId)
            : false;
          if (e.currentId) {
            initiatedIdsRef.current = initiatedIdsRef.current.filter((id) => id !== e.currentId);
          }
          if (e.previousId) {
            initiatedIdsRef.current = initiatedIdsRef.current.filter((id) => id !== e.previousId);
            if (!isInitiated) {
              const prev = queueRef.current.find((x) => x.id === e.previousId);
              if (prev) libraryRef.current.clearPosition(prev.path);
              endedTrackRef.current = e.previousId;
            }
          }
          const next = e.currentId
            ? queueRef.current.find((x) => x.id === e.currentId)
            : undefined;
          if (next) {
            currentRef.current = next;
            setCurrent(next);
            setPositionMs(0);
            positionMsRef.current = 0;
            setDurationMs(next.durationMs);
          }
          lastSaveRef.current = 0;
          break;
        }
        case "playing": {
          if (e.playing) {
            endedTrackRef.current = null;
            setPlaying(true);
          } else {
            setPlaying(false);
            const cur = currentRef.current;
            // When a track ends, a pause flip trails it — but the finish
            // already cleared the saved position; re-saving here would
            // resurrect it at ~100% and break the restart rule.
            if (cur && endedTrackRef.current !== cur.id) {
              libraryRef.current.savePosition(cur.path, positionMsRef.current);
            }
          }
          break;
        }
        case "ended": {
          // Playback stopped at a track end (sleep timer stop-at-end):
          // the finished track restarts from 0 next time, and an
          // end-of-track sleep timer is consumed.
          const cur = currentRef.current;
          if (cur) {
            libraryRef.current.clearPosition(cur.path);
            endedTrackRef.current = cur.id;
          }
          setSleepTimer((timer) => (timer?.endOfTrack ? null : timer));
          setPlaying(false);
          break;
        }
        case "error": {
          setPlaying(false);
          break;
        }
        case "needs-queue-restore": {
          // Handled inside the native engine, which re-syncs its queue.
          break;
        }
      }
    };
    engine.onEvent(onEvent);
    // Android can kill a backgrounded WebView without a pause — persist
    // the position as soon as the page is hidden.
    const saveNow = () => {
      const cur = currentRef.current;
      if (cur && endedTrackRef.current !== cur.id) {
        libraryRef.current.savePosition(cur.path, positionMsRef.current);
      }
      // The page may be gone before the debounce fires — flush now.
      flushPersistRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const sleepTimerRef = useRef<SleepTimerState | null>(null);
  sleepTimerRef.current = sleepTimer;

  // sleep timer tick (250ms): expiry + optional fade-out
  useEffect(() => {
    if (!sleepTimer) {
      setSleepRemainingMs(null);
      return;
    }
    const id = window.setInterval(() => {
      const timer = sleepTimerRef.current;
      if (!timer) return;
      setSleepRemainingMs(timer.endOfTrack ? null : remainingMs(timer));
      const engine = engineRef.current!;
      if (engine.hasNativeSleepTimer) {
        // Expiry and the fade-out are enforced by the native playback
        // service (the WebView's timers freeze in the background, the
        // service does not). This tick only mirrors the countdown and
        // clears the UI state once the deadline has passed — the pause
        // itself has already happened natively by then.
        if (isExpired(timer)) {
          saveSleepDeadline(null);
          setSleepTimer(null);
        }
        return;
      }
      const fade = fadeProgress(timer, dataRef.current.settings.sleepTimerFadeOutSeconds);
      if (fade !== null) {
        engine.setVolume(calculateFadeOutVolume(clampVolume(volume), fade));
      }
      if (isExpired(timer)) {
        engine.pause();
        engine.setVolume(clampVolume(volume));
        setSleepTimer(null);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [sleepTimer, volume]);

  // Rehydrate a sleep deadline that outlived the WebView (the app was
  // killed after arming): the native service kept it and will still fire;
  // the UI rebuilds its countdown from the persisted deadline and
  // re-arms the engine idempotently. A past deadline is just dropped —
  // the native side already paused (or dropped it on service start).
  const sleepRehydratedRef = useRef(false);
  useEffect(() => {
    if (sleepRehydratedRef.current) return;
    sleepRehydratedRef.current = true;
    const deadline = loadSleepDeadline();
    if (deadline === null) return;
    const now = Date.now();
    if (deadline <= now) {
      saveSleepDeadline(null);
      return;
    }
    const settings = dataRef.current.settings;
    setSleepTimer({
      durationMs: deadline - now,
      startedAt: now,
      fadeOutEnabled: settings.sleepTimerFadeOutEnabled,
      endOfTrack: false,
    });
    engineRef.current!.setSleepTimer(
      deadline,
      settings.sleepTimerFadeOutEnabled ? settings.sleepTimerFadeOutSeconds : 0,
    );
  }, []);

  // An armed end-of-track sleep timer switches the engine into
  // stop-at-track-end mode (native: queue collapse + repeat off; web:
  // flag on the element wrapper); clearing the timer restores normal
  // wrap-around playback.
  useEffect(() => {
    engineRef.current!.setStopAtTrackEnd(!!sleepTimer?.endOfTrack);
  }, [sleepTimer]);

  // Repeat/shuffle preferences live in settings; the engines own the
  // actual behaviour (ExoPlayer modes natively, the onEnded/step logic
  // in the web engine).
  useEffect(() => {
    engineRef.current!.setRepeatMode(repeatMode);
    engineRef.current!.setShuffle(shuffle);
  }, [repeatMode, shuffle]);

  const player = useMemo<PlayerCtx>(() => ({
    current, queue, playing, volume, speed, repeatMode, shuffle,
    sleepTimer, sleepRemainingMs, resumePrompt,
    playTrack,
    togglePlay: () => {
      if (!current) return;
      tap();
      // Optimistic flip: the button must respond on the tap itself, not
      // after the native state snapshot makes its round trip — a slow or
      // dropped snapshot otherwise reads as a stuck button. Engine events
      // reconcile if reality disagrees.
      if (playing) {
        engineRef.current!.pause();
        setPlaying(false);
      } else {
        engineRef.current!.play();
        setPlaying(true);
      }
    },
    next: () => { tap(); step(1); },
    previous: () => { tap(); step(-1); },
    seek: (ms) => {
      const durMs = durationMs > 0 ? durationMs : ms;
      const clamped = Math.min(Math.max(0, ms), durMs);
      engineRef.current!.seekTo(clamped);
      setPositionMs(clamped);
      positionMsRef.current = clamped;
      // Save immediately: the periodic tick save is throttled and a
      // kill right after a seek would otherwise restore the old position.
      if (currentRef.current) library.savePosition(currentRef.current.path, clamped);
    },
    skipForward: () => {
      engineRef.current!.seekBy(dataRef.current.settings.skipForwardSeconds * 1000);
    },
    skipBackward: () => {
      engineRef.current!.seekBy(-dataRef.current.settings.skipBackwardSeconds * 1000);
    },
    setVolume: (v) => {
      const cv = clampVolume(v);
      setVolumeState(cv);
      engineRef.current!.setVolume(cv);
    },
    setSpeed: (s) => {
      const cs = clampSpeed(s);
      setSpeedState(cs);
      engineRef.current!.setSpeed(cs);
    },
    cycleRepeat: () => {
      tap();
      const next: RepeatMode = repeatMode === "all" ? "one" : repeatMode === "one" ? "off" : "all";
      setRepeatModeState(next);
      setData((d) => ({ ...d, settings: { ...d.settings, repeatMode: next } }));
    },
    toggleShuffle: () => {
      tap();
      const next = !shuffle;
      setShuffleState(next);
      setData((d) => ({ ...d, settings: { ...d.settings, shuffleEnabled: next } }));
    },
    playNext: (track) => {
      if (!current || queue.length === 0) {
        void playTrack(track, [track], { fromUserTap: true });
        return;
      }
      // De-duplicate first: re-queueing the same track moves it.
      const without = queue.filter((q) => q.id !== track.id);
      const curIdx = without.findIndex((q) => q.id === current.id);
      const next = [...without.slice(0, curIdx + 1), track, ...without.slice(curIdx + 1)];
      setQueue(next);
      engineRef.current!.syncQueue(next.map(toEngineItem));
    },
    addToQueue: (track) => {
      if (!current || queue.length === 0) {
        void playTrack(track, [track], { fromUserTap: true });
        return;
      }
      if (queue.some((q) => q.id === track.id)) return;
      const next = [...queue, track];
      setQueue(next);
      engineRef.current!.syncQueue(next.map(toEngineItem));
    },
    startSleep: (ms) => {
      const settings = dataRef.current.settings;
      setSleepTimer(startSleepTimer(ms, settings.sleepTimerFadeOutEnabled));
      if (ms > 0) {
        // Timed mode: hand the deadline to the native service (it fires
        // even with the WebView frozen/dead) and persist it so a relaunch
        // can rebuild the countdown. End-of-track mode (ms === 0) stays
        // on the engine's stop-at-track-end path instead.
        const deadline = Date.now() + ms;
        saveSleepDeadline(deadline);
        engineRef.current!.setSleepTimer(
          deadline,
          settings.sleepTimerFadeOutEnabled ? settings.sleepTimerFadeOutSeconds : 0,
        );
      }
    },
    stopSleep: () => {
      setSleepTimer(null);
      saveSleepDeadline(null);
      engineRef.current!.setSleepTimer(null, 0);
      engineRef.current!.setVolume(clampVolume(volume));
    },
    answerResume: (resume) => {
      setResumePrompt((prompt) => {
        if (prompt) void startPlayback(prompt.track, prompt.queue, resume ? prompt.positionMs : 0);
        return null;
      });
    },
    dismissResume: () => setResumePrompt(null),
  }), [current, queue, playing, volume, speed, repeatMode, shuffle, sleepTimer, sleepRemainingMs, resumePrompt, playTrack, step, startPlayback]);

  playerRef.current = player;

  // Media Session: bind OS transport handlers once (they delegate through
  // playerRef so they never go stale); keep metadata + playback state
  // synced. On Android the native engine's Media3 session is the OS
  // surface; this web Media Session covers the platforms that expose it.
  useEffect(() => {
    const engine = engineRef.current!;
    const actions = {
      play: () => engine.play(),
      pause: () => engine.pause(),
      next: () => playerRef.current?.next(),
      previous: () => playerRef.current?.previous(),
      seek: (ms: number) => playerRef.current?.seek(ms),
      skipForward: () => playerRef.current?.skipForward(),
      skipBackward: () => playerRef.current?.skipBackward(),
    };
    msRef.current?.bindActions(actions);
  }, []);

  useEffect(() => {
    msRef.current?.setTrack(current);
  }, [current]);

  useEffect(() => {
    const state = !current ? "none" : playing ? "playing" : "paused";
    msRef.current?.setPlaybackState(state);
  }, [current, playing]);

  const progress = useMemo<ProgressCtx>(() => ({ positionMs, durationMs }), [positionMs, durationMs]);

  return (
    <LibraryContext.Provider value={library}>
      <PlayerContext.Provider value={player}>
        <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
      </PlayerContext.Provider>
    </LibraryContext.Provider>
  );
}

export type { Track, Playlist };
