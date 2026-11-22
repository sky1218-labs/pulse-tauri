# UI Code Audit

Method: every value below is read from the original Dart source (`pulse-orig/lib/**`). No original screenshots used. ✅ fixed this pass · ➖ already matched · ⚠️ remaining delta.

> Correction (Unreleased): the elegance pass intentionally supersedes the rows on radii and dividers — thumbnails r4→r12, `.set-card`/`.scan-card`/mini player r8/r12→r16, home divider removed, search pill softened (surface bg, muted placeholder). Current values live in `docs/UI.md`; the rest of this audit stands.

## Tokens (`core/constants/*`, `core/theme/app_theme_tokens.dart`)

| Evidence (code) | Port before | Fix |
|---|---|---|
| dark `mutedText` = gray300 `#A7A7A7` | `--text-muted #6A6A6A` | ✅ `--text-muted #A7A7A7`; added `--text-hint #6A6A6A`, `--text-faint #404040` |
| dark divider/rowHover = white 8%; now-playing = `accentLight #3291FF` | rows used `--border`; title used accent | ✅ `--divider`, `--row-hover`, `--accent-light` |
| slider track = gray700 `#333333` | `#404040` | ✅ `--slider-track #333333` |
| Switch: on-track gray600, off-track gray800, off-thumb gray400 | `#595959/#333/#9E9E9E` (non-tokens) | ✅ `#404040/#282828/#B3B3B3`, knob 20px |
| `VercelButton`: pill, h40, pad 24, w700; pressed = accentDark; disabled = gray700 bg / gray500 fg | h≈44, pad 20, w600 | ✅ `.btn` h40 pad 0/24 w700; `:active` accentDark; disabled elevated/hint |

## Shared widgets

| Widget (file) | Evidence | Fix |
|---|---|---|
| `AppScreenHeader` | pad 16, title 18 w700, subtitle 12, back 40px | ✅ `.screen-header` pad 16 0, h1 18, subtitle 12 |
| `AppHeaderActionButton` filled | 40px circle, white bg / black icon (dark) | ✅ `.icon-btn.filled` (playlists add, detail add) |
| `VercelListTile` dense inset | pad v12 h0, art 52 r4 interactive bg, icon 20 muted, title 14 w500, sub 12, duration timeDisplay 14, menu icon 18 in 32px | ✅ `.track-row` restyled to match |
| `VercelTextField` | pill, bg interactive, hint gray500, focus border white | ✅ `.search-pill` icon 18 muted, placeholder hint; `.text-field` pill |
| `AppEmptyState` | pad 32, maxW 360, icon 48 muted, title 22 w700, msg 14 | ✅ `.empty-state` |
| `AppConfirmDialog` | centered, r12, elevated bg, title 22 in error color + warning icon 20, actions = text buttons | ✅ centered `r12 on-elevated`, `.confirm-head`, `.btn-text` |
| `MiniPlayer` | h64 r12, pad h8, art 48 r4, title w700, play 40px white bg/black icon (dark), progress 2px fill white / track border | ✅ `.play-btn` 40px play-bg/play-fg, fill `--progress-fill`, track `--border` |

## Home (`home_screen.dart`)

| Evidence | Fix |
|---|---|
| Custom header pad L16 T16 R16 B0; title 24 w700 ls −0.6; subtitle 14, gap 6 | ✅ `pad16`, `.home-h1`, subtitle 14/6 |
| Quick actions = `VercelButton` primary (accent) + secondary, h40, gap 8 | ✅ scan button white → `btn-primary`; `.home-actions .btn` h40 |
| Divider = palette.divider, gaps 24/16 | ✅ `.home-divider` uses `--divider`, margin 24/16 |
| Count label = labelSmall 10 w500 ls 0.2, text = number / "Results · n" | ✅ `.list-count` 10px w500 |
| No bottom navigation anywhere in `lib/` | ✅ bottom nav removed; Playlists is a pushed screen with back header |

## Player (`player_screen.dart`, `playback_controls.dart`, `progress_bar.dart`, `volume_slider.dart`)

| Evidence | Fix |
|---|---|
| Bg gradient elevated → background (dark) | ✅ `.screen.player-bg` full-bleed gradient |
| Header: back = chevron-down 28 gray400; centre pill pad h16 v4, text 12 | ✅ `.player-header` icon 28; `.np-pill` 4/16, 12px |
| Sleep indicator inactive: bedtime_outlined 20 gray500, pad 8, r8; active: 13px w500 tabular, bg gray800, border gray700 | ✅ `.moon-btn` restyled |
| Art max 280, r8, elevated bg, placeholder = music icon 48 muted, no circle | ✅ art `min(72vw,280px)`; `.art-circle` removed |
| Title displaySmall 24 w700 ls −0.6, max 2 lines | ✅ 24px, clamp 2 |
| ProgressBar h4, thumb 12; time labels 14 w500 tabular | ✅ `.range-progress` h4/thumb 12; `.time-labels` 14 w500 |
| Skip = fast_forward/rewind glyph ≈26 + "{n}s" text below, w600 ≈14 | ✅ `forward` icon (flipped for back) + `.skip-label` below |
| VolumeSlider w120, track h6, thumb 24 white, icon 20 gray300 | ✅ `.range-thin` h6/thumb 24, width 120, icon muted |
| Jump button 36px total (icon 20 on surface circle); SpeedButton pad h16 v8, icon 16, text 14 w500 | ✅ `.jump-btn` 36px; `.speed-btn` pad 8/16 |
| Resume prompt = in-player card (elevated, r8, border, pad 16, small ghost + small primary) | ✅ modal → `.resume-card` with `btn-small` |

## Dialogs (`time_input_dialog.dart`, `sleep_timer_dialog.dart`, `playback_speed_sheet.dart`)

| Evidence | Fix |
|---|---|
| Jump: centered r12, pad 32, title 16 semiBold, total 13, wheel labels ABOVE, numbers uniform 24 w500, band gray800 r8, preview 24, actions ghost + primary pill | ✅ `r12 pad32`, title 16/600, total 13, preview 24 w500, Jump → primary; wheel rows uniform 24 w500, band = elevated |
| Sleep: centered r16, elevated bg, moon circle 48 gradient gray800→gray900, title 18 w700, sub 12 | ✅ `on-elevated`, moon 48 gradient `#282828→#181818`, title 18, sub 12 hint |
| Sleep presets: 3-col grid gap 8, aspect 1.0, card bg gray900, value 20 w700, unit 11 gray500; selected = white bg/black text/2px white border | ✅ bg surface (gray900), value 20, unit 11 hint, gap 8, aspect 1 |
| Sleep custom card: transparent bg, border gray800, pad h24 v16, text 14 | ✅ `.custom-card` |
| Sleep wheels: no band, selected 18 w600, unselected 14 gray600, labels BELOW 10px gray500, row extent 30 | ✅ `.custom-picker .wheel` overrides; compact rowH 30 |
| Sleep actions = full-width pill `VercelButton`s (danger Stop / secondary Cancel / primary Start) | ✅ rect buttons → `dialog-actions stretch` pills, Start → primary |
| Speed: bottom sheet, big value 32 w700, preset chips pill 13px (selected w600) | ✅ `.speed-value` 32/700 added; chips 13px |

## Settings (`settings_screen.dart`)

| Evidence | Fix |
|---|---|
| ListView pad 24; section header 13 w600 ls 0.5 gray400, gap 32/16 | ✅ `.set-section` 13/600/0.5, margins 32/16 |
| Tiles: surface bg, r8, pad 16, margin-b 8, NO border; title 15 w500; desc 13 gray500 | ✅ `.set-card` r8 pad 16 no border; `.s-title` 15/500; `.s-desc` 13 hint |
| Slider tile value label 14 gray400; slider track h4, thumb ≈20 white | ✅ `.s-value` 14; `.range-white` thumb 20 |
| Language options = pills (pad h16 v8, gap 8); selected = accent bg, white, w600; unselected = interactive bg, gray400 | ✅ `.lang-opt` pill; selected accent |
| Action tile: icon 22 gray400 (danger = error incl. title), chevron 22 gray600 | ✅ chevron `--text-faint`; danger already matched |
| Sections/order: Appearance / Playback / Skip / Features (AutoUpdate, CheckForUpdates, ScanFolders) / Other (Reset, ClearAllData) | ✅ removed non-code tiles: sleep fade-out switch (Features), Clear Library card (Other) — both remain available elsewhere (sleep dialog / home menu) |
| Footer: name 14 w500 gray500, version 12 gray600; `APP_VERSION` constant | ✅ `.ai-name` hint, `.ai-ver` faint; footer + update check read the `APP_VERSION` constant |

## Playlists (`playlist_screen.dart`, `playlist_detail_screen.dart`)

| Evidence | Fix |
|---|---|
| List pad h16; header = `AppScreenHeader` + filled add button | ✅ `pad16`, back button added, add = `.icon-btn.filled` |
| Options = bottom sheet (elevated, top r12), ListTile rows: edit icon muted / delete icon+text error, labelLarge | ✅ sheet rows → `.menu-item` |
| Create/rename = centered `showDialog` with pill text field | ✅ centered `r28`, `.text-field` pill |
| Detail header add button = filled white circle | ✅ `.icon-btn.filled` |
| ⚠️ Remaining | Playlist art icon 20 vs code 22 (queue_music); playing-playlist title accent not shown; detail reorder uses up/down buttons (code: drag `ReorderableListView`); add-songs search field absent (code has its own r8 field) |

## Scanner (`folder_selection_screen.dart` / scan widgets)

| Evidence | Fix |
|---|---|
| Initial state = `AppEmptyState` anatomy: icon 48 muted (no hero circle), title 22, desc 14, primary + secondary pill buttons h40, gap 16 | ✅ 120px circle hero removed; `.scan-hero` pad 32 maxW 360 |
| Progress card: surface bg, r8, pad 24, title 16 w600, lines 13 gray400, success icon = accent | ✅ `.scan-card` r8 pad 24 no border; `.check-circle` accent check-circle glyph |
| Completed actions = two secondary buttons side by side (Refresh Library / Add More) | ✅ side-by-side `btn-secondary` row |
| Selection header: count 13 gray400 "{sel} / {total}", All/None = ghost small buttons | ✅ count 13; All/None → `btn-ghost btn-small` |
| Folder item: checkbox 20 r4 border 2 gray600, checked = white bg/black check 14 (dark); folder icon 20 gray400; name 14 (selected white w500 / unselected gray300); path 12 gray500; count badge bg gray800 r8, 12 gray400 pad h8 v4 | ✅ `.checkbox.square` 20/r4; `.folder-row` name/path/badge restyled, `.sel` state |
| Summary bar: bg elevated, title 14 w500, sub 13 gray400, Save = primary | ✅ `.summary-bar` elevated; Save → `btn-primary` |
| ⚠️ Remaining | Scanning state has no Cancel button (code `FolderScanProgress.onCancel`; port scan is a single promise) |

## Performance / size

| Item | Before | After |
|---|---|---|
| Initial JS chunk | 300.69 kB (gzip 92.81) | **270.54 kB (gzip 85.87)** |
| Deferred chunks (lazy) | — | Player 10.93 · Settings 7.27 · Scanner 6.61 · PlaylistDetail 3.21 · Playlists 2.93 kB |
| CSS | 24.79 kB (gzip 4.80) | 26.30 kB (gzip 5.07) — new component rules, dead nav/light-button rules removed |

- Lazy loading: `React.lazy` + `Suspense` for Player, Playlists, PlaylistDetail, Scanner, Settings; Home + MiniPlayer eager. No new dependencies.
- `index.html`: no webfonts, no external requests, no render-blocking extras (one local favicon). Inter = system font stack in CSS. ➖ already matched.
- Rust release profile (`opt-level="s"`, lto, codegen-units=1, strip, panic=abort) kept as-is.

## Verdict

| Area | Verdict |
|---|---|
| Tokens / shared widgets | ✅ code-aligned |
| Home | ✅ code-aligned (bottom nav removed) |
| Player + dialogs | ✅ code-aligned |
| Settings | ✅ code-aligned (2 non-code tiles removed) |
| Playlists / Scanner | ✅ aligned except ⚠️ items above |
| Bundle | ✅ initial JS gzip −7.5%, screens deferred |
| Tests / build | ✅ `npm test` 21/21, `npm run build` green |
