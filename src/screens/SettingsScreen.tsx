import { useState } from "react";
import { Icon } from "../ui/primitives/Icon";
import { Dialog, ConfirmDialog } from "../ui/primitives/Dialog";
import dialogStyles from "../ui/primitives/Dialog.module.css";
import btn from "../ui/primitives/Button.module.css";
import forms from "../ui/primitives/forms.module.css";
import layout from "../styles/layout.module.css";
import styles from "./SettingsScreen.module.css";
import { useLibrary, usePlayer } from "../store";
import { normalizeLocale, type LocaleCode } from "../i18n";
import { compareVersions, displayVersion } from "../utils/sleepTimer";
import { quantizeSpeed } from "../utils/playbackSpeed";

export const APP_VERSION = "0.2.0";
const RELEASES_API = "https://api.github.com/repos/sky1218-labs/pulse-tauri/releases/latest";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; latest: string; url: string }
  | { kind: "failed" }
  | { kind: "disabled" };

/** Original PlaybackSpeedUtils.format style: 1.0x / 1.25x / 0.5x. */
function fmtSpeed(v: number): string {
  const q = quantizeSpeed(v);
  return Number.isInteger(q) ? `${q.toFixed(1)}x` : `${q}x`;
}

/** Fill percentage helper for the white original-style sliders. */
function sliderStyle(value: number, min: number, max: number): React.CSSProperties {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return {
    background: `linear-gradient(90deg, var(--slider-fill) ${pct}%, var(--slider-track) ${pct}%)`,
  };
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button className={`${forms.switch}${on ? ` ${forms.switchOn}` : ""}`} onClick={onClick} aria-pressed={on} />;
}

function SwitchCard({ title, desc, on, onToggle }: {
  title: string; desc?: string; on: boolean; onToggle: () => void;
}) {
  return (
    <div className={`${styles.setCard} ${styles.setCardRow}`}>
      <div className={styles.setMeta}>
        <div className={styles.sTitle}>{title}</div>
        {desc ? <div className={styles.sDesc}>{desc}</div> : null}
      </div>
      <Toggle on={on} onClick={onToggle} />
    </div>
  );
}

function SliderCard({ title, valueLabel, children }: {
  title: string; valueLabel: string; children: React.ReactNode;
}) {
  return (
    <div className={styles.setCard}>
      <div className={styles.setCardHead}>
        <div className={styles.sTitle}>{title}</div>
        <div className={styles.sValue}>{valueLabel}</div>
      </div>
      {children}
    </div>
  );
}

function ActionCard({ title, desc, icon, danger, onClick, trailing }: {
  title: string; desc?: string; icon: string; danger?: boolean;
  onClick: () => void; trailing?: React.ReactNode;
}) {
  return (
    <button className={`${styles.setCard} ${styles.setCardRow}${danger ? ` ${styles.setCardDanger}` : ""}`} onClick={onClick}>
      <span className={styles.leadIc}><Icon name={icon as never} /></span>
      <span className={styles.setMeta}>
        <span className={`${styles.sTitle} ${styles.blockSpan}`}>{title}</span>
        {desc ? <span className={`${styles.sDesc} ${styles.blockSpan}`}>{desc}</span> : null}
      </span>
      {trailing ?? <span className={styles.chev}><Icon name="chevronRight" /></span>}
    </button>
  );
}

const LOCALES: { code: LocaleCode; label: string }[] = [
  { code: "zh-TW", label: "繁體中文" },
  { code: "zh-CN", label: "简体中文" },
  { code: "en", label: "English" },
];

export function SettingsScreen({ goBack, goScanner }: { goBack: () => void; goScanner: () => void }) {
  const { data, t, updateSettings, resetSettings, clearAllData } = useLibrary();
  const player = usePlayer();
  const s = data.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const checkUpdates = async () => {
    if (!s.autoUpdateEnabled) {
      setUpdate({ kind: "disabled" });
      return;
    }
    setUpdate({ kind: "checking" });
    try {
      const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { tag_name?: string; html_url?: string };
      const latest = (json.tag_name ?? "").replace(/^v/, "");
      if (latest && compareVersions(latest, APP_VERSION) > 0) {
        setUpdate({ kind: "available", latest, url: json.html_url ?? "" });
      } else {
        setUpdate({ kind: "uptodate" });
      }
    } catch {
      setUpdate({ kind: "failed" });
    }
  };

  return (
    <div className={layout.screen}>
      <div className={layout.screenHeader}>
        <button className={btn.iconBtn} onClick={goBack} aria-label="back"><Icon name="back" /></button>
        <div className={layout.headerMeta}>
          <h1>{t("settings")}</h1>
          <div className={layout.subtitle}>{t("settingsDesc")}</div>
        </div>
      </div>

      <h3 className={`${styles.setSection} ${styles.setSectionFirst}`}>{t("appearance")}</h3>
      <SwitchCard title={t("darkMode")} desc={t("darkModeDesc")} on={s.darkMode}
        onToggle={() => updateSettings({ darkMode: !s.darkMode })} />
      <div className={styles.setCard}>
        <div className={styles.sTitle}>{t("language")}</div>
        <div className={styles.sDesc}>{t("languageDesc")}</div>
        <div className={styles.langRow}>
          {LOCALES.map((l) => (
            <button
              key={l.code}
              className={`${styles.langOpt}${s.locale === l.code ? ` ${styles.langOptSelected}` : ""}`}
              onClick={() => updateSettings({ locale: normalizeLocale(l.code) as LocaleCode })}
            >{l.label}</button>
          ))}
        </div>
      </div>

      <h3 className={styles.setSection}>{t("playback")}</h3>
      <SliderCard title={t("defaultVolume")} valueLabel={`${Math.round(s.defaultVolume * 100)}%`}>
        <input
          type="range" className={forms.rangeWhite} min={0} max={1} step={0.05} value={s.defaultVolume}
          style={sliderStyle(s.defaultVolume, 0, 1)}
          onChange={(e) => { const v = parseFloat(e.target.value); updateSettings({ defaultVolume: v }); player.setVolume(v); }}
          aria-label={t("defaultVolume")}
        />
      </SliderCard>
      <SliderCard title={t("defaultSpeed")} valueLabel={fmtSpeed(s.defaultPlaybackSpeed)}>
        <input
          type="range" className={forms.rangeWhite} min={0.5} max={2} step={0.05} value={quantizeSpeed(s.defaultPlaybackSpeed)}
          style={sliderStyle(quantizeSpeed(s.defaultPlaybackSpeed), 0.5, 2)}
          onChange={(e) => { const v = quantizeSpeed(parseFloat(e.target.value)); updateSettings({ defaultPlaybackSpeed: v }); player.setSpeed(v); }}
          aria-label={t("defaultSpeed")}
        />
      </SliderCard>
      <SwitchCard title={t("autoResume")} desc={t("autoResumeDesc")} on={s.autoResume}
        onToggle={() => updateSettings({ autoResume: !s.autoResume })} />
      <SwitchCard title={t("resumePlaybackOnTrackTap")} desc={t("resumePlaybackOnTrackTapDesc")} on={s.resumePlaybackOnTrackTap}
        onToggle={() => updateSettings({ resumePlaybackOnTrackTap: !s.resumePlaybackOnTrackTap })} />
      <SwitchCard title={t("navigateToPlayerOnResume")} desc={t("navigateToPlayerOnResumeDesc")} on={s.navigateToPlayerOnResume}
        onToggle={() => updateSettings({ navigateToPlayerOnResume: !s.navigateToPlayerOnResume })} />

      <h3 className={styles.setSection}>{t("skipSettings")}</h3>
      <SliderCard title={t("skipForward")} valueLabel={t("seconds", { n: s.skipForwardSeconds })}>
        <input
          type="range" className={forms.rangeWhite} min={5} max={60} step={5} value={s.skipForwardSeconds}
          style={sliderStyle(s.skipForwardSeconds, 5, 60)}
          onChange={(e) => updateSettings({ skipForwardSeconds: parseInt(e.target.value, 10) })}
          aria-label={t("skipForward")}
        />
      </SliderCard>
      <SliderCard title={t("skipBackward")} valueLabel={t("seconds", { n: s.skipBackwardSeconds })}>
        <input
          type="range" className={forms.rangeWhite} min={5} max={60} step={5} value={s.skipBackwardSeconds}
          style={sliderStyle(s.skipBackwardSeconds, 5, 60)}
          onChange={(e) => updateSettings({ skipBackwardSeconds: parseInt(e.target.value, 10) })}
          aria-label={t("skipBackward")}
        />
      </SliderCard>

      <h3 className={styles.setSection}>{t("features")}</h3>
      <SwitchCard title={t("autoUpdate")} desc={t("autoUpdateDesc")} on={s.autoUpdateEnabled}
        onToggle={() => updateSettings({ autoUpdateEnabled: !s.autoUpdateEnabled })} />
      <ActionCard title={update.kind === "checking" ? t("checkingForUpdates") : t("checkForUpdates")}
        desc={t("checkForUpdatesDesc")} icon="refresh" onClick={() => void checkUpdates()} />
      {update.kind === "uptodate" ? <p className={styles.updateNote}>{t("updateUpToDate")}</p> : null}
      {update.kind === "failed" ? <p className={`${styles.updateNote} ${styles.updateNoteError}`}>{t("updateCheckFailed")}</p> : null}
      {update.kind === "available" ? (
        <Dialog title={t("updateAvailable")} onClose={() => setUpdate({ kind: "idle" })}>
          <p>{t("updateAvailableMessage", { currentVersion: displayVersion(APP_VERSION), latestVersion: displayVersion(update.latest), assetName: "pulse-android-arm64-v8a.apk" })}</p>
          <div className={dialogStyles.dialogActions}>
            <button className={`${btn.btn} ${btn.btnGhost}`} onClick={() => setUpdate({ kind: "idle" })}>{t("maybeLater")}</button>
            {update.url ? (
              <a className={`${btn.btn} ${btn.btnPrimary}`} href={update.url} target="_blank" rel="noreferrer">{t("downloadUpdate")}</a>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      <ActionCard title={t("scanFolders")} desc={t("scanFoldersDesc")} icon="folder" onClick={goScanner} />

      <h3 className={styles.setSection}>{t("other")}</h3>
      <ActionCard title={t("resetSettings")} desc={t("resetSettingsDesc")} icon="replay"
        onClick={() => setConfirmReset(true)} />
      <ActionCard title={t("clearAllData")} desc={t("clearAllDataDesc")} icon="trash" danger
        onClick={() => setConfirmClearAll(true)} />

      <div className={styles.appInfo}>
        <div className={styles.aiName}>{t("appName")}</div>
        <div className={styles.aiVer}>{t("version")} {displayVersion(APP_VERSION)}</div>
      </div>

      {confirmReset ? (
        <ConfirmDialog title={t("resetSettings")} message={t("resetSettingsConfirm")} confirmLabel={t("reset")}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => { resetSettings(); setConfirmReset(false); showToast(t("settingsReset")); }} />
      ) : null}
      {confirmClearAll ? (
        <ConfirmDialog title={t("clearAllData")} message={t("clearAllDataConfirm")} confirmLabel={t("confirm")}
          onCancel={() => setConfirmClearAll(false)}
          onConfirm={() => { clearAllData(); setConfirmClearAll(false); showToast(t("allDataCleared")); }} />
      ) : null}

      {toast ? <div className={layout.toast}>{toast}</div> : null}
    </div>
  );
}
