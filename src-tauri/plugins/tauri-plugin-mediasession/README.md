# tauri-plugin-mediasession

In-repo Tauri 2 plugin: native Android playback for Pulse.

The plugin owns the real player, the way production Android
music apps do it (Auxio, Gramophone, React Native Track Player): an
ExoPlayer inside a Media3 `MediaSessionService`. The WebView is only a
controller — it sends queue/transport commands and renders the state the
service pushes back. On desktop the plugin is a no-op; the web playback
engine (HTMLAudioElement) plays there instead.

| Layer | Role |
|---|---|
| `src/` (Rust) | Commands `set_queue` / `play` / `pause` / `next` / `previous` / `seek_to` / `seek_by` / `set_volume` / `set_speed` / `set_stop_at_track_end` / `stop_playback` / `get_state`; no-ops on desktop |
| `android/` (Kotlin) | `PulsePlaybackService` — a Media3 `MediaSessionService` (foreground type `mediaPlayback`) hosting ExoPlayer (audio focus + becoming-noisy handled, `WAKE_MODE_LOCAL`); Media3 generates the media notification from the real player state (title, artist, prev / play-pause / next; tap opens the app) |
| `guest-js/` | Raw command wrappers (the app uses the engines in `src/utils/playbackEngine.ts`) |

## Protocol

Commands (JS → Rust → Kotlin, `{ payload }`-wrapped like all Pulse plugin
calls; no-payload commands take no argument):

| Command | Payload | Effect |
|---|---|---|
| `set_queue` | `{ items: [{id, uri, title, artist, album, durationMs}], startIndex, startPositionMs, autoplay, preserve }` | Replace the queue (uri gets a `file://` prefix when it has no scheme). `preserve: true` re-syncs the list keeping the current item, position and playWhenReady. If the service is not running yet, the queue is parked in `PlaybackStore.pendingQueue`, the service is started, and it applies the queue in `onCreate` |
| `play` / `pause` / `next` / `previous` | — | Transport; next/previous are `seekToNext/PreviousMediaItem` |
| `seek_to` | `{ positionMs }` | Absolute seek in the current item |
| `seek_by` | `{ deltaMs }` | Relative seek from the current position |
| `set_volume` | `{ volume }` | Player volume 0..1 |
| `set_speed` | `{ speed }` | Playback speed |
| `set_stop_at_track_end` | `{ enabled }` | Sleep-timer end-of-track mode (see below) |
| `stop_playback` | — | Stop + clear the player, stop the service |
| `get_state` | — | Returns `{ playing, positionMs, durationMs, currentId, ended }` |

Events (Kotlin → JS, `trigger("playback-event")`): state snapshots
`{ type: "event", currentId, previousId?, playing, positionMs, durationMs, ended, error? }`
emitted on media-item transitions (with the outgoing item's id),
play/pause flips, playback-state changes and player errors. The JS
native engine also polls `get_state` every 500ms while a queue is loaded
and merges both sources into its own event stream.

## Semantics

- **Wrap-around queue**: the player runs `REPEAT_MODE_ALL`, mirroring the
  app's queue semantics — next/previous wrap and a track end
  auto-advances with wrap. There is no shuffle/repeat setting.
- **Stop at track end** (sleep timer): enabling sets `REPEAT_MODE_OFF`
  and collapses the player's list to the current item, so playback truly
  ends at the track end (`STATE_ENDED` → an `ended` snapshot). Disabling
  restores `REPEAT_MODE_ALL`; if the list was collapsed, the service
  emits `{ type: "needs-queue-restore" }` and the JS engine answers with
  a preserve `set_queue` of the full queue. While collapsed, preserve
  re-syncs are ignored natively (the restore path re-syncs instead).
- The service runs while a queue is loaded; `onTaskRemoved` stops it
  when nothing is playing. Android 13+ `POST_NOTIFICATIONS` is declared
  in the plugin's `@TauriPlugin` permissions and requested from JS once.
