# Logic audit

Scope: `src/store.tsx`, `src/repository.ts`, player + utils. Verdicts: OK = verified correct, FIXED = bug found and fixed here (test in brackets).

## Position memory

| Check | Verdict | Detail |
| --- | --- | --- |
| Periodic save while playing | OK | `timeupdate` saves every 5 s per current track |
| Save on pause | FIXED | Also fired after `ended`, resurrecting the cleared end position — now skipped when `audio.ended` |
| Save on seek | FIXED | Was throttle-dependent; a kill after seeking restored the old spot — seek now clamps to duration and saves immediately |
| Save when app is backgrounded/killed | FIXED | Nothing saved on hide before — added `pagehide` + `visibilitychange` save |
| Save after switching tracks | FIXED | 5 s throttle carried over, delaying the new track's first save — throttle resets per track; stale `loadedmetadata` handlers from a previous tap are ignored |
| Resume rules | OK | Prompt only on user tap + `autoResume` + `resumePlaybackOnTrackTap`, progress window 5 s…(duration−5 s); otherwise auto-resume or start-over per settings |

## Persistence integrity (`repository.test.ts`)

| Check | Verdict | Detail |
| --- | --- | --- |
| Corrupted JSON | OK → hardened | Parse failure fell back to defaults; now any wrong-typed payload does too |
| Wrong-typed collections | FIXED | `tracks: "x"` etc. survived `?? []` and crashed later — `sanitizeLibrary` validates every collection [tests: drops wrong-typed collections] |
| Playlist ↔ track integrity | FIXED | Dangling/duplicate track ids in playlists are pruned on load [test: prunes playlist track ids] |
| Positions sanity | FIXED | Negative/NaN/string positions dropped on load [test: keeps only finite, non-negative positions] |
| Settings merge | OK | Stored settings merge over `DEFAULT_SETTINGS` [test: merges stored settings] |

## Queue & playback edge cases

| Check | Verdict | Detail |
| --- | --- | --- |
| Remove the playing track | FIXED | Playback kept going on a track no longer in the library — removal now stops playback and clears the queue entry (`removeTrackFromQueue`, `queue.test.ts`) |
| Clear library / clear all data while playing | FIXED | Same ghost-playback issue — both now stop the player |
| Prev/next at queue ends | OK | Wraps around (repeat-all), matching the original |
| Duplicate paths | OK | Imports and playlist adds dedupe by canonical path (`dedupeTracks`, `addTracksToPlaylist`) |
| Sleep timer, end-of-track | OK | `ended` clears the position, consumes the timer, and does not advance the queue |
| Sleep timer, timed + fade | OK | 250 ms tick, fade over the final `sleepTimerFadeOutSeconds`, volume restored on expiry/stop |
| Speed / volume ranges | OK | All entry points go through `clampSpeed` (0.5–2.0) / `clampVolume` (0–1) |
