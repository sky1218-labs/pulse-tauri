import { useState } from "react";
import { Icon, Dialog, ConfirmDialog } from "../components/components";
import { tap } from "../utils/haptics";
import { formatTime } from "../utils/time";
import { totalDurationMs, type Playlist } from "../utils/playlist";
import { useLibrary } from "../store";

export function PlaylistsScreen({ goBack, openPlaylist }: { goBack: () => void; openPlaylist: (id: string) => void }) {
  const { data, t, tracksById, createPlaylist, renamePlaylist, deletePlaylist } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Playlist | null>(null);
  const [menu, setMenu] = useState<Playlist | null>(null);

  return (
    <div className="screen pad16">
      <div className="screen-header">
        <button className="icon-btn" onClick={goBack} aria-label="back"><Icon name="back" /></button>
        <div style={{ flex: 1 }}>
          <h1>{t("playlist")}</h1>
          <div className="subtitle">{t("playlistDesc")}</div>
        </div>
        <button className="icon-btn filled" onClick={() => { setName(""); setCreating(true); }} aria-label={t("createPlaylist")}>
          <Icon name="plus" />
        </button>
      </div>

      {data.playlists.length === 0 ? (
        <div className="empty-state">
          <Icon name="queue" />
          <div className="es-title">{t("noPlaylists")}</div>
          <div className="es-hint">{t("noPlaylistsHint")}</div>
          <button className="btn btn-primary" onClick={() => { setName(""); setCreating(true); }}>{t("createPlaylist")}</button>
        </div>
      ) : (
        <div className="row-list">
        {data.playlists.map((p) => (
          <div key={p.id} className="track-row" role="button" tabIndex={0} onClick={() => openPlaylist(p.id)}>
            <div className="art"><Icon name="queue" /></div>
            <div className="meta">
              <div className="title">{p.name}</div>
              <div className="sub">
                {t("songsCount", { n: p.trackIds.length })}
              </div>
            </div>
            <div className="trailing">
              <button className="icon-btn" style={{ width: 32, height: 32, color: "var(--text-muted)" }} onClick={(e) => { e.stopPropagation(); setMenu(p); }} aria-label="menu">
                <Icon name="moreHoriz" />
              </button>
            </div>
          </div>
        ))}
        </div>
      )}

      {creating || renaming ? (
        <Dialog title={renaming ? t("renamePlaylist") : t("createPlaylist")} onClose={() => { setCreating(false); setRenaming(null); }} centered className="r28">
          <input
            className="text-field"
            autoFocus
            value={renaming && name === "" ? renaming.name : name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("playlistNameHint")}
            aria-label={t("playlistName")}
          />
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setRenaming(null); }}>{t("cancel")}</button>
            <button
              className="btn btn-primary"
              disabled={(renaming && name === "" ? renaming.name : name).trim() === ""}
              onClick={() => {
                tap();
                const finalName = (renaming && name === "" ? renaming.name : name).trim();
                if (renaming) renamePlaylist(renaming.id, finalName);
                else createPlaylist(finalName);
                setCreating(false); setRenaming(null); setName("");
              }}
            >{renaming ? t("save") : t("create")}</button>
          </div>
        </Dialog>
      ) : null}

      {menu ? (
        <Dialog title={menu.name} onClose={() => setMenu(null)}>
          <div>
            <button className="menu-item" onClick={() => { setRenaming(menu); setName(menu.name); setMenu(null); }}>
              <Icon name="edit" /> {t("renamePlaylist")}
            </button>
            <button className="menu-item danger" onClick={() => { setConfirmDelete(menu); setMenu(null); }}>
              <Icon name="trash" /> {t("deletePlaylist")}
            </button>
          </div>
        </Dialog>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={t("deletePlaylist")}
          message={t("deletePlaylistConfirm", { name: confirmDelete.name })}
          confirmLabel={t("delete")}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deletePlaylist(confirmDelete.id); setConfirmDelete(null); }}
        />
      ) : null}
    </div>
  );
}
