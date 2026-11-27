import { useMemo, useState } from "react";
import { Icon } from "../ui/primitives/Icon";
import { Dialog, ConfirmDialog } from "../ui/primitives/Dialog";
import dialogStyles from "../ui/primitives/Dialog.module.css";
import btn from "../ui/primitives/Button.module.css";
import forms from "../ui/primitives/forms.module.css";
import layout from "../styles/layout.module.css";
import { tap } from "../utils/haptics";
import { formatTime } from "../utils/time";
import { totalDurationMs, type Playlist } from "../utils/playlist";
import { useLibrary } from "../store";
import styles from "./PlaylistsScreen.module.css";

export function PlaylistsScreen({ goBack, openPlaylist }: { goBack: () => void; openPlaylist: (id: string) => void }) {
  const { data, t, tracksById, createPlaylist, renamePlaylist, deletePlaylist } = useLibrary();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Playlist | null>(null);
  const [menu, setMenu] = useState<Playlist | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");

  const visiblePlaylists = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.playlists.filter((pl) => pl.name.toLowerCase().includes(q))
      : [...data.playlists];
    const collator = new Intl.Collator(data.settings.locale, { numeric: true, sensitivity: "base" });
    return filtered.sort((a, b) =>
      sortMode === "name" ? collator.compare(a.name, b.name) : b.updatedAt - a.updatedAt);
  }, [data.playlists, query, sortMode, data.settings.locale]);

  return (
    <div className={`${layout.screen} ${layout.pad16}`}>
      <div className={layout.screenHeader}>
        <button className={btn.iconBtn} onClick={goBack} aria-label="back"><Icon name="back" /></button>
        <div className={layout.headerMeta}>
          <h1>{t("playlist")}</h1>
          <div className={layout.subtitle}>{t("playlistDesc")}</div>
        </div>
        <button className={`${btn.iconBtn} ${btn.iconBtnFilled}`} onClick={() => { setName(""); setCreating(true); }} aria-label={t("createPlaylist")}>
          <Icon name="plus" />
        </button>
      </div>

      {data.playlists.length > 0 ? (
        <div className={styles.plControls}>
          <div className={styles.plSearch}>
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchHint")} />
            {query ? (
              <button className={btn.iconBtn} onClick={() => setQuery("")} aria-label="clear">
                <Icon name="close" />
              </button>
            ) : null}
          </div>
          <div className={styles.plSortRow}>
            <button
              className={`${btn.chip}${sortMode === "recent" ? ` ${btn.chipSelected}` : ""}`}
              onClick={() => setSortMode("recent")}
            >{t("playlistSortRecent")}</button>
            <button
              className={`${btn.chip}${sortMode === "name" ? ` ${btn.chipSelected}` : ""}`}
              onClick={() => setSortMode("name")}
            >{t("playlistSortName")}</button>
          </div>
        </div>
      ) : null}

      {data.playlists.length === 0 ? (
        <div className={layout.emptyState}>
          <Icon name="queue" />
          <div className={layout.esTitle}>{t("noPlaylists")}</div>
          <div className={layout.esHint}>{t("noPlaylistsHint")}</div>
          <button className={`${btn.btn} ${btn.btnPrimary}`} onClick={() => { setName(""); setCreating(true); }}>{t("createPlaylist")}</button>
        </div>
      ) : (
        <div className={styles.playlistGrid}>
          {visiblePlaylists.map((p) => {
            const cover = p.trackIds
              .map((id) => tracksById.get(id))
              .find((tr) => tr?.artworkPath)?.artworkPath;
            const duration = totalDurationMs(p, tracksById);
            return (
              <button key={p.id} className={styles.playlistCard} onClick={() => openPlaylist(p.id)}>
                <span className={styles.cardArt}>
                  {cover ? <img src={cover} alt="" /> : <Icon name="queue" />}
                  <span
                    className={styles.cardMenu}
                    role="button"
                    aria-label="menu"
                    onClick={(e) => { e.stopPropagation(); setMenu(p); }}
                  >
                    <Icon name="moreHoriz" />
                  </span>
                </span>
                <div className={styles.cardName}>{p.name}</div>
                <div className={styles.cardSub}>
                  {t("songsCount", { n: p.trackIds.length })}
                  {duration > 0 ? ` · ${formatTime(duration)}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating || renaming ? (
        <Dialog title={renaming ? t("renamePlaylist") : t("createPlaylist")} onClose={() => { setCreating(false); setRenaming(null); }} centered radius="r28">
          <input
            className={forms.textField}
            autoFocus
            value={renaming && name === "" ? renaming.name : name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("playlistNameHint")}
            aria-label={t("playlistName")}
          />
          <div className={dialogStyles.dialogActions}>
            <button className={`${btn.btn} ${btn.btnGhost}`} onClick={() => { setCreating(false); setRenaming(null); }}>{t("cancel")}</button>
            <button
              className={`${btn.btn} ${btn.btnPrimary}`}
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
            <button className={btn.menuItem} onClick={() => { setRenaming(menu); setName(menu.name); setMenu(null); }}>
              <Icon name="edit" /> {t("renamePlaylist")}
            </button>
            <button className={`${btn.menuItem} ${btn.menuItemDanger}`} onClick={() => { setConfirmDelete(menu); setMenu(null); }}>
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
