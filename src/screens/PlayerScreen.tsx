import { useEffect, useRef, useState } from "react";
import { Icon, Equalizer, PlayPauseIcon } from "../ui/primitives/Icon";
import { Dialog } from "../ui/primitives/Dialog";
import dialogStyles from "../ui/primitives/Dialog.module.css";
import btn from "../ui/primitives/Button.module.css";
import forms from "../ui/primitives/forms.module.css";
import layout from "../styles/layout.module.css";
import { displayTitle } from "../utils/playlist";
import { formatTime } from "../utils/time";
import { formatSpeed, quantizeSpeed, SPEED_PRESETS } from "../utils/playbackSpeed";
import { volumeToPercentage } from "../utils/volume";
import { useArtworkAmbient } from "../utils/artworkColor";
import { tap } from "../utils/haptics";
import { useLibrary, usePlayer, useProgress } from "../store";
import styles from "./PlayerScreen.module.css";

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

/* Slider fill is a runtime percentage — painted as an inline background
   gradient over the module track styles (sanctioned inline style). */
function fillStyle(value: number, min: number, max: number): React.CSSProperties {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return { background: `linear-gradient(90deg, var(--slider-fill) ${pct}%, var(--slider-track) ${pct}%)` };
}

/** iOS-style wheel column like the original ListWheelScrollView pickers:
 *  a real scrollable column (touch / mouse wheel / click) with scroll-snap;
 *  the centred value sits in the highlighted band, neighbours fade out
 *  under the edge mask. The value is committed when scrolling settles. */
export function Wheel({ value, max, onChange, label, labelBelow, compact }: {
  value: number; max: number; onChange: (v: number) => void;
  label?: string; labelBelow?: boolean; compact?: boolean;
}) {
  const rowH = compact ? 30 : 40;
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleRef = useRef<number | undefined>(undefined);
  const [center, setCenter] = useState(value);

  // Mount: land on the value instantly (no animation).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = value * rowH;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (row click, parent state) glide into place.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCenter(value);
    const target = value * rowH;
    if (Math.abs(el.scrollTop - target) > 1) {
      el.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [value, rowH]);

  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.min(max, Math.max(0, Math.round(el.scrollTop / rowH)));
    setCenter(idx);
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      if (idx !== value) onChange(idx);
    }, 90);
  };

  const rowClass = (v: number) => {
    const d = Math.abs(v - center);
    return `${styles.wRow}${compact ? ` ${styles.wRowCompact}` : ""} ${d === 0 ? styles.wRowSel : d === 1 ? styles.wRowNear : styles.wRowFar}`;
  };

  return (
    <div className={styles.wheel}>
      {label && !labelBelow ? <div className={styles.wLabel}>{label}</div> : null}
      <div
        className={`${styles.wScroll}${compact ? ` ${styles.wScrollCompact}` : ""}`}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div className={compact ? styles.wPadCompact : styles.wPad} />
        {Array.from({ length: max + 1 }, (_, v) => (
          <button key={v} className={rowClass(v)} onClick={() => onChange(v)}>{pad2(v)}</button>
        ))}
        <div className={compact ? styles.wPadCompact : styles.wPad} />
      </div>
      {label && labelBelow ? <div className={styles.wLabelBelow}>{label}</div> : null}
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
    <Dialog title={t("sleepTimerTitle")} onClose={onClose} centered bare tone="elevated">
      <div className={styles.sleepHead}>
        <span className={styles.moonCircle}><Icon name="moon" /></span>
        <h2 className={styles.sleepTitle}>{t("sleepTimerTitle")}</h2>
        <div className={styles.sleepSub}>
          {active
            ? `${t("sleepTimerActive")}${player.sleepRemainingMs !== null && !player.sleepTimer?.endOfTrack ? ` · ${formatTime(player.sleepRemainingMs)}` : ""}`
            : t("sleepTimerSetTime")}
        </div>
      </div>

      <div className={styles.presetGrid}>
        {SLEEP_PRESETS.map((p) => (
          <button
            key={p.ms}
            className={`${styles.presetCard}${sel.kind === "preset" && sel.ms === p.ms ? ` ${styles.presetCardSelected}` : ""}`}
            onClick={() => setSel({ kind: "preset", ms: p.ms })}
          >
            <span className={styles.pVal}>{p.label}</span>
            <span className={styles.pUnit}>{t(p.unitKey)}</span>
          </button>
        ))}
        <button
          className={`${styles.presetCard}${sel.kind === "endOfTrack" ? ` ${styles.presetCardSelected}` : ""}`}
          onClick={() => setSel({ kind: "endOfTrack" })}
        >
          <span className={styles.pVal}><Icon name="music" /></span>
          <span className={styles.pUnit}>{t("endOfTrack")}</span>
        </button>
      </div>

      <button
        className={`${styles.customCard}${sel.kind === "custom" ? ` ${styles.customCardSelected}` : ""}`}
        onClick={() => setSel({ kind: "custom" })}
      >
        <span className={styles.tuneIc}><TuneIcon /></span>
        <span>{sel.kind === "custom" ? customText() : t("customTime")}</span>
      </button>

      {sel.kind === "custom" ? (
        <div className={styles.customPicker}>
          <div className={styles.wheels}>
            <Wheel value={custom.h} max={23} label={t("hour")} labelBelow compact onChange={(v) => setCustom((c) => ({ ...c, h: v }))} />
            <div className={styles.wSep}>:</div>
            <Wheel value={custom.m} max={59} label={t("minute")} labelBelow compact onChange={(v) => setCustom((c) => ({ ...c, m: v }))} />
            <div className={styles.wSep}>:</div>
            <Wheel value={custom.s} max={59} label={t("second")} labelBelow compact onChange={(v) => setCustom((c) => ({ ...c, s: v }))} />
          </div>
        </div>
      ) : null}

      <div className={`${dialogStyles.dialogActions} ${dialogStyles.dialogActionsStretch}`}>
        {active ? (
          <button className={`${btn.btn} ${btn.btnDanger} ${styles.stretchBtn}`} onClick={() => { player.stopSleep(); onClose(); }}>{t("stopTimer")}</button>
        ) : null}
        <button className={`${btn.btn} ${btn.btnSecondary} ${styles.stretchBtn}`} onClick={onClose}>{t("cancel")}</button>
        <button className={`${btn.btn} ${btn.btnPrimary} ${styles.stretchBtn}`} onClick={start}>
          <Icon name="play" /> {active ? t("update") : t("start")}
        </button>
      </div>
    </Dialog>
  );
}

function JumpToTimeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLibrary();
  const player = usePlayer();
  const progress = useProgress();
  const initSec = Math.floor(progress.positionMs / 1000);
  const [h, setH] = useState(Math.floor(initSec / 3600));
  const [m, setM] = useState(Math.floor((initSec % 3600) / 60));
  const [s, setS] = useState(initSec % 60);
  const maxH = Math.floor(progress.durationMs / 3_600_000);
  const selectedMs = ((h * 60 + m) * 60 + s) * 1000;
  const valid = selectedMs <= progress.durationMs;

  return (
    <Dialog title={t("jumpToTimeTitle")} onClose={onClose} centered bare radius="r12" tone="elevated" pad32>
      <div>
        <div className={styles.jumpTitle}>{t("jumpToTimeTitle")}</div>
        <div className={styles.jumpSub}>{t("totalDuration", { duration: formatTime(progress.durationMs) })}</div>
      </div>
      <div className={styles.wheels}>
        <Wheel value={h} max={Math.max(0, maxH)} label={t("hourLabel")} onChange={setH} />
        <div className={`${styles.wSep} ${styles.wSepTall}`}>:</div>
        <Wheel value={m} max={59} label={t("minuteLabel")} onChange={setM} />
        <div className={`${styles.wSep} ${styles.wSepTall}`}>:</div>
        <Wheel value={s} max={59} label={t("secondLabel")} onChange={setS} />
      </div>
      <div className={`${styles.jumpTime}${valid ? "" : ` ${styles.jumpTimeInvalid}`}`}>
        {pad2(h)}:{pad2(m)}:{pad2(s)}
      </div>
      {!valid ? (
        <div className={styles.jumpError}>{t("timeExceedsDuration")}</div>
      ) : null}
      <div className={dialogStyles.dialogActions}>
        <button className={`${btn.btn} ${btn.btnGhost}`} onClick={onClose}>{t("cancel")}</button>
        <button
          className={`${btn.btn} ${btn.btnPrimary}`}
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
      <div className={styles.speedValue}>{fmtSpeedX(player.speed)}</div>
      <div className={styles.speedChips}>
        {SPEED_PRESETS.map((sp) => (
          <button
            key={sp}
            className={`${btn.chip} ${styles.speedChip}${Math.abs(player.speed - sp) < 0.001 ? ` ${btn.chipSelected}` : ""}`}
            onClick={() => { tap(); player.setSpeed(sp); }}
          >{formatSpeed(sp)}</button>
        ))}
      </div>
      <div className={styles.speedSliderWrap}>
        <input
          className={forms.rangeWhite}
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={player.speed}
          style={fillStyle(player.speed, 0.5, 2)}
          onChange={(e) => player.setSpeed(parseFloat(e.target.value))}
        />
        <div className={styles.timeLabels}><span>0.5x</span><span>{fmtSpeedX(player.speed)}</span><span>2x</span></div>
      </div>
      <p>{t("speedPresets")} · {t("normalSpeed")}: 1x</p>
    </Dialog>
  );
}

export function PlayerScreen({ goBack }: { goBack: () => void }) {
  const { t, data } = useLibrary();
  const player = usePlayer();
  const progress = useProgress();
  const [showSleep, setShowSleep] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  // While the seek thumb is being dragged it shows the scrub position —
  // engine ticks keep reporting the pre-seek position until the seek
  // lands, and letting them drive the input makes the thumb fight back.
  const [scrub, setScrub] = useState<number | null>(null);
  /* Dragging used to call player.seek() on every input event — each one
     an IPC round trip plus a position save. The drag now only moves the
     local thumb; the seek is committed once, when the drag ends. */
  const commitScrub = () => {
    if (scrub === null) return;
    player.seek(scrub);
    setScrub(null);
  };
  const [, forceTick] = useState(0);
  const lastVolumeRef = useRef(1);

  /* Ambient backdrop: each new artwork colour becomes a layer that fades
     in (opacity only) over the previous one; the old layer is pruned once
     the cross-fade has finished. No artwork → no layers → base gradient. */
  const ambient = useArtworkAmbient(player.current?.artworkPath);
  const [layers, setLayers] = useState<{ key: number; color: string }[]>([]);
  const layerKeyRef = useRef(0);
  const artworkSrc = player.current?.artworkPath ?? null;
  useEffect(() => {
    if (!artworkSrc) {
      setLayers([]);
      return;
    }
    if (!ambient) return;
    const key = ++layerKeyRef.current;
    setLayers((prev) => [...prev.slice(-1), { key, color: ambient }]);
    const id = window.setTimeout(() => setLayers((prev) => prev.slice(-1)), 700);
    return () => window.clearTimeout(id);
  }, [ambient, artworkSrc]);

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
    <div className={styles.npHeader}>
      <button className={`${btn.iconBtn} ${styles.hdrBtn}`} onClick={goBack} aria-label="back"><Icon name="chevronDown" /></button>
      <span className={styles.npPill}>
        {player.playing ? <Equalizer /> : null}
        {t("nowPlaying")}
      </span>
      <button
        className={`${styles.moonBtn}${player.sleepTimer ? ` ${styles.moonBtnActive}` : ""}`}
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
      <div className={`${layout.screen} ${styles.playerRoot}`}>
        {header}
        <div className={layout.emptyState}>
          <Icon name="music" />
          <div className={layout.esTitle}>{t("noTrackSelected")}</div>
        </div>
        {showSleep ? <SleepTimerDialog onClose={() => setShowSleep(false)} /> : null}
      </div>
    );
  }

  const track = player.current;
  return (
    <div className={`${layout.screen} ${styles.playerRoot}${layers.length ? ` ${styles.ambientOn}` : ""}`}>
      {layers.map((l) => (
        <div
          key={l.key}
          className={styles.npAmbient}
          style={{ "--np-ambient": l.color } as React.CSSProperties}
        />
      ))}
      {header}
      <div className={styles.playerScreen}>
        <div className={styles.playerArtWrap}>
          <div className={`${styles.playerArt} ${player.playing ? styles.playerArtPlaying : styles.playerArtPaused}`}>
            {track.artworkPath ? <img src={track.artworkPath} alt="" /> : <Icon name="music" />}
          </div>
        </div>
        <div className={styles.playerTitle}>{displayTitle(track)}</div>
        <div className={styles.playerSub}>{track.artist || t("unknownArtist")}</div>

        <div className={styles.seek}>
          <input
            className={`${forms.rangeProgress} ${styles.seekInput}`}
            type="range"
            min={0}
            max={Math.max(1, progress.durationMs)}
            value={scrub ?? Math.min(progress.positionMs, progress.durationMs || progress.positionMs)}
            style={{ ...fillStyle(scrub ?? progress.positionMs, 0, Math.max(1, progress.durationMs)) }}
            onChange={(e) => {
              setScrub(parseFloat(e.target.value));
            }}
            onPointerUp={commitScrub}
            onPointerCancel={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            aria-label="seek"
          />
          <button className={styles.jumpBtn} onClick={() => setShowJump(true)} aria-label={t("jumpToTime")}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="13.5" r="7" />
              <line x1="12" y1="13.5" x2="12" y2="9.8" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="9.5" y1="3" x2="14.5" y2="3" />
            </svg>
          </button>
        </div>
        <div className={styles.timeLabels}>
          <span>{formatTime(scrub ?? progress.positionMs)}</span>
          <span>{formatTime(progress.durationMs)}</span>
        </div>

        <div className={styles.controls}>
          <button className={`${styles.skipBtn} ${styles.skipFlip}`} onClick={player.skipBackward} aria-label={t("rewind")}>
            <Icon name="forward" />
            <span className={styles.skipLabel}>{data.settings.skipBackwardSeconds}s</span>
          </button>
          <button className={`${btn.iconBtn} ${styles.ctrlBtn}`} onClick={player.previous} aria-label={t("previousTrack")}>
            <Icon name="prev" />
          </button>
          <button className={styles.playerPlay} onClick={player.togglePlay} aria-label={t("playPause")}>
            <PlayPauseIcon playing={player.playing} />
          </button>
          <button className={`${btn.iconBtn} ${styles.ctrlBtn}`} onClick={player.next} aria-label={t("nextTrack")}>
            <Icon name="next" />
          </button>
          <button className={styles.skipBtn} onClick={player.skipForward} aria-label={t("fastForward")}>
            <Icon name="forward" />
            <span className={styles.skipLabel}>{data.settings.skipForwardSeconds}s</span>
          </button>
        </div>

        <div className={styles.playerCard}>
          <div className={styles.pcRow}>
            <button className={styles.pcIconBtn} onClick={toggleMute} aria-label={t("muteToggle")}>
              <Icon name={volumeIconName(player.volume)} />
            </button>
            <input
              className={`${forms.rangeThin} ${styles.pcSlider}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={player.volume}
              style={fillStyle(player.volume, 0, 1)}
              onChange={(e) => player.setVolume(parseFloat(e.target.value))}
              aria-label={t("defaultVolume")}
            />
            <span className={styles.pcValue}>{volumeToPercentage(player.volume)}%</span>
          </div>
          <button className={`${styles.pcRow} ${styles.pcRowBtn}`} onClick={() => setShowSpeed(true)} aria-label={t("playbackSpeed")}>
            <span className={styles.pcIconBtn} aria-hidden="true">
              <Icon name="gauge" />
            </span>
            <span className={styles.pcLabel}>{t("playbackSpeed")}</span>
            <span className={styles.pcValue}>{fmtSpeedX(player.speed)}</span>
          </button>
        </div>
      </div>

      {showSleep ? <SleepTimerDialog onClose={() => setShowSleep(false)} /> : null}
      {showJump ? <JumpToTimeDialog onClose={() => setShowJump(false)} /> : null}
      {showSpeed ? <SpeedDialog onClose={() => setShowSpeed(false)} /> : null}
    </div>
  );
}
