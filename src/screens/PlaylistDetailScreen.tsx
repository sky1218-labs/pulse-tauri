import { useMemo, useState } from "react";
import { Icon, TrackRow, Dialog, ConfirmDialog } from "../components/components";
import { formatTime } from "../utils/time";
import { reorderTracks, removeTrack, type Track } from "../utils/playlist";
import { useLibrary } from "../store";

export function PlaylistDetailScreen({ playlistId, goBack }: { playlistId: string; goBack: () => void }) {
  const { data, t, tracksById, setPlaylistTracks, addToPlaylist } = useLibrary();
  const playlist = data.playlists.find((p) => p.id === playlistId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = useState<Track | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const tracks = useMemo(
    () => (playlist ? playlist.trackIds.map((id) => tracksById.get(id)).filter((x): x is Track => !!x) : []),
    [playlist, tracksById],
  );

  if (!playlist) {
    return (
      <div className="screen">
        <div className="empty-state">
          <div className="es-title">{t("playlistNotFound")}</div>
          <button className="btn btn-primary" onClick={goBack}>{t("close")}</button>
        </div>
      </div>
    );
  }

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= tracks.length) return;
    setPlaylistTracks(reorderTracks(playlist, index, target));
  };

  const toggleSelect = (track: Track) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      return next;
    });
  };

  return (
    <div className="screen pad16">
      <div className="screen-header">
        <button className="icon-btn" onClick={goBack} aria-label="back"><Icon name="back" /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playlist.name}</h1>
          <div className="subtitle">
            {t("songsCount", { n: tracks.length })}
          </div>
        </div>
        {tracks.length > 1 ? (
          <button
            className={`edit-toggle${editing ? " on" : ""}`}
            onClick={() => setEditing((v) => !v)}
          >{editing ? t("done") : t("editOrder")}</button>
        ) : null}
        {editing ? null : (
          <button className="icon-btn filled" onClick={() => { setSelected(new Set()); setAdding(true); }} aria-label={t("addSongs")}>
            <Icon name="plus" />
          </button>
        )}
      </div>

      {tracks.length === 0 ? (
        <div className="empty-state">
          <Icon name="queue" />
          <div className="es-title">{t("playlistEmpty")}</div>
          <div className="es-hint">{t("tapToAddSongs")}</div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>{t("addSongs")}</button>
        </div>
      ) : editing ? (
        <div className="edit-list">
          {tracks.map((tr, i) => (
            <div key={tr.id} className="edit-row">
              <TrackRow track={tr} queue={tracks} inert />
              <button className="icon-btn move-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="move up"><Icon name="up" /></button>
              <button className="icon-btn move-btn" disabled={i === tracks.length - 1} onClick={() => move(i, 1)} aria-label="move down"><Icon name="down" /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="row-list">
          {tracks.map((tr) => (
            <TrackRow key={tr.id} track={tr} queue={tracks} onMenu={setRemoveTarget} />
          ))}
        </div>
      )}

      {removeTarget ? (
        <ConfirmDialog
          title={t("removeFromPlaylist")}
          message={t("removeFromPlaylistConfirm", { title: removeTarget.title })}
          confirmLabel={t("delete")}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => { setPlaylistTracks(removeTrack(playlist, removeTarget.id)); setRemoveTarget(null); }}
        />
      ) : null}

      {adding ? (
        <Dialog title={t("addSongs")} onClose={() => setAdding(false)} centered className="r28">
          {data.tracks.length === 0 ? (
            <p>{t("noSongsAvailable")}</p>
          ) : (
            <>
              <div style={{ marginBottom: 12, color: "var(--text-secondary)", fontSize: 13 }}>
                {t("selectedCount", { n: selected.size })}
              </div>
              <div style={{ maxHeight: "46dvh", overflowY: "auto" }}>
                {data.tracks.map((tr) => (
                  <TrackRow key={tr.id} track={tr} queue={[]} selected={selected.has(tr.id)} onSelect={toggleSelect} />
                ))}
              </div>
              <div className="dialog-actions">
                <button className="btn btn-ghost" onClick={() => setAdding(false)}>{t("cancel")}</button>
                <button
                  className="btn btn-primary"
                  disabled={selected.size === 0}
                  onClick={() => {
                    const chosen = data.tracks.filter((x) => selected.has(x.id));
                    addToPlaylist(playlist.id, chosen);
                    setAdding(false);
                    setToast(t("songsAdded", { n: chosen.length }));
                    window.setTimeout(() => setToast(null), 2200);
                  }}
                >{t("add")}</button>
              </div>
            </>
          )}
        </Dialog>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
