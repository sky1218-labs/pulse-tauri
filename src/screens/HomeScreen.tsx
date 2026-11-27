import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/primitives/Icon";
import { TrackRow } from "../ui/primitives/TrackRow";
import { Dialog, ConfirmDialog } from "../ui/primitives/Dialog";
import btn from "../ui/primitives/Button.module.css";
import layout from "../styles/layout.module.css";
import type { Track } from "../utils/playlist";
import { displayTitle } from "../utils/playlist";
import { useLibrary, usePlayer } from "../store";
import { sortTracks, SORT_KEYS, SORT_DEFAULT_DIR, type SortKey } from "../utils/sortTracks";
import { checkForUpdateHint, dismissUpdateHint, RELEASES_PAGE } from "../utils/updateCheck";
import { displayVersion } from "../utils/sleepTimer";
import styles from "./HomeScreen.module.css";

/* Screens unmount on navigation, so without this the library list jumped
   back to the top every time the user came back from the player or a
   dialog route — one of the least native-feeling behaviours in the app.
   The offset survives in module scope for the session. */
let savedHomeScrollTop = 0;

export function HomeScreen({ goScanner, goPlaylists, goSettings }: {
  goScanner: () => void; goPlaylists: () => void; goSettings: () => void;
}) {
  const { data, t, addToPlaylist, removeTrackFromLibrary, clearLibrary, updateSettings, toggleFavorite } = useLibrary();
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [pickPlaylistFor, setPickPlaylistFor] = useState<Track | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHomeMenu, setShowHomeMenu] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [infoTrack, setInfoTrack] = useState<Track | null>(null);
  const [updateHint, setUpdateHint] = useState<string | null>(null);

  /* One lightweight version check per session (throttled to 6h across
     launches inside checkForUpdateHint). Just a hint bar — no in-app
     downloading; the bar links to the release page like Settings does. */
  useEffect(() => {
    if (!data.settings.autoUpdateEnabled) return;
    let alive = true;
    void checkForUpdateHint().then((v) => { if (alive) setUpdateHint(v); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [confirmClearLibrary, setConfirmClearLibrary] = useState(false);

  const sortChoice = { key: data.settings.librarySortKey, dir: data.settings.librarySortDir };
  const tracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = favOnly ? data.tracks.filter((tr) => tr.favorite) : data.tracks;
    const filtered = !q
      ? base
      : base.filter((tr) =>
          [tr.title, tr.artist ?? "", tr.album ?? "", tr.path.split("/").pop() ?? ""]
            .some((f) => f.toLowerCase().includes(q)));
    // The sorted list is also the playback queue (TrackRow gets
    // queue={tracks}), so what you see is the order you hear.
    return sortTracks(filtered, sortChoice, data.settings.locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tracks, query, favOnly, data.settings.librarySortKey, data.settings.librarySortDir, data.settings.locale]);

  /* Recently added — derived from the existing Track.addedAt stamps
     (no new persisted fields); shown only when enough tracks carry one. */
  const recent = useMemo(() => {
    const stamped = data.tracks.filter((tr) => typeof tr.addedAt === "number" && tr.addedAt > 0);
    if (stamped.length < 4) return [];
    return [...stamped].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 8);
  }, [data.tracks]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && savedHomeScrollTop > 0) el.scrollTop = savedHomeScrollTop;
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  return (
    <div
      className={`${layout.screen} ${layout.pad16}`}
      ref={scrollRef}
      onScroll={(e) => { savedHomeScrollTop = e.currentTarget.scrollTop; }}
    >
      <div className={styles.homeHeader}>
        <div>
          <h1 className={styles.displayTitle}>{t("musicLibrary")}</h1>
          <div className={styles.homeSubtitle}>{t("exploreYourMusic")}</div>
        </div>
        <span className={styles.headerActions}>
          <button className={`${btn.iconBtn} ${styles.headerIcon}`} onClick={goSettings} aria-label={t("settings")}>
            <Icon name="settings" />
          </button>
          <button className={`${btn.iconBtn} ${styles.headerIcon}`} onClick={() => setShowHomeMenu(true)} aria-label={t("clearLibrary")}>
            <Icon name="moreHoriz" />
          </button>
        </span>
      </div>

      {updateHint ? (
        <div className={styles.updateHint}>
          <Icon name="refresh" />
          <span className={styles.updateHintText}>{t("updateHint", { version: displayVersion(updateHint) })}</span>
          <a className={styles.updateHintLink} href={RELEASES_PAGE} target="_blank" rel="noreferrer">{t("updateView")}</a>
          <button
            className={`${btn.iconBtn} ${styles.updateHintClose}`}
            aria-label="dismiss"
            onClick={() => { dismissUpdateHint(updateHint); setUpdateHint(null); }}
          >
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      <div className={styles.homeActions}>
        <button className={`${btn.btn} ${btn.btnPrimary} ${styles.actionBtn}`} onClick={goScanner}>
          <Icon name="radar" /> {t("scanMusic")}
        </button>
        <button className={`${btn.btn} ${btn.btnSecondary} ${styles.actionBtn}`} onClick={goPlaylists}>
          <Icon name="queue" /> {t("playlist")}
        </button>
      </div>

      <div className={styles.searchPill}>
        <Icon name="search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchHint")} />
        {query ? (
          <button className={`${btn.iconBtn} ${styles.clearBtn}`} onClick={() => setQuery("")} aria-label="clear">
            <Icon name="close" />
          </button>
        ) : null}
      </div>

      {!query && recent.length > 0 && data.tracks.length > 0 ? (
        <>
          <div className={layout.sectionTitle}>{t("recentlyAdded")}</div>
          <div className={styles.recentRow}>
            {recent.map((tr) => (
              <button
                key={tr.id}
                className={styles.recentCard}
                onClick={() => void player.playTrack(tr, recent, { fromUserTap: true })}
              >
                <span className={styles.recentArt}>
                  {tr.artworkPath ? <img src={tr.artworkPath} alt="" /> : <Icon name="music" />}
                </span>
                <div className={styles.recentTitle}>{displayTitle(tr)}</div>
                <div className={styles.recentArtist}>{tr.artist || ""}</div>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {data.tracks.length === 0 ? (
        <div className={layout.emptyState}>
          <Icon name="music" />
          <div className={layout.esTitle}>{t("emptyLibrary")}</div>
          <div className={layout.esHint}>{t("emptyLibraryHint")}</div>
          <button className={`${btn.btn} ${btn.btnPrimary}`} onClick={goScanner}>{t("scanMusic")}</button>
        </div>
      ) : tracks.length === 0 ? (
        <div className={layout.emptyState}>
          <Icon name="search" />
          <div className={layout.esTitle}>{t("noResults")}</div>
          <div className={layout.esHint}>{t("tryOtherKeywords")}</div>
        </div>
      ) : (
        <>
          <div className={styles.listHead}>
            <div className={styles.listCount}>{query ? `${t("results")} · ${tracks.length}` : `${tracks.length}`}</div>
            <span className={styles.listHeadActions}>
            <button
              className={`${styles.sortBtn}${favOnly ? ` ${styles.sortBtnActive}` : ""}`}
              onClick={() => setFavOnly((v) => !v)}
              aria-label={t("favorites")}
              aria-pressed={favOnly}
            >
              <Icon name={favOnly ? "heartFill" : "heart"} />
            </button>
            <button className={styles.sortBtn} onClick={() => setShowSort(true)} aria-label={t("sortBy")}>
              <Icon name="sort" />
              <span>{t(`sort${sortChoice.key.charAt(0).toUpperCase()}${sortChoice.key.slice(1)}` as "sortTitle")}</span>
              <Icon name={sortChoice.dir === "asc" ? "up" : "down"} />
            </button>
            </span>
          </div>
          <div className={styles.rowBleed}>
          {tracks.map((tr) => (
            <TrackRow key={tr.id} track={tr} queue={tracks} onMenu={setMenuTrack} />
          ))}
          </div>
        </>
      )}

      {menuTrack ? (
        <Dialog title={menuTrack.title} onClose={() => setMenuTrack(null)}>
          <div>
            <button className={btn.menuItem} onClick={() => { player.playNext(menuTrack); setMenuTrack(null); showToast(t("queuedNext")); }}>
              <Icon name="next" /> {t("playNext")}
            </button>
            <button className={btn.menuItem} onClick={() => { player.addToQueue(menuTrack); setMenuTrack(null); showToast(t("queuedAdded")); }}>
              <Icon name="addList" /> {t("addToQueue")}
            </button>
            <button className={btn.menuItem} onClick={() => { setPickPlaylistFor(menuTrack); setMenuTrack(null); }}>
              <Icon name="queue" /> {t("add")} · {t("playlist")}
            </button>
            <button className={btn.menuItem} onClick={() => { toggleFavorite(menuTrack.id); setMenuTrack(null); }}>
              <Icon name={menuTrack.favorite ? "heartFill" : "heart"} /> {menuTrack.favorite ? t("removeFavorite") : t("addFavorite")}
            </button>
            <button className={btn.menuItem} onClick={() => { setInfoTrack(menuTrack); setMenuTrack(null); }}>
              <Icon name="file" /> {t("trackInfo")}
            </button>
            <button className={`${btn.menuItem} ${btn.menuItemDanger}`} onClick={() => { removeTrackFromLibrary(menuTrack.id); setMenuTrack(null); showToast(t("musicDeleted")); }}>
              <Icon name="trash" /> {t("removeFromLibrary")}
            </button>
          </div>
        </Dialog>
      ) : null}

      {infoTrack ? (
        <Dialog title={t("trackInfo")} onClose={() => setInfoTrack(null)}>
          <div className={styles.infoList}>
            <div className={styles.infoRow}><span>{t("sortTitle")}</span><span>{displayTitle(infoTrack)}</span></div>
            {infoTrack.artist ? <div className={styles.infoRow}><span>{t("sortArtist")}</span><span>{infoTrack.artist}</span></div> : null}
            {infoTrack.album ? <div className={styles.infoRow}><span>{t("sortAlbum")}</span><span>{infoTrack.album}</span></div> : null}
            <div className={styles.infoRow}><span>{t("infoDuration")}</span><span>{Math.floor(infoTrack.durationMs / 60000)}:{String(Math.floor((infoTrack.durationMs % 60000) / 1000)).padStart(2, "0")}</span></div>
            <div className={styles.infoRow}><span>{t("infoSize")}</span><span>{(infoTrack.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span></div>
            {infoTrack.addedAt ? <div className={styles.infoRow}><span>{t("infoAdded")}</span><span>{new Date(infoTrack.addedAt).toLocaleDateString(data.settings.locale)}</span></div> : null}
            <div className={styles.infoRow}><span>{t("infoPath")}</span><span className={styles.infoPath}>{infoTrack.path}</span></div>
          </div>
        </Dialog>
      ) : null}

      {pickPlaylistFor ? (
        <Dialog title={t("playlist")} onClose={() => setPickPlaylistFor(null)}>
          {data.playlists.length === 0 ? (
            <p>{t("noPlaylistsHint")}</p>
          ) : (
            <div className={styles.pickList}>
              {data.playlists.map((p) => (
                <button key={p.id} className={`${btn.btn} ${btn.btnSecondary}`} onClick={() => {
                  addToPlaylist(p.id, [pickPlaylistFor]);
                  setPickPlaylistFor(null);
                  showToast(t("songsAdded", { n: 1 }));
                }}>{p.name}</button>
              ))}
            </div>
          )}
        </Dialog>
      ) : null}

      {showSort ? (
        <Dialog title={t("sortBy")} onClose={() => setShowSort(false)}>
          <div>
            {SORT_KEYS.map((key) => (
              <button
                key={key}
                className={btn.menuItem}
                onClick={() => {
                  if (key === sortChoice.key) {
                    updateSettings({ librarySortDir: sortChoice.dir === "asc" ? "desc" : "asc" });
                  } else {
                    updateSettings({ librarySortKey: key, librarySortDir: SORT_DEFAULT_DIR[key] });
                  }
                  setShowSort(false);
                }}
              >
                <span className={styles.sortLabel}>{t(`sort${key.charAt(0).toUpperCase()}${key.slice(1)}` as "sortTitle")}</span>
                {key === sortChoice.key ? <Icon name="check" /> : null}
              </button>
            ))}
            <div className={styles.sortDirRow}>
              <button
                className={`${btn.btn} ${sortChoice.dir === "asc" ? btn.btnPrimary : btn.btnSecondary} ${styles.sortDirBtn}`}
                onClick={() => updateSettings({ librarySortDir: "asc" })}
              >
                <Icon name="up" /> {t("sortAscending")}
              </button>
              <button
                className={`${btn.btn} ${sortChoice.dir === "desc" ? btn.btnPrimary : btn.btnSecondary} ${styles.sortDirBtn}`}
                onClick={() => updateSettings({ librarySortDir: "desc" })}
              >
                <Icon name="down" /> {t("sortDescending")}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {showHomeMenu ? (
        <Dialog title={t("musicLibrary")} onClose={() => setShowHomeMenu(false)}>
          <div>
            <button className={`${btn.menuItem} ${btn.menuItemDanger}`} onClick={() => { setShowHomeMenu(false); setConfirmClearLibrary(true); }}>
              <Icon name="trash" /> {t("clearLibrary")}
            </button>
          </div>
        </Dialog>
      ) : null}

      {confirmClearLibrary ? (
        <ConfirmDialog title={t("clearLibrary")} message={t("clearLibraryConfirm")} confirmLabel={t("delete")}
          onCancel={() => setConfirmClearLibrary(false)}
          onConfirm={() => { clearLibrary(); setConfirmClearLibrary(false); showToast(t("libraryCleared")); }} />
      ) : null}

      {toast ? <div className={layout.toast}>{toast}</div> : null}
    </div>
  );
}
