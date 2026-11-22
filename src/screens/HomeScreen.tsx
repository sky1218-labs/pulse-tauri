import { useMemo, useState } from "react";
import { Icon, TrackRow, Dialog, ConfirmDialog } from "../components/components";
import type { Track } from "../utils/playlist";
import { useLibrary } from "../store";

export function HomeScreen({ goScanner, goPlaylists, goSettings }: {
  goScanner: () => void; goPlaylists: () => void; goSettings: () => void;
}) {
  const { data, t, addToPlaylist, removeTrackFromLibrary, clearLibrary } = useLibrary();
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

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="screen pad16">
      <div className="screen-header" style={{ alignItems: "flex-start", paddingBottom: 0 }}>
        <div>
          <h1 className="home-h1">{t("musicLibrary")}</h1>
          <div className="subtitle" style={{ fontSize: 14, marginTop: 6 }}>{t("exploreYourMusic")}</div>
        </div>
        <span style={{ display: "flex", gap: 2 }}>
          <button className="icon-btn" style={{ color: "var(--text-secondary)" }} onClick={goSettings} aria-label={t("settings")}>
            <Icon name="settings" />
          </button>
          <button className="icon-btn" style={{ color: "var(--text-secondary)" }} onClick={() => setShowHomeMenu(true)} aria-label={t("clearLibrary")}>
            <Icon name="moreHoriz" />
          </button>
        </span>
      </div>

      <div className="home-actions">
        <button className="btn btn-primary" onClick={goScanner}>
          <Icon name="radar" /> {t("scanMusic")}
        </button>
        <button className="btn btn-secondary" onClick={goPlaylists}>
          <Icon name="queue" /> {t("playlist")}
        </button>
      </div>

      <div className="search-pill">
        <Icon name="search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchHint")} />
        {query ? (
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setQuery("")} aria-label="clear">
            <Icon name="close" />
          </button>
        ) : null}
      </div>

      {data.tracks.length === 0 ? (
        <div className="empty-state">
          <Icon name="music" />
          <div className="es-title">{t("emptyLibrary")}</div>
          <div className="es-hint">{t("emptyLibraryHint")}</div>
          <button className="btn btn-primary" onClick={goScanner}>{t("scanMusic")}</button>
        </div>
      ) : tracks.length === 0 ? (
        <div className="empty-state">
          <Icon name="search" />
          <div className="es-title">{t("noResults")}</div>
          <div className="es-hint">{t("tryOtherKeywords")}</div>
        </div>
      ) : (
        <div className="home-list">
          <div className="list-count">{query ? `${t("results")} · ${tracks.length}` : `${tracks.length}`}</div>
          {tracks.map((tr) => (
            <TrackRow key={tr.id} track={tr} queue={tracks} onMenu={setMenuTrack} />
          ))}
        </div>
      )}

      {menuTrack ? (
        <Dialog title={menuTrack.title} onClose={() => setMenuTrack(null)}>
          <div>
            <button className="menu-item" onClick={() => { setPickPlaylistFor(menuTrack); setMenuTrack(null); }}>
              <Icon name="addList" /> {t("add")} · {t("playlist")}
            </button>
            <button className="menu-item danger" onClick={() => { removeTrackFromLibrary(menuTrack.id); setMenuTrack(null); showToast(t("musicDeleted")); }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.playlists.map((p) => (
                <button key={p.id} className="btn btn-secondary" onClick={() => {
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
            <button className="menu-item danger" onClick={() => { setShowHomeMenu(false); setConfirmClearLibrary(true); }}>
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

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
