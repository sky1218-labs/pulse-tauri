import { invoke, addPluginListener, type PluginListener } from "@tauri-apps/api/core";

/**
 * Guest API for tauri-plugin-mediasession. Pulse's app code uses the
 * playback engines in `src/utils/playbackEngine.ts`; this mirrors the raw
 * commands. Since 0.1.11 the plugin drives a native ExoPlayer inside a
 * Media3 MediaSessionService — JS is a controller, not the player.
 */

export interface QueueItem {
  id: string;
  /** Raw file path (Kotlin prefixes file://) or URL. */
  uri: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
}

export interface SetQueuePayload {
  items: QueueItem[];
  startIndex: number;
  startPositionMs: number;
  autoplay: boolean;
  /** Keep the current item/position/playWhenReady; only swap the list. */
  preserve: boolean;
}

export interface PlaybackState {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  currentId: string;
  ended: boolean;
}

/** A `playback-event` trigger payload: a state snapshot plus event fields. */
export interface PlaybackEvent extends PlaybackState {
  type: "event" | "needs-queue-restore";
  previousId?: string;
  error?: string;
}

const cmd = (name: string) => `plugin:mediasession|${name}`;

export async function setQueue(payload: SetQueuePayload): Promise<void> {
  await invoke(cmd("set_queue"), { payload });
}

export async function play(): Promise<void> {
  await invoke(cmd("play"));
}

export async function pause(): Promise<void> {
  await invoke(cmd("pause"));
}

export async function next(): Promise<void> {
  await invoke(cmd("next"));
}

export async function previous(): Promise<void> {
  await invoke(cmd("previous"));
}

export async function seekTo(positionMs: number): Promise<void> {
  await invoke(cmd("seek_to"), { payload: { positionMs } });
}

export async function seekBy(deltaMs: number): Promise<void> {
  await invoke(cmd("seek_by"), { payload: { deltaMs } });
}

export async function setVolume(volume: number): Promise<void> {
  await invoke(cmd("set_volume"), { payload: { volume } });
}

export async function setSpeed(speed: number): Promise<void> {
  await invoke(cmd("set_speed"), { payload: { speed } });
}

export async function setStopAtTrackEnd(enabled: boolean): Promise<void> {
  await invoke(cmd("set_stop_at_track_end"), { payload: { enabled } });
}

export async function stopPlayback(): Promise<void> {
  await invoke(cmd("stop_playback"));
}

export async function getState(): Promise<PlaybackState> {
  return invoke<PlaybackState>(cmd("get_state"));
}

export async function onPlaybackEvent(
  handler: (event: PlaybackEvent) => void,
): Promise<PluginListener> {
  return addPluginListener("mediasession", "playback-event", handler);
}
