import { useMemo, useState } from "react";
import { Icon } from "../ui/primitives/Icon";
import { TrackRow } from "../ui/primitives/TrackRow";
import { Dialog, ConfirmDialog } from "../ui/primitives/Dialog";
import dialogStyles from "../ui/primitives/Dialog.module.css";
import btn from "../ui/primitives/Button.module.css";
import layout from "../styles/layout.module.css";
import { reorderTracks, removeTrack, type Track } from "../utils/playlist";
import { useLibrary } from "../store";
import styles from "./PlaylistDetailScreen.module.css";

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
      <div className={layout.screen}>
        <div className={layout.emptyState}>
          <div className={layout.esTitle}>{t("playlistNotFound")}</div>
          <button className={`${btn.btn} ${btn.btnPrimary}`} onClick={goBack}>{t("close")}</button>
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
    <div className={`${layout.screen} ${layout.pad16}`}>
      <div className={layout.screenHeader}>
        <button className={btn.iconBtn} onClick={goBack} aria-label="back"><Icon name="back" /></button>
        <div className={layout.headerMeta}>
          <h1 className={styles.plTitle}>{playlist.name}</h1>
          <div className={layout.subtitle}>
            {t("songsCount", { n: tracks.length })}
          </div>
        </div>
        {tracks.length > 1 ? (
          <button
            className={`${styles.editToggle}${editing ? ` ${styles.editToggleOn}` : ""}`}
            onClick={() => setEditing((v) => !v)}
          >{editing ? t("done") : t("editOrder")}</button>
        ) : null}
        {editing ? null : (
          <button className={`${btn.iconBtn} ${btn.iconBtnFilled}`} onClick={() => { setSelected(new Set()); setAdding(true); }} aria-label={t("addSongs")}>
            <Icon name="plus" />
          </button>
        )}
      </div>

      {tracks.length === 0 ? (
        <div className={layout.emptyState}>
          <Icon name="queue" />
          <div className={layout.esTitle}>{t("playlistEmpty")}</div>
          <div className={layout.esHint}>{t("tapToAddSongs")}</div>
          <button className={`${btn.btn} ${btn.btnPrimary}`} onClick={() => setAdding(true)}>{t("addSongs")}</button>
        </div>
      ) : editing ? (
        <div className={styles.editList}>
          {tracks.map((tr, i) => (
            <div key={tr.id} className={styles.editRow}>
              <TrackRow track={tr} queue={tracks} inert />
              <button className={`${btn.iconBtn} ${styles.moveBtn}`} disabled={i === 0} onClick={() => move(i, -1)} aria-label="move up"><Icon name="up" /></button>
              <button className={`${btn.iconBtn} ${styles.moveBtn}`} disabled={i === tracks.length - 1} onClick={() => move(i, 1)} aria-label="move down"><Icon name="down" /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.rowBleed}>
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
        <Dialog title={t("addSongs")} onClose={() => setAdding(false)} centered radius="r28">
          {data.tracks.length === 0 ? (
            <p>{t("noSongsAvailable")}</p>
          ) : (
            <>
              <div className={styles.selectedCount}>
                {t("selectedCount", { n: selected.size })}
              </div>
              <div className={styles.addList}>
                {data.tracks.map((tr) => (
                  <TrackRow key={tr.id} track={tr} queue={[]} selected={selected.has(tr.id)} onSelect={toggleSelect} />
                ))}
              </div>
              <div className={dialogStyles.dialogActions}>
                <button className={`${btn.btn} ${btn.btnGhost}`} onClick={() => setAdding(false)}>{t("cancel")}</button>
                <button
                  className={`${btn.btn} ${btn.btnPrimary}`}
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

      {toast ? <div className={layout.toast}>{toast}</div> : null}
    </div>
  );
}
