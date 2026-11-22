# Design system

Charcoal surfaces, pill search, floating mini player, one blue accent.
Tokens live in `src/styles.css` — use the CSS variables, not raw hex.

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
| Accent | `#0070F3` | `#0070F3` |
| Error | `#EE0000` | `#EE0000` |

Rules: accent only for play / now-playing / primary actions. Never Spotify green (`#1DB954`). Elevation is brightness, not shadows.

## Shape and type

| Token | Value | Used for |
| --- | --- | --- |
| Radius | 12 / 14–16 / 20–24 / 9999 | Thumbnails / rows & cards / sheets & dialogs / pills |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48 | 8px grid |
| Font | Inter, system fallback | Titles 700, body 400 |
| Track rows | Art 52px r12, pad 14×12, no dividers | Library and playlists |

## Lists

- No hairline dividers; rows separate by spacing, highlight is an inset rounded rect (r16)
- Now-playing = accent bold title + equalizer bars, no background block
- Count/section labels: 11–13px, muted, letter-spaced

## Motion and feedback

| Case | Curve | Duration |
| --- | --- | --- |
| Press feedback | `cubic-bezier(0.25, 1, 0.5, 1)` | 100–150ms, scale 0.94–0.98 |
| Screen push | `cubic-bezier(0.25, 1, 0.5, 1)` | 320ms slide + fade |
| Sheets / dialogs | `cubic-bezier(0.32, 0.72, 0, 1)` | 320–450ms slide-up / scale 0.96→1 |

- Transform/opacity only; `prefers-reduced-motion` disables slides and scales
- Haptics: `navigator.vibrate(10)` via `src/utils/haptics.ts` — transport controls, chips, primary confirmations, sleep-timer set; never on scroll/drag
- No tap highlight or focus boxes; `:focus-visible` keeps a 2px accent outline for keyboards

## Components

One shared style per job: `.btn`, `.track-row`, `.search-pill`, `.screen-header`, `.empty-state`, `.mini-player`, `.player-card`, `ConfirmDialog`, `.toast`. Reuse before adding new styles.

## Interaction rules

| Rule | Where |
| --- | --- |
| Simple by default, details behind a tap | Player card: volume row + one speed row that opens the fine-tune dialog; no preset chip wall |
| Reorder controls only in edit mode | Playlist detail: 排序/完成 toggle reveals ↑↓; default rows are art + title + duration + ⋯ |
| Folder import creates folder playlists | Scanner save (folder picker / Auto Scan only), one playlist per folder name, merge on re-import |
| Android back = in-app navigation | `window.__pulseBack` (src/utils/backNav.ts): topmost dialog → previous screen → exit at root |
| Mini player never moves | Mounted once at shell level, hidden (not unmounted) on the player screen; `.screen-region` holds the layout slot while lazy screens load |
| System media controls are native on Android | `tauri-plugin-mediasession`: ExoPlayer inside a Media3 MediaSessionService owns playback + media notification; Web Media Session is the non-Android fallback |

## Per-screen audit — 2026-11-22 (390×844, before → after)

| Screen / surface | Issue found | Fix |
| --- | --- | --- |
| Library home | Search pill showed no focus state | Border brightens on `:focus-within` |
| Library home | Header icon buttons 40px | `.icon-btn` is 44px app-wide |
| Home track rows | Row ⋯ button 32px | 40px |
| Playlists list | — (clean) | No change |
| Playlist detail | Titles truncated by always-visible ↑↓; row highlight stopped before the arrows | Edit-mode toggle (Part D); rows in `.row-list`, full-width inset highlight |
| Player | Speed chip wall wrapped unevenly + duplicate `1.0x` label | One tappable speed row → dialog (Part A) |
| Player dialogs (sleep / speed / jump) | Sleep preset tiles used the 8px radius, off-scale | Tiles/picker now r12 |
| Mini player | Jumped up then settled on every screen switch | Shell-level mount + `.screen-region` (Part G) |
| Scanner results | Result card stretched to a full-height void; "scan complete" printed twice; last folder row slid under the summary bar | Card hugs content; duplicate line removed; scroll spacer above the bar |
| Scanner selection header | Hairline divider (against the no-divider rule) | Removed |
| Settings | — (clean) | No change |
| Resume card | Fixed card overlapped the mini player | In-flow shell row above the mini player |
| Dialogs / menus / confirms | — (no overflow at 390px, actions aligned) | No change |
| Empty states (library / playlists) | — (centered, one primary action) | No change |
| Toast | — | No change |
