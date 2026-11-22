import type { Track } from "../../utils/playlist";
import { displayTitle } from "../../utils/playlist";
import { formatTime } from "../../utils/time";
import { usePlayer } from "../../store";
import { Icon, Equalizer } from "./Icon";
import forms from "./forms.module.css";
import styles from "./TrackRow.module.css";

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
    <div
      className={`${styles.trackRow}${selected ? ` ${styles.trackRowSelected}` : ""}`}
      role="button" tabIndex={0} onClick={handleClick}
    >
      <div className={styles.art}>
        {track.artworkPath ? <img src={track.artworkPath} alt="" /> : <Icon name="music" />}
      </div>
      <div className={styles.meta}>
        <div className={`${styles.title}${isCurrent ? ` ${styles.titleNow}` : ""}`}>{displayTitle(track)}</div>
        <div className={styles.sub}>{track.artist || ""}</div>
      </div>
      <div className={styles.trailing}>
        {isCurrent && player.playing ? <Equalizer /> : null}
        <span>{track.durationMs > 0 ? formatTime(track.durationMs) : "--:--"}</span>
        {onSelect ? (
          <span className={`${forms.checkbox}${selected ? ` ${forms.checkboxChecked}` : ""}`}>{selected ? <Icon name="check" /> : null}</span>
        ) : onMenu ? (
          <button
            className={styles.menuBtn}
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
