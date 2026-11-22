import { Icon, Equalizer, PlayPauseIcon } from "../primitives/Icon";
import btn from "../primitives/Button.module.css";
import { displayTitle } from "../../utils/playlist";
import { usePlayer } from "../../store";
import styles from "./MiniPlayer.module.css";

export function MiniPlayer({ onOpen, hidden }: { onOpen: () => void; hidden?: boolean }) {
  const player = usePlayer();
  if (!player.current) return null;
  const progress = player.durationMs > 0 ? (player.positionMs / player.durationMs) * 100 : 0;
  return (
    <div className={`${styles.miniPlayer}${hidden ? ` ${styles.shellHidden}` : ""}`} aria-hidden={hidden || undefined}>
      <div className={styles.progressTrack} />
      <div className={styles.progress} style={{ width: `${progress}%` }} />
      <div className={styles.art} onClick={onOpen}>
        {player.current.artworkPath ? <img src={player.current.artworkPath} alt="" /> : <Icon name="music" />}
      </div>
      <button className={styles.meta} onClick={onOpen}>
        <div className={styles.title}>{displayTitle(player.current)}</div>
        <div className={styles.sub}>{player.current.artist || ""}</div>
      </button>
      {player.playing ? <Equalizer /> : null}
      <button className={btn.iconBtn} onClick={player.previous} aria-label="previous">
        <Icon name="prev" />
      </button>
      <button className={btn.playBtn} onClick={player.togglePlay} aria-label="play/pause">
        <PlayPauseIcon playing={player.playing} />
      </button>
      <button className={btn.iconBtn} onClick={player.next} aria-label="next">
        <Icon name="next" />
      </button>
    </div>
  );
}
