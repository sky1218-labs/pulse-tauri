import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AppProviders, useLibrary, usePlayer } from "./store";
import { HomeScreen } from "./screens/HomeScreen";
import { MiniPlayer } from "./components/MiniPlayer";
import { formatTime } from "./utils/time";
import { backNav, installBackBridge } from "./utils/backNav";

/* Non-initial screens are code-split; Home stays eager (initial bundle). */
const PlaylistsScreen = lazy(() => import("./screens/PlaylistsScreen").then((m) => ({ default: m.PlaylistsScreen })));
const PlaylistDetailScreen = lazy(() => import("./screens/PlaylistDetailScreen").then((m) => ({ default: m.PlaylistDetailScreen })));
const PlayerScreen = lazy(() => import("./screens/PlayerScreen").then((m) => ({ default: m.PlayerScreen })));
const ScannerScreen = lazy(() => import("./screens/ScannerScreen").then((m) => ({ default: m.ScannerScreen })));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));

type Screen = "home" | "playlists" | "playlistDetail" | "player" | "scanner" | "settings";

/** Original shows the resume prompt as an in-player card, not a modal. */
function ResumePrompt({ goPlayer }: { goPlayer: () => void }) {
  const { t, data } = useLibrary();
  const player = usePlayer();
  const prompt = player.resumePrompt;
  const dismissRef = useRef(player.dismissResume);
  dismissRef.current = player.dismissResume;
  // Android back dismisses the prompt before it navigates.
  useEffect(() => {
    if (!prompt) return;
    return backNav.register(() => {
      dismissRef.current();
      return true;
    });
  }, [prompt]);
  if (!prompt) return null;
  return (
    <div className="resume-card">
      <div className="rc-title">{t("resumePlaybackPromptTitle")}</div>
      <p>
        {t("resumePlaybackPromptMessage", {
          trackTitle: prompt.track.title,
          position: formatTime(prompt.positionMs),
        })}
      </p>
      <div className="dialog-actions">
        <button
          className="btn btn-ghost btn-small"
          onClick={() => player.answerResume(false)}
        >{t("resumePlaybackPromptStartOver")}</button>
        <button
          className="btn btn-primary btn-small"
          onClick={() => {
            player.answerResume(true);
            if (data.settings.navigateToPlayerOnResume) goPlayer();
          }}
        >{t("resumePlaybackPromptResume")}</button>
      </div>
    </div>
  );
}

function Shell() {
  const [screen, setScreen] = useState<Screen>("home");
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [backStack, setBackStack] = useState<Screen[]>([]);

  const go = (next: Screen) => {
    setBackStack((prev) => [...prev, screen]);
    setScreen(next);
  };
  const back = () => {
    setBackStack((prev) => {
      const copy = [...prev];
      const target = copy.pop() ?? "home";
      setScreen(target);
      return copy;
    });
  };

  // Android system back (and Esc in dev): dialogs register themselves with
  // backNav and are asked first; this router handler is registered once, so
  // it sits at the bottom of the priority stack. At the root screen it
  // declines, and Android exits the app.
  const navBackRef = useRef<() => boolean>(() => false);
  navBackRef.current = () => {
    if (screen === "home") return false;
    if (screen === "playlists") {
      setBackStack([]);
      setScreen("home");
      return true;
    }
    back();
    return true;
  };
  useEffect(() => {
    installBackBridge();
    const off = backNav.register(() => navBackRef.current());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") backNav.handleBack();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="app-shell">
      {/* The region keeps its flex slot even while a lazy screen suspends,
          so the shell below it (mini player) can never jump. */}
      <div className="screen-region">
        <Suspense fallback={null}>
          {screen === "home" && (
            <HomeScreen goScanner={() => go("scanner")} goPlaylists={() => setScreen("playlists")} goSettings={() => go("settings")} />
          )}
          {screen === "playlists" && (
            <PlaylistsScreen goBack={() => setScreen("home")} openPlaylist={(id) => { setPlaylistId(id); go("playlistDetail"); }} />
          )}
          {screen === "playlistDetail" && playlistId && (
            <PlaylistDetailScreen playlistId={playlistId} goBack={back} />
          )}
          {screen === "player" && <PlayerScreen goBack={back} />}
          {screen === "scanner" && <ScannerScreen goBack={back} />}
          {screen === "settings" && <SettingsScreen goBack={back} goScanner={() => go("scanner")} />}
        </Suspense>
      </div>

      <ResumePrompt goPlayer={() => go("player")} />

      {/* Mounted once at shell level; hidden (not unmounted) on the player
          screen so navigation never replays its entrance or moves it. */}
      <MiniPlayer onOpen={() => go("player")} hidden={screen === "player"} />
    </div>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Shell />
    </AppProviders>
  );
}
