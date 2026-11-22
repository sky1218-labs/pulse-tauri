import { useEffect, useRef, useState } from "react";
import { Icon, Dialog, Equalizer, PlayPauseIcon } from "../components/components";
import { displayTitle } from "../utils/playlist";
import { formatTime } from "../utils/time";
import { formatSpeed, quantizeSpeed, SPEED_PRESETS } from "../utils/playbackSpeed";
import { volumeToPercentage } from "../utils/volume";
import { tap } from "../utils/haptics";
import { useLibrary, usePlayer } from "../store";

/** Quick-pick speed chips on the player card (the dialog keeps the full set + fine slider). */

/** Original VolumeSlider icon logic: off / mute / down / up by level. */
function volumeIconName(v: number): "volumeOff" | "volumeMute" | "volumeDown" | "volume" {
  if (v <= 0) return "volumeOff";
  if (v < 0.3) return "volumeMute";
  if (v < 0.7) return "volumeDown";
  return "volume";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Original PlaybackSpeedUtils.format style for the player speed button: 1.0x. */
function fmtSpeedX(v: number): string {
  const q = quantizeSpeed(v);
  return Number.isInteger(q) ? `${q.toFixed(1)}x` : `${q}x`;
}

function fillStyle(value: number, min: number, max: number): React.CSSProperties {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return { background: `linear-gradient(90deg, var(--slider-fill) ${pct}%, var(--slider-track) ${pct}%)` };
}

/** iOS-style wheel column like the original ListWheelScrollView pickers:
 *  selected value in a highlighted band, neighbours fading out. Click a
 *  neighbour to move to it. */
export function Wheel({ value, max, onChange, label, labelBelow, compact }: {
  value: number; max: number; onChange: (v: number) => void;
  label?: string; labelBelow?: boolean; compact?: boolean;
}) {
  const offsets = compact ? [-1, 0, 1] : [-2, -1, 0, 1, 2];
  const rowH = compact ? 30 : 40;
  return (
    <div className="wheel">
      {label && !labelBelow ? <div className="w-label">{label}</div> : null}
      <div className="w-band" style={{ height: offsets.length * rowH }}>
        {offsets.map((off) => {
          const v = value + off;
          if (v < 0 || v > max) return <div key={off} className="w-row" style={{ height: rowH }} />;
          return (
            <button
              key={off}
              style={{ height: rowH }}
              className={`w-row ${off === 0 ? "sel" : Math.abs(off) === 1 ? "near" : "far"}`}
              onClick={() => onChange(v)}
            >{pad2(v)}</button>
          );
        })}
      </div>
      {label && labelBelow ? <div className="w-label-below">{label}</div> : null}
    </div>
  );
}

function TuneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" /><circle cx="9" cy="6" r="2.4" />
      <line x1="3" y1="12" x2="21" y2="12" /><circle cx="15" cy="12" r="2.4" />
      <line x1="3" y1="18" x2="21" y2="18" /><circle cx="7" cy="18" r="2.4" />
    </svg>
  );
}

/* Sleep timer presets from the original SleepTimerPreset enum. */
const SLEEP_PRESETS: { label: string; unitKey: "minutes" | "hours"; ms: number }[] = [
  { label: "15", unitKey: "minutes", ms: 15 * 60_000 },
  { label: "30", unitKey: "minutes", ms: 30 * 60_000 },
  { label: "45", unitKey: "minutes", ms: 45 * 60_000 },
  { label: "1", unitKey: "hours", ms: 60 * 60_000 },
  { label: "2", unitKey: "hours", ms: 2 * 60 * 60_000 },
];

type SleepSel = { kind: "preset"; ms: number } | { kind: "endOfTrack" } | { kind: "custom" };

function SleepTimerDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLibrary();
  const player = usePlayer();
  const active = !!player.sleepTimer;

  const [sel, setSel] = useState<SleepSel>(() => {
    if (player.sleepTimer?.endOfTrack) return { kind: "endOfTrack" };
    if (player.sleepTimer) {
      const ms = player.sleepRemainingMs ?? player.sleepTimer.durationMs;
      const preset = SLEEP_PRESETS.find((p) => p.ms === player.sleepTimer!.durationMs);
      if (preset) return { kind: "preset", ms: preset.ms };
      void ms;
      return { kind: "custom" };
    }
    return { kind: "custom" };
  });
  const initCustom = () => {
    if (player.sleepTimer && !player.sleepTimer.endOfTrack) {
      const total = Math.round((player.sleepTimer.durationMs / 1000));
      return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
    }
    return { h: 0, m: 30, s: 0 };
  };
  const [custom, setCustom] = useState(initCustom);

  const customMs = ((custom.h * 60 + custom.m * 60) + custom.s) * 1000;
  const customText = () => {
    const parts: string[] = [];
    if (custom.h > 0) parts.push(`${custom.h} ${t("hours")}`);
    if (custom.m > 0) parts.push(`${custom.m} ${t("minutes")}`);
    if (custom.s > 0) parts.push(`${custom.s} ${t("second")}`);
    return parts.length ? parts.join(" ") : `0 ${t("second")}`;
  };

  const start = () => {
    if (sel.kind === "preset") player.startSleep(sel.ms);
    else if (sel.kind === "endOfTrack") player.startSleep(0);
    else if (customMs > 0) player.startSleep(customMs);
    else return;
    tap();
    onClose();
  };

  return (
    <Dialog title={t("sleepTimerTitle")} onClose={onClose} centered bare className="on-elevated">
      <div className="sleep-head">
        <span className="moon-circle"><Icon name="moon" /></span>
        <h2>{t("sleepTimerTitle")}</h2>
        <div className="sub">
          {active
            ? `${t("sleepTimerActive")}${player.sleepRemainingMs !== null && !player.sleepTimer?.endOfTrack ? ` · ${formatTime(player.sleepRemainingMs)}` : ""}`
            : t("sleepTimerSetTime")}
        </div>
      </div>

      <div className="preset-grid">
        {SLEEP_PRESETS.map((p) => (
          <button
            key={p.ms}
            className={`preset-card${sel.kind === "preset" && sel.ms === p.ms ? " selected" : ""}`}
            onClick={() => setSel({ kind: "preset", ms: p.ms })}
          >
            <span className="p-val">{p.label}</span>
            <span className="p-unit">{t(p.unitKey)}</span>
          </button>
        ))}
        <button
          className={`preset-card${sel.kind === "endOfTrack" ? " selected" : ""}`}
          onClick={() => setSel({ kind: "endOfTrack" })}
        >
          <span className="p-val"><Icon name="music" /></span>
          <span className="p-unit">{t("endOfTrack")}</span>
        </button>
      </div>

      <button
        className={`custom-card${sel.kind === "custom" ? " selected" : ""}`}
        onClick={() => setSel({ kind: "custom" })}
      >
        <span className="tune-ic"><TuneIcon /></span>
        <span>{sel.kind === "custom" ? customText() : t("customTime")}</span>
      </button>

      {sel.kind === "custom" ? (
        <div className="custom-picker">
          <div className="wheels">
            <Wheel value={custom.h} max={23} label={t("hour")} labelBelow compact onChange={(v) => setCustom((c) => ({ ...c, h: v }))} />
            <div className="w-sep">:</div>
            <Wheel value={custom.m} max={59} label={t("minute")} labelBelow compact onChange={(v) => setCustom((c) => ({ ...c, m: v }))} />
            <div className="w-sep">:</div>
            <Wheel value={custom.s} max={59} label={t("second")} labelBelow compact onChange={(v) => setCustom((c) => ({ ...c, s: v }))} />
          </div>
        </div>
      ) : null}

      <div className="dialog-actions stretch">
        {active ? (
          <button className="btn btn-danger" onClick={() => { player.stopSleep(); onClose(); }}>{t("stopTimer")}</button>
        ) : null}
        <button className="btn btn-secondary" onClick={onClose}>{t("cancel")}</button>
        <button className="btn btn-primary" onClick={start}>
          <Icon name="play" /> {active ? t("update") : t("start")}
        </button>
      </div>
    </Dialog>
  );
}

function JumpToTimeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLibrary();
  const player = usePlayer();
  const initSec = Math.floor(player.positionMs / 1000);
  const [h, setH] = useState(Math.floor(initSec / 3600));
  const [m, setM] = useState(Math.floor((initSec % 3600) / 60));
  const [s, setS] = useState(initSec % 60);
  const maxH = Math.floor(player.durationMs / 3_600_000);
  const selectedMs = ((h * 60 + m) * 60 + s) * 1000;
  const valid = selectedMs <= player.durationMs;

  return (
    <Dialog title={t("jumpToTimeTitle")} onClose={onClose} centered bare className="r12 on-elevated pad32">
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>{t("jumpToTimeTitle")}</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13 }}>{t("totalDuration", { duration: formatTime(player.durationMs) })}</p>
      </div>
      <div className="wheels">
        <Wheel value={h} max={Math.max(0, maxH)} label={t("hourLabel")} onChange={setH} />
        <div className="w-sep" style={{ marginTop: 117 }}>:</div>
        <Wheel value={m} max={59} label={t("minuteLabel")} onChange={setM} />
        <div className="w-sep" style={{ marginTop: 117 }}>:</div>
        <Wheel value={s} max={59} label={t("secondLabel")} onChange={setS} />
      </div>
      <div style={{
        textAlign: "center", fontSize: 24, fontWeight: 500, fontVariantNumeric: "tabular-nums",
        marginTop: 20, color: valid ? "var(--text)" : "var(--error)",
      }}>
        {pad2(h)}:{pad2(m)}:{pad2(s)}
      </div>
      {!valid ? (
        <p style={{ color: "var(--error)", textAlign: "center", marginTop: 8 }}>{t("timeExceedsDuration")}</p>
      ) : null}
      <div className="dialog-actions">
        <button className="btn btn-ghost" onClick={onClose}>{t("cancel")}</button>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => { player.seek(selectedMs); onClose(); }}
        >{t("jump")}</button>
      </div>
    </Dialog>
  );
}

function SpeedDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLibrary();
  const player = usePlayer();
  return (
    <Dialog title={t("playbackSpeed")} onClose={onClose}>
      <div className="speed-value">{fmtSpeedX(player.speed)}</div>
      <div className="chip-row speed-chips">
        {SPEED_PRESETS.map((sp) => (
          <button
            key={sp}
            className={`chip${Math.abs(player.speed - sp) < 0.001 ? " selected" : ""}`}
            onClick={() => { tap(); player.setSpeed(sp); }}
          >{formatSpeed(sp)}</button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <input
          className="range-white"
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={player.speed}
          style={fillStyle(player.speed, 0.5, 2)}
          onChange={(e) => player.setSpeed(parseFloat(e.target.value))}
        />
        <div className="time-labels"><span>0.5x</span><span>{fmtSpeedX(player.speed)}</span><span>2x</span></div>
      </div>
      <p>{t("speedPresets")} · {t("normalSpeed")}: 1x</p>
    </Dialog>
  );
}

export function PlayerScreen({ goBack }: { goBack: () => void }) {
  const { t, data } = useLibrary();
  const player = usePlayer();
  const [showSleep, setShowSleep] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [, forceTick] = useState(0);
  const lastVolumeRef = useRef(1);

  const toggleMute = () => {
    tap();
    if (player.volume > 0) {
      lastVolumeRef.current = player.volume;
      player.setVolume(0);
    } else {
      player.setVolume(lastVolumeRef.current || 1);
    }
  };

  useEffect(() => {
    if (!player.sleepTimer) return;
    const id = window.setInterval(() => forceTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [player.sleepTimer]);

  const header = (
    <div className="screen-header player-header" style={{ paddingBottom: 0 }}>
      <button className="icon-btn" onClick={goBack} aria-label="back"><Icon name="chevronDown" /></button>
      <span className="np-pill">
        {player.playing ? <Equalizer /> : null}
        {t("nowPlaying")}
      </span>
      <button
        className={`moon-btn${player.sleepTimer ? " active" : ""}`}
        onClick={() => setShowSleep(true)}
        aria-label={t("sleepTimer")}
      >
        {player.sleepTimer && player.sleepRemainingMs !== null && !player.sleepTimer.endOfTrack
          ? formatTime(player.sleepRemainingMs)
          : <Icon name="moon" />}
      </button>
    </div>
  );

  if (!player.current) {
    return (
      <div className="screen player-bg">
        {header}
        <div className="empty-state">
          <Icon name="music" />
          <div className="es-title">{t("noTrackSelected")}</div>
        </div>
        {showSleep ? <SleepTimerDialog onClose={() => setShowSleep(false)} /> : null}
      </div>
    );
  }

  const track = player.current;
  return (
    <div className="screen player-bg">
      {header}
      <div className="player-screen">
        <div className="player-art-wrap">
          <div className={`player-art${player.playing ? " playing" : " paused"}`}>
            {track.artworkPath ? <img src={track.artworkPath} alt="" /> : <Icon name="music" />}
          </div>
        </div>
        <div className="player-title now">{displayTitle(track)}</div>
        <div className="player-sub">{track.artist || t("unknownArtist")}</div>

        <div className="seek" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            className="range-progress"
            type="range"
            min={0}
            max={Math.max(1, player.durationMs)}
            value={Math.min(player.positionMs, player.durationMs || player.positionMs)}
            style={{ ...fillStyle(player.positionMs, 0, Math.max(1, player.durationMs)), flex: 1 }}
            onChange={(e) => player.seek(parseFloat(e.target.value))}
            aria-label="seek"
          />
          <button className="jump-btn" onClick={() => setShowJump(true)} aria-label={t("jumpToTime")}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="13.5" r="7" />
              <line x1="12" y1="13.5" x2="12" y2="9.8" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="9.5" y1="3" x2="14.5" y2="3" />
            </svg>
          </button>
        </div>
        <div className="time-labels" style={{ width: "100%" }}>
          <span>{formatTime(player.positionMs)}</span>
          <span>{formatTime(player.durationMs)}</span>
        </div>

        <div className="controls">
          <button className="skip-btn flip" onClick={player.skipBackward} aria-label={t("rewind")}>
            <Icon name="forward" />
            <span className="skip-label">{data.settings.skipBackwardSeconds}s</span>
          </button>
          <button className="icon-btn" onClick={player.previous} aria-label={t("previousTrack")}>
            <Icon name="prev" />
          </button>
          <button className="player-play" onClick={player.togglePlay} aria-label={t("playPause")}>
            <PlayPauseIcon playing={player.playing} />
          </button>
          <button className="icon-btn" onClick={player.next} aria-label={t("nextTrack")}>
            <Icon name="next" />
          </button>
          <button className="skip-btn" onClick={player.skipForward} aria-label={t("fastForward")}>
            <Icon name="forward" />
            <span className="skip-label">{data.settings.skipForwardSeconds}s</span>
          </button>
        </div>

        <div className="player-card">
          <div className="pc-row">
            <button className="pc-icon-btn" onClick={toggleMute} aria-label={t("muteToggle")}>
              <Icon name={volumeIconName(player.volume)} />
            </button>
            <input
              className="range-thin pc-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={player.volume}
              style={fillStyle(player.volume, 0, 1)}
              onChange={(e) => player.setVolume(parseFloat(e.target.value))}
              aria-label={t("defaultVolume")}
            />
            <span className="pc-value">{volumeToPercentage(player.volume)}%</span>
          </div>
          <button className="pc-row pc-row-btn" onClick={() => setShowSpeed(true)} aria-label={t("playbackSpeed")}>
            <span className="pc-icon-btn" aria-hidden="true">
              <Icon name="gauge" />
            </span>
            <span className="pc-label">{t("playbackSpeed")}</span>
            <span className="pc-value">{fmtSpeedX(player.speed)}</span>
          </button>
        </div>
      </div>

      {showSleep ? <SleepTimerDialog onClose={() => setShowSleep(false)} /> : null}
      {showJump ? <JumpToTimeDialog onClose={() => setShowJump(false)} /> : null}
      {showSpeed ? <SpeedDialog onClose={() => setShowSpeed(false)} /> : null}
    </div>
  );
}
