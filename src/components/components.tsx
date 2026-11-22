import React, { useEffect, useRef, useState } from "react";
import type { Track } from "../utils/playlist";
import { displayTitle } from "../utils/playlist";
import { formatTime } from "../utils/time";
import { usePlayer, useLibrary } from "../store";
import { tap } from "../utils/haptics";
import { backNav } from "../utils/backNav";

/* Inline SVG icons (Material-style outlines, drawn for Pulse). */
const P: Record<string, string> = {
  music: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
  search: "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z",
  queue: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5v2h-2V6h2z",
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
  prev: "M6 6h2v12H6zM18 6l-8.5 6L18 18V6z",
  forward: "M4 18l8.5-6L4 6v12zm9.5-12v12L22 12l-8.5-6z",
  replay: "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
  timer: "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.44V4.5a2.5 2.5 0 0 0-5 0v5.06C9 11.1 8 13 8 15a7 7 0 0 0 7 7zM9 2h6v2H9z",
  moon: "M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-5.4-5.4c0-1.81.89-3.42 2.26-4.4C12.92 3.04 12.46 3 12 3z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z",
  radar: "M12 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 2c0-3.31-2.69-6-6-6v2c2.21 0 4 1.79 4 4h2zm4 0c0-5.52-4.48-10-10-10v2c4.42 0 8 3.58 8 8h2zM2 13c0 5.52 4.48 10 10 10v-2c-4.42 0-8-3.58-8-8H2zm4 0c0 3.31 2.69 6 6 6v-2c-2.21 0-4-1.79-4-4H6z",
  folder: "M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z",
  file: "M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  more: "M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  trash: "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z",
  volume: "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
  volumeDown: "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z",
  volumeMute: "M3 9v6h4l5 5V4L7 9H3z",
  volumeOff: "M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.94-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z",
  gauge: "M12 4a9 9 0 0 0-9 9c0 1.66 1.34 3 3 3 .34 0 .67-.06.98-.17L12 12l5.02 3.83c.31.11.64.17.98.17 1.66 0 3-1.34 3-3a9 9 0 0 0-9-9zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14z",
  up: "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12l-8-8-8 8z",
  down: "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.59-5.58L4 12l8 8 8-8z",
  addList: "M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z",
  moreHoriz: "M6 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M18 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  chevronRight: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z",
  chevronDown: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
  refresh: "M17.65 6.35A8 8 0 1 0 19.73 14h-2.08a6 6 0 1 1-1.41-6.24L13 11h7V4l-2.35 2.35z",
  warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  checkCircle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
};

export function Icon({ name, className }: { name: keyof typeof P; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function Equalizer() {
  return (
    <span className="eq" aria-hidden="true">
      <span /><span /><span />
    </span>
  );
}

/** Play/pause glyphs stacked in one grid cell; state change crossfades +
 *  counter-scales them (iOS-style) instead of swapping abruptly. */
export function PlayPauseIcon({ playing }: { playing: boolean }) {
  return (
    <span className={`pp${playing ? " is-playing" : ""}`} aria-hidden="true">
      <Icon name="play" />
      <Icon name="pause" />
    </span>
  );
}

export function TrackRow({
  track, queue, onMenu, selected, onSelect, inert,
}: {
  track: Track;
  queue: Track[];
  onMenu?: (track: Track) => void;
  selected?: boolean;
  onSelect?: (track: Track) => void;
  /** Render-only row: no playback on tap (used by playlist edit mode). */
  inert?: boolean;
}) {
  const player = usePlayer();
  const isCurrent = player.current?.id === track.id;
  const handleClick = () => {
    if (inert) return;
    if (onSelect) onSelect(track);
    else void player.playTrack(track, queue, { fromUserTap: true });
  };
  return (
    <div className={`track-row${selected ? " selected" : ""}`} role="button" tabIndex={0} onClick={handleClick}>
      <div className="art">
        {track.artworkPath ? <img src={track.artworkPath} alt="" /> : <Icon name="music" />}
      </div>
      <div className="meta">
        <div className={`title${isCurrent ? " now-playing" : ""}`}>{displayTitle(track)}</div>
        <div className="sub">{track.artist || ""}</div>
      </div>
      <div className="trailing">
        {isCurrent && player.playing ? <Equalizer /> : null}
        <span className="dur">{track.durationMs > 0 ? formatTime(track.durationMs) : "--:--"}</span>
        {onSelect ? (
          <span className={`checkbox${selected ? " checked" : ""}`}>{selected ? <Icon name="check" /> : null}</span>
        ) : onMenu ? (
          <button
            className="icon-btn"
            style={{ width: 40, height: 40, color: "var(--text-muted)" }}
            onClick={(e) => { e.stopPropagation(); onMenu(track); }}
            aria-label="menu"
          >
            <Icon name="moreHoriz" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Dialog({ title, children, onClose, centered, bare, className }: {
  title: string; children: React.ReactNode; onClose: () => void;
  centered?: boolean; bare?: boolean; className?: string;
}) {
  // Backdrop-tap dismissal plays the exit animation before unmounting;
  // button-driven closes are parent-controlled and unmount immediately.
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };
  // Android back closes the topmost dialog before it navigates/exits.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => backNav.register(() => {
    requestCloseRef.current();
    return true;
  }), []);
  return (
    <div className={`dialog-backdrop${centered ? " center" : ""}${closing ? " closing" : ""}`} onClick={requestClose}>
      <div className={`dialog${centered ? " centered" : ""}${bare ? " bare" : ""}${className ? ` ${className}` : ""}`} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useLibrary();
  return (
    <Dialog title={title} onClose={onCancel} centered bare className="r12 on-elevated">
      <div className="confirm-head">
        <Icon name="warning" />
        <h2>{title}</h2>
      </div>
      <p>{message}</p>
      <div className="dialog-actions">
        <button className="btn-text neutral" onClick={onCancel}>{t("cancel")}</button>
        <button className="btn-text danger" onClick={() => { tap(); onConfirm(); }}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}
