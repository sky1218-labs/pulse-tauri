# AGENTS.md — how to work on Pulse

Read this before changing code. It records the architecture decisions and
the hard-won performance/UI rules of this project. The rules exist because
each one was a real bug that made the app feel like a laggy web page
instead of a native app. Do not reintroduce them.

Pulse is a local-first Android music player: Tauri 2 + React 19 +
TypeScript + Vite on the front, a small Rust core, and a Kotlin
ExoPlayer/MediaSession plugin for native playback. No accounts, no cloud.

## Commands

- `npm run dev` — Vite dev server (port 1420) for UI work
- `npm test` — vitest (must stay green; add tests for engine/store changes)
- `npm run build` — `tsc --noEmit` + production build; run before pushing
- Release: bump the version in **all three** places (`package.json`,
  `src-tauri/tauri.conf.json`, `APP_VERSION` in
  `src/screens/SettingsScreen.tsx`), add a `CHANGELOG.md` entry, push
  `main`, then push a `v*` tag — the Release Android workflow builds and
  publishes the APK/AAB. Never commit `src-tauri/gen/`.

## Architecture map

- `src/store.tsx` — app state, split into contexts on purpose:
  `LibraryContext` (tracks/playlists), `PlayerContext` (queue, playback
  flags — changes rarely) and `ProgressContext` (position/duration —
  changes twice a second). Playback positions live in a **ref**, not in
  state.
- `src/repository.ts` — persistence. Everything is localStorage JSON
  (known limitation; a SQLite migration must stay data-compatible).
- `src/utils/playbackEngine.ts` — web engine (HTMLAudio, for dev/tests)
  and native engine (talks to the plugin). Native state is polled:
  500 ms while playing, 2 s while paused.
- `src-tauri/plugins/tauri-plugin-mediasession/` — the Kotlin
  MediaSessionService + ExoPlayer. TS guest bindings, Rust command
  surface, and Kotlin `@Command`s must stay in sync when adding a command.
- `src-tauri/src/lib.rs` — Rust commands (`scan_folder`,
  `get_audio_metadata`, …).
- `src/App.tsx` — the shell and the navigation transition stack.
- `docs/UI.md` — the design system (tokens, colour, shapes). All visual
  values come from `src/styles/tokens.css` via CSS Modules. **No UI
  library, no Tailwind, no raw hex or arbitrary spacing in components.**

## Performance rules (hard)

1. **High-frequency state stays isolated.** Position/duration only ever
   go through `ProgressContext` (`useProgress()`). Never put per-tick
   values into `PlayerContext` or into the library data — one tick would
   re-render the whole app twice a second. Components that don't show
   progress must not subscribe to it.
2. **Never synchronously write the whole library on a hot path.** Ticks,
   seeks, pause and track changes update the positions ref (O(1)) and a
   debounced (~800 ms) persist flushes it; `pagehide`/visibility-hidden
   flush synchronously. A full `saveLibrary` is for library mutations
   only.
3. **Controls commit on release.** Seek bars and sliders keep a local
   draft while dragging and commit once on pointer-up/blur. Never fire an
   IPC command or a storage write per input event.
4. **In-queue jumps use the fast path.** Tapping another track in the
   same queue must call the plugin's `seek_to_index` (web engine: load
   just that item). Re-sending the whole queue to rebuild the player is
   the old behaviour and is forbidden for same-queue jumps.
5. **Rust commands that touch IO are `async` + `spawn_blocking`.** A sync
   command runs on the main thread and freezes the UI. Dedupe with a
   `HashSet`, not `Vec::contains`.
6. **Lists stay cheap.** `TrackRow` is `React.memo` — keep its props
   stable primitives and stable callbacks, and keep
   `content-visibility: auto` on rows. Home preserves its scroll
   position across navigation; don't break that.
7. **Polling backs off.** Native poll is 500 ms playing / 2 s paused.
   Don't add new fixed-interval polling without a paused/idle backoff.
8. **Anything that must fire while the app is backgrounded lives in the
   native service, never on a WebView timer.** Android freezes WebView
   JS timers when the app backgrounds / the screen turns off, while the
   native player keeps playing. The sleep-timer deadline is the example:
   it is armed via `set_sleep_timer`, enforced (with its fade-out) by
   the Kotlin service, and persisted on both sides so a process restart
   re-arms it. The WebView only mirrors the countdown.

## UI & motion rules (hard)

This is an app, not a web page. Motion is how the user knows that.

1. **Animate `transform` and `opacity` only.** Never animate `height`,
   `width`, `top`, margins or other layout properties (the equalizer
   bars use `scaleY` for this reason). Durations/easings come from the
   `--motion-*` / `--ease-*` tokens.
2. **Navigation is a two-layer, direction-aware stack** (shell in
   `src/App.tsx`, keyframes in `src/App.module.css`): the outgoing
   screen stays mounted on an exiting layer while the incoming one
   enters. Push = in from the right + parallax out left; pop reverses
   it; the player **presents from the bottom** and dismisses back down.
   Never re-add a per-screen enter animation on the scrolling element
   itself (`.screen`) — transforming the scroller repaints it; the
   motion belongs on the layer wrapper.
3. **One glass surface only** — the mini player, `blur(12px)`. No other
   `backdrop-filter` anywhere; blur over a scrolling list costs a
   re-composite every frame.
4. **No web tells:** `overscroll-behavior: contain` on screens (no
   scroll chaining / rubber-banding to a page behind), no tap highlight,
   `touch-action: manipulation` on controls.
5. **Shell stability:** the mini player and resume card are shell rows
   that never unmount or move during navigation; screens are lazy-loaded
   inside a region that keeps its flex slot while suspending.
6. Touch targets ≥ 48px, times in tabular numerals, and
   `prefers-reduced-motion` (handled globally in `base.css`) must keep
   working — don't add animations that bypass it.

## When in doubt

Match the existing patterns in the file you're editing, keep changes
minimal, and update `docs/UI.md` + `CHANGELOG.md` when behaviour or the
design system changes. If a change would violate a rule above, the rule
wins unless the user explicitly decides otherwise.
