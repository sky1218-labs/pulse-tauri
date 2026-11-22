import { useState } from "react";
import { Icon, Dialog, ConfirmDialog } from "../components/components";
import { useLibrary, usePlayer } from "../store";
import { normalizeLocale, type LocaleCode } from "../i18n";
import { compareVersions, displayVersion } from "../utils/sleepTimer";
import { quantizeSpeed } from "../utils/playbackSpeed";

export const APP_VERSION = "0.1.12";
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
  return <button className={`switch${on ? " on" : ""}`} onClick={onClick} aria-pressed={on} />;
}

function SwitchCard({ title, desc, on, onToggle }: {
  title: string; desc?: string; on: boolean; onToggle: () => void;
}) {
  return (
    <div className="set-card set-card-row">
      <div className="meta">
        <div className="s-title">{title}</div>
        {desc ? <div className="s-desc">{desc}</div> : null}
      </div>
      <Toggle on={on} onClick={onToggle} />
    </div>
  );
}

function SliderCard({ title, valueLabel, children }: {
  title: string; valueLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="set-card">
      <div className="set-card-head">
        <div className="s-title">{title}</div>
        <div className="s-value">{valueLabel}</div>
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
    <button className={`set-card set-card-row${danger ? " danger" : ""}`} onClick={onClick}>
      <span className="lead-ic"><Icon name={icon as never} /></span>
      <span className="meta">
        <span className="s-title" style={{ display: "block" }}>{title}</span>
        {desc ? <span className="s-desc" style={{ display: "block" }}>{desc}</span> : null}
      </span>
      {trailing ?? <span className="chev"><Icon name="chevronRight" /></span>}
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
    <div className="screen">
      <div className="screen-header">
        <button className="icon-btn" onClick={goBack} aria-label="back"><Icon name="back" /></button>
        <div style={{ flex: 1 }}>
          <h1>{t("settings")}</h1>
          <div className="subtitle">{t("settingsDesc")}</div>
        </div>
      </div>

      <h3 className="set-section" style={{ marginTop: 0 }}>{t("appearance")}</h3>
      <SwitchCard title={t("darkMode")} desc={t("darkModeDesc")} on={s.darkMode}
        onToggle={() => updateSettings({ darkMode: !s.darkMode })} />
      <div className="set-card">
        <div className="s-title">{t("language")}</div>
        <div className="s-desc">{t("languageDesc")}</div>
        <div className="lang-row">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              className={`lang-opt${s.locale === l.code ? " selected" : ""}`}
              onClick={() => updateSettings({ locale: normalizeLocale(l.code) as LocaleCode })}
            >{l.label}</button>
          ))}
        </div>
      </div>

      <h3 className="set-section">{t("playback")}</h3>
      <SliderCard title={t("defaultVolume")} valueLabel={`${Math.round(s.defaultVolume * 100)}%`}>
        <input
          type="range" className="range-white" min={0} max={1} step={0.05} value={s.defaultVolume}
          style={sliderStyle(s.defaultVolume, 0, 1)}
          onChange={(e) => { const v = parseFloat(e.target.value); updateSettings({ defaultVolume: v }); player.setVolume(v); }}
          aria-label={t("defaultVolume")}
        />
      </SliderCard>
      <SliderCard title={t("defaultSpeed")} valueLabel={fmtSpeed(s.defaultPlaybackSpeed)}>
        <input
          type="range" className="range-white" min={0.5} max={2} step={0.05} value={quantizeSpeed(s.defaultPlaybackSpeed)}
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

      <h3 className="set-section">{t("skipSettings")}</h3>
      <SliderCard title={t("skipForward")} valueLabel={t("seconds", { n: s.skipForwardSeconds })}>
        <input
          type="range" className="range-white" min={5} max={60} step={5} value={s.skipForwardSeconds}
          style={sliderStyle(s.skipForwardSeconds, 5, 60)}
          onChange={(e) => updateSettings({ skipForwardSeconds: parseInt(e.target.value, 10) })}
          aria-label={t("skipForward")}
        />
      </SliderCard>
      <SliderCard title={t("skipBackward")} valueLabel={t("seconds", { n: s.skipBackwardSeconds })}>
        <input
          type="range" className="range-white" min={5} max={60} step={5} value={s.skipBackwardSeconds}
          style={sliderStyle(s.skipBackwardSeconds, 5, 60)}
          onChange={(e) => updateSettings({ skipBackwardSeconds: parseInt(e.target.value, 10) })}
          aria-label={t("skipBackward")}
        />
      </SliderCard>

      <h3 className="set-section">{t("features")}</h3>
      <SwitchCard title={t("autoUpdate")} desc={t("autoUpdateDesc")} on={s.autoUpdateEnabled}
        onToggle={() => updateSettings({ autoUpdateEnabled: !s.autoUpdateEnabled })} />
      <ActionCard title={update.kind === "checking" ? t("checkingForUpdates") : t("checkForUpdates")}
        desc={t("checkForUpdatesDesc")} icon="refresh" onClick={() => void checkUpdates()} />
      {update.kind === "uptodate" ? <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 4px 12px" }}>{t("updateUpToDate")}</p> : null}
      {update.kind === "failed" ? <p style={{ color: "var(--error)", fontSize: 13, margin: "0 4px 12px" }}>{t("updateCheckFailed")}</p> : null}
      {update.kind === "available" ? (
        <Dialog title={t("updateAvailable")} onClose={() => setUpdate({ kind: "idle" })}>
          <p>{t("updateAvailableMessage", { currentVersion: displayVersion(APP_VERSION), latestVersion: displayVersion(update.latest), assetName: "pulse-android-arm64-v8a.apk" })}</p>
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => setUpdate({ kind: "idle" })}>{t("maybeLater")}</button>
            {update.url ? (
              <a className="btn btn-primary" href={update.url} target="_blank" rel="noreferrer">{t("downloadUpdate")}</a>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      <ActionCard title={t("scanFolders")} desc={t("scanFoldersDesc")} icon="folder" onClick={goScanner} />

      <h3 className="set-section">{t("other")}</h3>
      <ActionCard title={t("resetSettings")} desc={t("resetSettingsDesc")} icon="replay"
        onClick={() => setConfirmReset(true)} />
      <ActionCard title={t("clearAllData")} desc={t("clearAllDataDesc")} icon="trash" danger
        onClick={() => setConfirmClearAll(true)} />

      <div className="app-info">
        <div className="ai-name">{t("appName")}</div>
        <div className="ai-ver">{t("version")} {displayVersion(APP_VERSION)}</div>
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

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
