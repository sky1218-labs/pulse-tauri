import { useMemo, useRef, useState } from "react";
import { Icon, Dialog } from "../components/components";
import type { Track } from "../utils/playlist";
import { isAudioPath, basenameWithoutExtension } from "../utils/audioPath";
import { useLibrary } from "../store";
import { tap } from "../utils/haptics";
import { isTauri, isAndroid, ANDROID_MUSIC_DIRS, pickFiles, pickFolder, scanFolder, getAudioMetadata, toTrack, type ScannedTrack } from "../tauri";
import { newId } from "../repository";

type Phase = "idle" | "scanning" | "done" | "failed";

interface FoundFolder {
  key: string;
  name: string;
  path: string;
  tracks: Track[];
}

function folderOf(track: Track, fallbackName: string): { key: string; name: string; path: string } {
  const p = track.path;
  if (!p.startsWith("blob:") && !p.startsWith("data:") && p.includes("/")) {
    const dir = p.slice(0, p.lastIndexOf("/")) || "/";
    const name = dir.split("/").filter(Boolean).pop() ?? dir;
    return { key: dir, name, path: dir };
  }
  return { key: "__imported__", name: fallbackName, path: "" };
}

export function ScannerScreen({ goBack }: { goBack: () => void }) {
  const { data, t, importTracks, importFolderPlaylists, updateSettings } = useLibrary();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [found, setFound] = useState<Track[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const browserFileRef = useRef<HTMLInputElement>(null);
  const browserFolderRef = useRef<HTMLInputElement>(null);
  /** True when the current result set came from a folder-based import (folder picker / Auto Scan) — only those auto-create folder playlists on save. */
  const byFolderRef = useRef(false);

  const folders = useMemo<FoundFolder[]>(() => {
    const map = new Map<string, FoundFolder>();
    for (const tr of found) {
      const f = folderOf(tr, t("manualImport"));
      const existing = map.get(f.key);
      if (existing) existing.tracks.push(tr);
      else map.set(f.key, { ...f, tracks: [tr] });
    }
    return [...map.values()];
  }, [found, t]);

  const selectedTrackCount = useMemo(
    () => folders.filter((f) => selectedFolders.has(f.key)).reduce((n, f) => n + f.tracks.length, 0),
    [folders, selectedFolders],
  );

  const finishScan = (tracks: Track[]) => {
    setFound(tracks);
    const keys = new Set<string>();
    for (const tr of tracks) keys.add(folderOf(tr, t("manualImport")).key);
    setSelectedFolders(keys);
    setPhase("done");
  };

  const failWith = (e: unknown) => {
    setErrorDetail(e instanceof Error ? e.message : String(e));
    setPhase("failed");
  };

  const scanTauriFolder = async () => {
    const folder = await pickFolder();
    if (!folder) return;
    byFolderRef.current = true;
    setPhase("scanning");
    setErrorDetail(null);
    try {
      const scanned = await scanFolder(folder);
      const tracks = scanned.map((s) => toTrack(s, newId()));
      if (!data.settings.monitoredFolders.includes(folder)) {
        updateSettings({ monitoredFolders: [...data.settings.monitoredFolders, folder] });
      }
      finishScan(tracks);
    } catch (e) {
      failWith(e);
    }
  };

  /**
   * Android Auto Scan: the system folder picker hands back a document-tree
   * URI the Rust scanner cannot walk, so scan the standard music locations
   * by path instead (the app requests READ_MEDIA_AUDIO at startup).
   * Music/Download first; the storage root is only a fallback, and results
   * are deduped by path so the fallback never double-lists a track.
   */
  const scanAndroidStandardDirs = async () => {
    byFolderRef.current = true;
    setPhase("scanning");
    setErrorDetail(null);
    const byPath = new Map<string, ScannedTrack>();
    const errors: string[] = [];
    for (const dir of ANDROID_MUSIC_DIRS) {
      if (dir === "/storage/emulated/0" && byPath.size > 0) break;
      try {
        const scanned = await scanFolder(dir);
        for (const s of scanned) byPath.set(s.path, s);
      } catch (e) {
        errors.push(`${dir}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (byPath.size === 0 && errors.length > 0) {
      failWith(new Error(errors.join(" · ")));
      return;
    }
    finishScan([...byPath.values()].map((s) => toTrack(s, newId())));
  };

  const importTauriFiles = async () => {
    const files = await pickFiles();
    if (files.length === 0) return;
    byFolderRef.current = false;
    setPhase("scanning");
    setErrorDetail(null);
    try {
      const metas = await Promise.all(files.filter(isAudioPath).map((f) => getAudioMetadata(f)));
      finishScan(metas.map((s) => toTrack(s, newId())));
    } catch (e) {
      failWith(e);
    }
  };

  const startAutoScan = () => {
    if (isAndroid()) void scanAndroidStandardDirs();
    else if (isTauri()) void scanTauriFolder();
    else browserFolderRef.current?.click();
  };

  const chooseFiles = () => {
    setShowImport(false);
    if (isTauri()) void importTauriFiles();
    else browserFileRef.current?.click();
  };

  const chooseFolder = () => {
    setShowImport(false);
    if (isTauri()) void scanTauriFolder();
    else browserFolderRef.current?.click();
  };

  /** Browser fallback (dev/preview only): picked files become session tracks via object URLs. */
  const onBrowserFiles = (fileList: FileList | null, byFolder: boolean) => {
    if (!fileList) return;
    byFolderRef.current = byFolder;
    const tracks: Track[] = [];
    for (const f of Array.from(fileList)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      if (!isAudioPath(rel)) continue;
      tracks.push({
        id: newId(),
        path: URL.createObjectURL(f),
        title: basenameWithoutExtension(f.name),
        durationMs: 0,
        fileSizeBytes: f.size,
        addedAt: Date.now(),
      });
    }
    finishScan(tracks);
  };

  const doSave = () => {
    const chosen = folders.filter((f) => selectedFolders.has(f.key)).flatMap((f) => f.tracks);
    if (chosen.length === 0) {
      setToast(t("noFilesSelected"));
      return;
    }
    tap();
    const { added } = importTracks(chosen);
    if (byFolderRef.current) {
      // Folder-based import: one playlist per selected folder, named after
      // it. The manual-import fallback group has no real folder — skip it.
      const groups = folders
        .filter((f) => selectedFolders.has(f.key) && f.key !== "__imported__")
        .map((f) => ({ name: f.name, paths: f.tracks.map((tr) => tr.path) }));
      if (groups.length > 0) importFolderPlaylists(groups);
    }
    setToast(`${t("scanComplete")} · ${t("songsAdded", { n: added })}`);
    setPhase("idle");
    setFound([]);
    window.setTimeout(() => goBack(), 600);
  };

  const toggleFolder = (key: string) =>
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="screen pad16">
      <div className="screen-header">
        <button className="icon-btn" onClick={goBack} aria-label="back"><Icon name="back" /></button>
        <div style={{ flex: 1 }}>
          <h1>{t("scanMusic")}</h1>
          <div className="subtitle">{t("scanMusicDesc")}</div>
        </div>
      </div>

      {phase === "idle" || phase === "failed" ? (
        <>
          <div className="scan-hero">
            <Icon name="folder" />
            <h2>{t("addMusic")}</h2>
            <p>{t("addMusicDesc")}</p>
            {phase === "failed" ? <p style={{ color: "var(--error)" }}>{t("scanFailed")}</p> : null}
            {phase === "failed" && errorDetail ? (
              <p style={{ color: "var(--text-hint)", fontSize: 12, overflowWrap: "anywhere" }}>{errorDetail}</p>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
              <button className="btn btn-primary" onClick={startAutoScan}>
                <Icon name="search" /> {t("autoScan")}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
                <Icon name="plus" /> {t("manualImport")}
              </button>
            </div>
          </div>
          {data.settings.monitoredFolders.length > 0 ? (
            <>
              <div className="section-title">{t("scanFolders")}</div>
              {data.settings.monitoredFolders.map((f) => (
                <div key={f} className="track-row">
                  <div className="art"><Icon name="folder" /></div>
                  <div className="meta"><div className="title" style={{ fontSize: 13 }}>{f}</div></div>
                </div>
              ))}
            </>
          ) : null}
        </>
      ) : null}

      {phase === "scanning" ? (
        <div style={{ paddingTop: 24 }}>
          <div className="scan-card">
            <div className="sc-head"><span className="spinner" /> {t("scanning")}</div>
            <div className="sc-line">{t("filesFound", { n: 0 })}</div>
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <>
          <div className="scan-card">
            <div className="sc-head">
              <span className="check-circle"><Icon name="checkCircle" /></span>
              {t("scanComplete")}
            </div>
            <div className="sc-line">{t("filesFound", { n: found.length })}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={startAutoScan}>
              <Icon name="refresh" /> {t("refreshLibrary")}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowImport(true)}>
              <Icon name="plus" /> {t("addMore")}
            </button>
          </div>

          <div className="sel-head">
            <span className="count">{selectedFolders.size} / {folders.length}</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-small" onClick={() => setSelectedFolders(new Set(folders.map((f) => f.key)))}>{t("selectAll")}</button>
              <button className="btn btn-ghost btn-small" onClick={() => setSelectedFolders(new Set())}>{t("selectNone")}</button>
            </span>
          </div>

          {folders.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>{t("noMusicFolders")}</p>
          ) : (
            folders.map((f) => (
              <div key={f.key} className={`folder-row${selectedFolders.has(f.key) ? " sel" : ""}`} role="button" tabIndex={0} onClick={() => toggleFolder(f.key)}>
                <span className={`checkbox square${selectedFolders.has(f.key) ? " checked" : ""}`}>
                  {selectedFolders.has(f.key) ? <Icon name="check" /> : null}
                </span>
                <span className="f-ic"><Icon name="folder" /></span>
                <span className="meta">
                  <span className="f-name" style={{ display: "block" }}>{f.name}</span>
                  {f.path ? <span className="f-path" style={{ display: "block" }}>{f.path}</span> : null}
                </span>
                <span className="count-badge">{f.tracks.length}</span>
              </div>
            ))
          )}

          {/* lets the last folder row scroll fully clear of the sticky bar */}
          <div style={{ height: 84, flex: "none" }} />

          <div className="summary-bar">
            <div className="meta">
              <div className="sb-title">{t("foldersCount", { n: selectedFolders.size })}</div>
              <div className="sb-sub">{t("tracksCount", { n: selectedTrackCount })}</div>
            </div>
            <button className="btn btn-primary" disabled={selectedFolders.size === 0} onClick={doSave}>{t("save")}</button>
          </div>
        </>
      ) : null}

      {showImport ? (
        <Dialog title={t("importMusic")} onClose={() => setShowImport(false)} centered className="r28">
          <p>{t("importMusicDesc")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={chooseFiles}>{t("selectFiles")}</button>
            <button className="btn btn-secondary" onClick={chooseFolder}>{t("selectFolder")}</button>
          </div>
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => setShowImport(false)}>{t("cancel")}</button>
          </div>
        </Dialog>
      ) : null}

      <input ref={browserFileRef} type="file" accept="audio/*,.flac" multiple hidden onChange={(e) => onBrowserFiles(e.target.files, false)} />
      <input
        ref={browserFolderRef}
        type="file"
        multiple
        hidden
        // @ts-expect-error webkitdirectory is not in React types
        webkitdirectory=""
        onChange={(e) => onBrowserFiles(e.target.files, true)}
      />

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
