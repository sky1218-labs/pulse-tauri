import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/primitives/Icon";
import { TrackRow } from "../ui/primitives/TrackRow";
import { Dialog, ConfirmDialog } from "../ui/primitives/Dialog";
import btn from "../ui/primitives/Button.module.css";
import layout from "../styles/layout.module.css";
import type { Track } from "../utils/playlist";
import { displayTitle } from "../utils/playlist";
import { useLibrary, usePlayer } from "../store";
import styles from "./HomeScreen.module.css";

/* Screens unmount on navigation, so without this the library list jumped
   back to the top every time the user came back from the player or a
   dialog route — one of the least native-feeling behaviours in the app.
   The offset survives in module scope for the session. */
let savedHomeScrollTop = 0;

export function HomeScreen({ goScanner, goPlaylists, goSettings }: {
  goScanner: () => void; goPlaylists: () => void; goSettings: () => void;
}) {
  const { data, t, addToPlaylist, removeTrackFromLibrary, clearLibrary } = useLibrary();
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [pickPlaylistFor, setPickPlaylistFor] = useState<Track | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHomeMenu, setShowHomeMenu] = useState(false);
  const [confirmClearLibrary, setConfirmClearLibrary] = useState(false);

  const tracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.tracks;
    return data.tracks.filter((tr) =>
      [tr.title, tr.artist ?? "", tr.album ?? ""].some((f) => f.toLowerCase().includes(q)));
  }, [data.tracks, query]);

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
          <div className={styles.listCount}>{query ? `${t("results")} · ${tracks.length}` : `${tracks.length}`}</div>
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
            <button className={btn.menuItem} onClick={() => { setPickPlaylistFor(menuTrack); setMenuTrack(null); }}>
              <Icon name="addList" /> {t("add")} · {t("playlist")}
            </button>
            <button className={`${btn.menuItem} ${btn.menuItemDanger}`} onClick={() => { removeTrackFromLibrary(menuTrack.id); setMenuTrack(null); showToast(t("musicDeleted")); }}>
              <Icon name="trash" /> {t("removeFromLibrary")}
            </button>
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
