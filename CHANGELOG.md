# Changelog

## Compatibility policy

From 0.1.11 on, updates are compatibility-first:

- Installing a new version over an existing one preserves all user data — library, playlists, favorites, playback positions （聽到哪裡）, and settings. Data is only ever lost if the user uninstalls or clears app data.
- Package id (`dev.pulse.tauri`) and the release signing key never change, so Android always treats a new build as an update of the same app.
- Storage-schema changes ship with a migration that carries existing data forward; a change that cannot migrate data is a breaking change and is called out explicitly before release.

## 0.1.12 — 2026-11-22

- The project moved to the **sky1218-labs** organization (https://github.com/sky1218-labs/pulse-tauri). All in-app and documentation links now point at the canonical location (the in-app update check included); the old addresses redirect. No functional changes.

## 0.1.11 — 2026-11-22

Baseline release. Tauri 2 + React port of the Pulse local music player (Android), UI and logic matched to the original app's source code.

- Library, playlists (incl. auto-created folder playlists on folder import), favorites, scanner (folder picker + auto scan)
- Player: wrap-around queue with auto-advance, playback-position memory with resume prompt, sleep timer (timed, fade-out, stop-at-track-end), playback speed, skip forward/backward, three languages
- Native Android playback: an ExoPlayer inside a Media3 `MediaSessionService` (`tauri-plugin-mediasession`) owns playback — the pattern production players (Auxio, Gramophone, React Native Track Player) use — so the media notification, lock-screen and headset controls act on the real player; audio focus and becoming-noisy are handled natively. The WebView is a controller only; on desktop/web an HTMLAudioElement engine plays instead, behind the same playback-engine interface
- Toolchain pinned to latest LTS/stable (Node 26.13.1, Rust 1.100.0, Temurin 17.0.21, Tauri 2.12.7, Media3 1.11.1) — see `docs/VERSIONS.md`

Known limits: persistence is local storage (no cloud sync), no embedded cover-art extraction.
