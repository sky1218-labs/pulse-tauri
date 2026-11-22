import { Icon, Equalizer, PlayPauseIcon } from "./components";
import { displayTitle } from "../utils/playlist";
import { usePlayer } from "../store";

export function MiniPlayer({ onOpen, hidden }: { onOpen: () => void; hidden?: boolean }) {
  const player = usePlayer();
  if (!player.current) return null;
  const progress = player.durationMs > 0 ? (player.positionMs / player.durationMs) * 100 : 0;
  return (
    <div className={`mini-player${hidden ? " shell-hidden" : ""}`} aria-hidden={hidden || undefined}>
      <div className="progress-track" />
      <div className="progress" style={{ width: `${progress}%` }} />
      <div className="art" onClick={onOpen}>
        {player.current.artworkPath ? <img src={player.current.artworkPath} alt="" /> : <Icon name="music" />}
      </div>
      <button className="meta" onClick={onOpen} style={{ background: "none" }}>
        <div className="title">{displayTitle(player.current)}</div>
        <div className="sub">{player.current.artist || ""}</div>
      </button>
      {player.playing ? <Equalizer /> : null}
      <button className="icon-btn" onClick={player.previous} aria-label="previous">
        <Icon name="prev" />
      </button>
      <button className="play-btn" onClick={player.togglePlay} aria-label="play/pause">
        <PlayPauseIcon playing={player.playing} />
      </button>
      <button className="icon-btn" onClick={player.next} aria-label="next">
        <Icon name="next" />
      </button>
    </div>
  );
}
