import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AppProviders, useLibrary, usePlayer } from "./store";
import { HomeScreen } from "./screens/HomeScreen";
import { MiniPlayer } from "./ui/composites/MiniPlayer";
import btn from "./ui/primitives/Button.module.css";
import { formatTime } from "./utils/time";
import { backNav, installBackBridge } from "./utils/backNav";
import styles from "./App.module.css";

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
    <div className={styles.resumeCard}>
      <div className={styles.rcTitle}>{t("resumePlaybackPromptTitle")}</div>
      <p>
        {t("resumePlaybackPromptMessage", {
          trackTitle: prompt.track.title,
          position: formatTime(prompt.positionMs),
        })}
      </p>
      <div className={styles.resumeActions}>
        <button
          className={`${btn.btn} ${btn.btnGhost} ${btn.btnSmall}`}
          onClick={() => player.answerResume(false)}
        >{t("resumePlaybackPromptStartOver")}</button>
        <button
          className={`${btn.btn} ${btn.btnPrimary} ${btn.btnSmall}`}
          onClick={() => {
            player.answerResume(true);
            if (data.settings.navigateToPlayerOnResume) goPlayer();
          }}
        >{t("resumePlaybackPromptResume")}</button>
      </div>
    </div>
  );
}

type NavDir = "push" | "pop" | "present" | "dismiss" | "none";

interface ScreenDesc {
  screen: Screen;
  playlistId: string | null;
}

/**
 * App-feel navigation: the outgoing and incoming screens animate at the
 * same time on separate layers, and the motion follows the direction of
 * travel — pushes slide in from the right while the old screen parallaxes
 * out to the left, pops reverse that, and the player presents from the
 * bottom and dismisses back down. The old behaviour (every screen,
 * forwards or backwards, fading/sliding in from +28px with nothing
 * leaving) read as a web page swap, not an app navigation stack.
 */
function Shell() {
  const [current, setCurrent] = useState<ScreenDesc>({ screen: "home", playlistId: null });
  const [exiting, setExiting] = useState<(ScreenDesc & { dir: NavDir; key: number }) | null>(null);
  const [dir, setDir] = useState<NavDir>("none");
  const [navKey, setNavKey] = useState(0);
  const [backStack, setBackStack] = useState<Screen[]>([]);
  const currentRef = useRef(current);
  currentRef.current = current;
  const navKeyRef = useRef(0);

  const navigate = (next: ScreenDesc, direction: NavDir, stackOp?: "push" | "pop" | "reset") => {
    const prev = currentRef.current;
    if (prev.screen === next.screen && prev.playlistId === next.playlistId) return;
    if (stackOp === "push") setBackStack((st) => [...st, prev.screen]);
    if (stackOp === "reset") setBackStack([]);
    if (stackOp === "pop") setBackStack((st) => st.slice(0, -1));
    navKeyRef.current += 1;
    setExiting({ ...prev, dir: direction, key: navKeyRef.current });
    setDir(direction);
    setNavKey(navKeyRef.current);
    setCurrent(next);
    currentRef.current = next;
  };

  // The exiting layer unmounts when its animation is done.
  useEffect(() => {
    if (!exiting) return;
    const id = window.setTimeout(() => setExiting(null), 320);
    return () => window.clearTimeout(id);
  }, [exiting]);

  const go = (next: Screen) => navigate({ screen: next, playlistId: currentRef.current.playlistId }, "push", "push");
  const goPlayer = () => navigate({ screen: "player", playlistId: currentRef.current.playlistId }, "present", "push");
  const back = () => {
    const from = currentRef.current.screen;
    const target = backStack[backStack.length - 1] ?? "home";
    navigate(
      { screen: target, playlistId: currentRef.current.playlistId },
      from === "player" ? "dismiss" : "pop",
      "pop",
    );
  };

  // Android system back (and Esc in dev): dialogs register themselves with
  // backNav and are asked first; this router handler is registered once, so
  // it sits at the bottom of the priority stack. At the root screen it
  // declines, and Android exits the app.
  const navBackRef = useRef<() => boolean>(() => false);
  navBackRef.current = () => {
    const screen = currentRef.current.screen;
    if (screen === "home") return false;
    if (screen === "playlists") {
      navigate({ screen: "home", playlistId: null }, "pop", "reset");
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

  const renderScreen = (desc: ScreenDesc) => {
    switch (desc.screen) {
      case "home":
        return (
          <HomeScreen
            goScanner={() => go("scanner")}
            goPlaylists={() => navigate({ screen: "playlists", playlistId: null }, "push", "reset")}
            goSettings={() => go("settings")}
          />
        );
      case "playlists":
        return (
          <PlaylistsScreen
            goBack={() => navigate({ screen: "home", playlistId: null }, "pop", "reset")}
            openPlaylist={(id) => navigate({ screen: "playlistDetail", playlistId: id }, "push", "push")}
          />
        );
      case "playlistDetail":
        return desc.playlistId ? <PlaylistDetailScreen playlistId={desc.playlistId} goBack={back} /> : null;
      case "player":
        return <PlayerScreen goBack={back} />;
      case "scanner":
        return <ScannerScreen goBack={back} />;
      case "settings":
        return <SettingsScreen goBack={back} goScanner={() => go("scanner")} />;
    }
  };

  const layerClass = (kind: "enter" | "exit", d: NavDir) =>
    `${styles.screenLayer} ${kind === "enter" ? styles.layerEnter : styles.layerExit} ${
      d === "push" ? styles.dirPush : d === "pop" ? styles.dirPop : d === "present" ? styles.dirPresent : d === "dismiss" ? styles.dirDismiss : ""
    }`;

  return (
    <div className={styles.appShell}>
      {/* The region keeps its flex slot even while a lazy screen suspends,
          so the shell below it (mini player) can never jump. During a
          transition both screens are mounted: the old one on the exiting
          layer (inert), the new one entering above it. */}
      <div className={styles.screenRegion}>
        {exiting ? (
          <div key={`exit-${exiting.key}`} className={`${layerClass("exit", exiting.dir)} ${styles.layerExiting}`} aria-hidden="true">
            {renderScreen(exiting)}
          </div>
        ) : null}
        <div key={`cur-${navKey}`} className={layerClass("enter", dir)}>
          <Suspense fallback={null}>{renderScreen(current)}</Suspense>
        </div>
      </div>

      <ResumePrompt goPlayer={goPlayer} />

      {/* Mounted once at shell level; hidden (not unmounted) on the player
          screen so navigation never replays its entrance or moves it. */}
      <MiniPlayer onOpen={goPlayer} hidden={current.screen === "player"} />
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
