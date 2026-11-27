# Changelog

## Compatibility policy

From 0.1.11 on, updates are compatibility-first:

- Installing a new version over an existing one preserves all user data — library, playlists, favorites, playback positions （聽到哪裡）, and settings. Data is only ever lost if the user uninstalls or clears app data.
- Package id (`dev.pulse.tauri`) and the release signing key never change, so Android always treats a new build as an update of the same app.
- Storage-schema changes ship with a migration that carries existing data forward; a change that cannot migrate data is a breaking change and is called out explicitly before release.

## Unreleased

- **Library sorting:** the Home track list can now be sorted by title, artist, album, date added, duration or file name, ascending or descending. The choice is persisted in settings, the sort button in the list header shows the current order, and the playback queue follows the visible order. Comparators use locale-aware natural ordering ("Track 2" before "Track 10") with artist/album/title tie-breakers. Previously the list was always in raw scan order

## 0.2.4 — 2026-11-27

Sleep timer hardening on top of 0.2.3. Storage schema, package id and signing key unchanged — updates install in place, all user data carries over.

- The natively enforced sleep deadline (0.2.3) is now backed by an **AlarmManager alarm** in addition to the playback service's own schedule: if the process is throttled or killed before the deadline, the alarm wakes it and the deadline is re-checked and fired. Exact-and-allow-while-idle is used where the platform permits it, degrading to the inexact allow-while-idle variant rather than prompting for an exact-alarm permission. A stale alarm left by a dead process is cancelled when an expired deadline is dropped on restart

## 0.2.3 — 2026-11-27

Sleep timer fix. Storage schema, package id and signing key unchanged — updates install in place over 0.2.2, all user data carries over.

- **The timed sleep timer is now enforced by the native playback service, not the WebView.** Previously the expiry check ran on a WebView JS interval; Android freezes WebView timers when the app is backgrounded or the screen is off — exactly when a sleep timer matters — while native playback kept going, so a timer set at bedtime could play all night. The deadline is now handed to the Kotlin service (`set_sleep_timer`), which pauses playback at the deadline itself, including the fade-out ramp
- The deadline is persisted on both sides (native SharedPreferences + localStorage): if the app process is killed after arming, the service re-arms the deadline on restart and the UI rebuilds its countdown on relaunch. A deadline that passed while the app was dead is dropped, never fired into a later session
- The WebView tick now only mirrors the countdown on native; the web (dev) engine keeps the original JS enforcement. "End of track" mode is unchanged (already native)

## 0.2.2 — 2026-11-26

Performance and app-feel release. Storage schema, package id and signing key unchanged — all user data carries over, updates install in place over 0.2.1.

Navigation now moves like an app stack, not a page swap:

- Screen changes are two-layer transitions: the outgoing and incoming screens animate at the same time, and the motion follows the direction of travel — pushes come in from the right while the old screen parallaxes out left, back navigation reverses it, and the player presents from the bottom and dismisses back down (previously every screen, forwards or backwards, slid in from the same +28px with nothing leaving)
- The animation runs on the shell's layer wrapper (transform/opacity only), never on the scrolling element itself, and scroll no longer chains past the top/bottom of a screen

Fixes the "doesn't feel like a native app" jank reported on 0.2.1. Storage schema, package id and signing key unchanged — all user data carries over.

- Playback progress no longer re-renders the app: position/duration moved out of the player context into a dedicated progress context, so the twice-a-second tick only updates the mini-player bar and the player screen. Track rows are memoized and skip off-screen layout/paint (`content-visibility`)
- Position saves are no longer full-library writes: they update an in-memory ref and persist debounced (800ms, flushed on page-hide) instead of synchronously serializing the entire library to localStorage on every tick, seek and pause — and they no longer trigger a library re-render
- Seek bar commits once on release instead of seeking + saving on every drag event; the Settings sliders (volume, speed, skip intervals) do the same
- Tapping another track in the queue that is already loaded no longer re-sends the whole queue across the bridge: new native `seek_to_index` command (plugin + Kotlin + web engine fast path)
- Native state polling slows down while paused (500ms → 2s); it only needs to notice external transport changes then
- Folder scan no longer blocks: the Rust commands run on a blocking worker thread, and dedupe is a HashSet instead of an O(n²) Vec scan; the scanning screen no longer claims "0 files found" mid-scan
- Library home keeps its scroll position when you come back to it
- Mini-player progress is a composited `scaleX` transform instead of a width repaint, its glass blur is cheaper (20px → 12px), and the equalizer bars animate `scaleY` instead of `height`

## 0.2.1 — 2026-11-24

Bug-fix release from real-device use of 0.2.0. Storage schema, package id and signing key unchanged — all user data carries over.

- Time-picker wheels (jump-to-time, sleep-timer custom time) are real scrollable wheels again — swipe, mouse wheel, scroll-snap and tap all work; in 0.2.0 they only responded to taps on the neighbouring values
- Play/pause can no longer get stuck after the playback service stops (app swiped away while paused, or the system reclaims the service): the empty native state is recognised, the UI no longer resets to 0:00, and the next transport command rebuilds the queue at the remembered track and position instead of being silently dropped
- Play/pause flips optimistically on tap instead of waiting for the native state round trip, so quick double-taps toggle correctly
- Seek bar no longer fights the finger while dragging: engine ticks stop driving the thumb until the drag ends

## 0.2.0 — 2026-11-23

UI redesign — same app, same data. The storage schema, package id and signing key are unchanged, so libraries, playlists, favorites, playback positions and settings carry over untouched.

- Design system: every visual value now lives in `src/styles/tokens.css` (spacing, radii, type scale, motion); screens and components consume tokens through co-located CSS Modules — the global stylesheet and scattered inline styles are gone
- Now Playing: ambient background tinted by the current track's artwork (average colour, darkened to keep white text at ≥ 4.5:1 contrast, cross-faded on track change); falls back to the plain gradient when a track has no artwork
- Mini player is now a floating glass pill — the app's only `backdrop-filter` surface, with an opaque fallback where backdrop-filter is unsupported
- Library home: display-size title and a "Recently added" artwork row (derived from the existing per-track timestamps); track rows unified at a fixed 64px with one anatomy everywhere
- Playlists are a 2-column artwork card grid (cover = first track artwork in the playlist)
- Code layout: shared UI moved to `src/ui/primitives` + `src/ui/composites`; new dependency `fast-average-color` 9.6.0 (pinned) for artwork colour extraction

## 0.1.12 — 2026-11-22

- The project moved to the **sky1218-labs** organization (https://github.com/sky1218-labs/pulse-tauri). All in-app and documentation links now point at the canonical location (the in-app update check included); the old addresses redirect. No functional changes.

## 0.1.11 — 2026-11-22

Baseline release. Tauri 2 + React port of the Pulse local music player (Android), UI and logic matched to the original app's source code.

- Library, playlists (incl. auto-created folder playlists on folder import), favorites, scanner (folder picker + auto scan)
- Player: wrap-around queue with auto-advance, playback-position memory with resume prompt, sleep timer (timed, fade-out, stop-at-track-end), playback speed, skip forward/backward, three languages
- Native Android playback: an ExoPlayer inside a Media3 `MediaSessionService` (`tauri-plugin-mediasession`) owns playback — the pattern production players (Auxio, Gramophone, React Native Track Player) use — so the media notification, lock-screen and headset controls act on the real player; audio focus and becoming-noisy are handled natively. The WebView is a controller only; on desktop/web an HTMLAudioElement engine plays instead, behind the same playback-engine interface
- Toolchain pinned to latest LTS/stable (Node 26.13.1, Rust 1.100.0, Temurin 17.0.21, Tauri 2.12.7, Media3 1.11.1) — see `docs/VERSIONS.md`

Known limits: persistence is local storage (no cloud sync), no embedded cover-art extraction.
