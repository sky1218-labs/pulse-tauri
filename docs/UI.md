# Design system

Charcoal surfaces, one blue accent, one glass surface, artwork-tinted player.
All values live in `src/styles/tokens.css` — components consume tokens via CSS Modules, never raw hex or arbitrary spacing.

## Tokens

| Group | Tokens | Values |
| --- | --- | --- |
| Spacing | `--space-1` … `--space-7` (`--sp-*` aliases) | 4 / 8 / 12 / 16 / 24 / 32 / 48 |
| Radius | `--radius-1` … `--radius-4`, `--radius-pill` | 8 / 12 / 16 / 24 / 999 |
| Type | `--fs-display / headline / title / body / label / caption` | 30 / 22 / 16 / 15 / 13 / 12 |
| Weight | `--fw-regular / medium / semibold / bold` | 400 / 500 / 600 / 700 |
| Motion | `--motion-fast / medium / slow / slower` | 150 / 280 / 500 / 550 ms |
| Easing | `--ease-out`, `--ease-sheet`, `--ease-inout` | `cubic-bezier(0.2,0,0,1)` / `(0.32,0.72,0,1)` / `(0.42,0,0.58,1)` |

## Color

| Role | Dark | Light |
| --- | --- | --- |
| Background | `#121212` | `#FFFFFF` |
| Surface | `#181818` | `#F5F5F5` |
| Interactive | `#1F1F1F` | `#EEEEEE` |
| Elevated | `#282828` | `#FFFFFF` |
| Border | `#292929` | `#EAEAEA` |
| Text | `#FFFFFF` | `#000000` |
| Secondary text | `#B3B3B3` | `#6A6A6A` |
| Muted text | `#A7A7A7` | `#A7A7A7` |
| Accent | `#0070F3` | `#0070F3` |
| Error | `#EE0000` | `#EE0000` |

Rules: accent only for play / now-playing / primary actions. Never Spotify green (`#1DB954`). Elevation is brightness, not shadows. Muted text is a token, never an opacity hack.

## The one-glass rule

- Exactly one `backdrop-filter` surface exists: the mini player (`src/ui/composites/MiniPlayer.module.css`) — floating pill, radius 20, `blur(20px) saturate(1.4)`, 1px top border `rgba(255,255,255,0.08)`
- No other component may use `backdrop-filter` — blur re-computes per scroll frame and multiplies with every layer
- Without backdrop-filter support the pill falls back to an opaque fill (`--glass-fallback`), via `@supports not (backdrop-filter: blur(1px))`

## Now Playing ambient colour

- Background = vertical gradient from the current artwork's average colour into `--bg`; every other screen stays neutral charcoal
- Extraction: `fast-average-color` in `src/utils/artworkColor.ts` — average colour, desaturated 30%, darkened toward black until white text keeps ≥ 4.5:1 contrast; cached in memory per artwork, never persisted
- Track changes cross-fade two stacked layers by animating **opacity only** (550 ms, `--motion-slower`); the gradient itself is never transitioned
- No artwork or extraction failure → the plain base gradient (`--elevated` → `--bg`)
- While ambient colour is up, header chrome switches to light-on-dark (the stop is contrast-checked)

## Shape and lists

| Element | Spec |
| --- | --- |
| Track rows | Fixed 64px, art 48px r8, title 16/600, subtitle 12 muted, no dividers |
| Playlist cards | 2-column grid, cover r16, name 15/600, count + duration 12 muted |
| Recent cards (home) | 120px art r16, horizontal scroll, from `Track.addedAt` (shown when ≥ 4 stamped tracks) |
| Now Playing art | min(72vw, 280px), r16, soft shadow, scale 0.98 when paused |
| Sheets / dialogs | r24 top-only / r20 centered, `--radius-sheet` / `--radius-dialog` |

- Row highlight is an inset rounded rect (r16); rows bleed 12px past the screen padding
- Now-playing row = accent bold title + equalizer bars, no background block
- Touch targets ≥ 48px (transport play 72px); times use tabular numerals

## Motion and feedback

- Animate `transform` and `opacity` only — never layout properties, never a gradient, never a blur radius
- Press feedback: scale 0.94–0.99 + brightness, `--motion-fast`; screen push 280ms slide + fade; sheets 420ms `--ease-sheet`
- Play/pause glyphs crossfade + counter-scale in one grid cell; slider thumbs grow 1.3× while dragging
- `prefers-reduced-motion`: slides/springs collapse to near-instant fades (spinner and nothing else keeps moving)
- Haptics: `navigator.vibrate(10)` via `src/utils/haptics.ts` — transport controls, chips, primary confirmations, sleep-timer set; never on scroll/drag
- No tap highlight or focus boxes; `:focus-visible` keeps a 2px accent outline for keyboards

## Code layout

| Path | Holds |
| --- | --- |
| `src/styles/tokens.css` | Every design token + dark/light theme variables — the only file with raw values |
| `src/styles/base.css` | Resets, focus, reduced-motion, range-thumb behaviour |
| `src/styles/layout.module.css` | Shared screen scaffolding (`.screen`, headers, empty state, toast) |
| `src/ui/primitives/` | `Icon`, `TrackRow`, `Dialog`/`ConfirmDialog`, `Button.module.css`, `forms.module.css` |
| `src/ui/composites/` | `MiniPlayer` (the glass pill) |
| `src/screens/` | One `.tsx` + one `.module.css` per screen |

- Inline `style` is allowed only for runtime values: slider fill %, mini-player progress %, and the `--np-ambient` variable injection
- Primitives never import screens; screens compose primitives + tokens only

## Interaction rules

| Rule | Where |
| --- | --- |
| Simple by default, details behind a tap | Player card: volume row + one speed row that opens the fine-tune dialog; no preset chip wall |
| Reorder controls only in edit mode | Playlist detail: 排序/完成 toggle reveals ↑↓; default rows are art + title + duration + ⋯ |
| Folder import creates folder playlists | Scanner save (folder picker / Auto Scan only), one playlist per folder name, merge on re-import |
| Android back = in-app navigation | `window.__pulseBack` (src/utils/backNav.ts): topmost dialog → previous screen → exit at root |
| Mini player never moves | Mounted once at shell level, hidden (not unmounted) on the player screen; `.screenRegion` holds the layout slot while lazy screens load |
| System media controls are native on Android | `tauri-plugin-mediasession`: ExoPlayer inside a Media3 MediaSessionService owns playback + media notification; Web Media Session is the non-Android fallback |
