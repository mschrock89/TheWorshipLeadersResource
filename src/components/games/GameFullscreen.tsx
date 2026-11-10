import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { isNativeApp } from "@/lib/native";
import { GameOverCelebration } from "@/components/games/GameScore";

export const GAME_ROUTES = ["/snake", "/pong", "/galaga"] as const;

type BoardAspect = "square" | "16/10" | "4/3";

const boardSizeClass: Record<BoardAspect, string> = {
  square: "aspect-square h-[min(100cqw,100cqh)] w-[min(100cqw,100cqh)]",
  "16/10": "aspect-[16/10] h-[min(100cqh,calc(100cqw*10/16))] w-[min(100cqw,calc(100cqh*16/10))]",
  "4/3": "aspect-[4/3] h-[min(100cqh,calc(100cqw*3/4))] w-[min(100cqw,calc(100cqh*4/3))]",
};

function requestGameFullscreen() {
  const root = document.documentElement;
  if (isNativeApp() || document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
  void root.requestFullscreen().catch(() => {});
}

function exitBrowserFullscreen() {
  if (!document.fullscreenElement || typeof document.exitFullscreen !== "function") return;
  void document.exitFullscreen().catch(() => {});
}

async function hideNativeStatusBar() {
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.hide();
  } catch (error) {
    console.error("Failed to hide the status bar for a game:", error);
  }
}

async function showNativeStatusBar() {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.show();
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (error) {
    console.error("Failed to restore the status bar after a game:", error);
  }
}

export function GameFullscreen({
  title,
  stats,
  aspect,
  controls,
  hint,
  leaderboard,
  gameOver,
  children,
}: {
  title: string;
  stats: ReactNode;
  aspect: BoardAspect;
  controls?: ReactNode;
  hint?: string;
  leaderboard: ReactNode;
  gameOver?: {
    score: number;
    best: number;
    detail?: string;
    onPlayAgain: () => void;
  } | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [scoresOpen, setScoresOpen] = useState(false);
  const scoresOpenRef = useRef(scoresOpen);
  scoresOpenRef.current = scoresOpen;

  const leaveGame = () => {
    haptic("light");
    exitBrowserFullscreen();
    navigate("/games");
  };

  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (isNativeApp()) {
      void hideNativeStatusBar();
    } else {
      requestGameFullscreen();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      if (isNativeApp()) {
        void showNativeStatusBar();
      } else {
        exitBrowserFullscreen();
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (scoresOpenRef.current) {
        event.preventDefault();
        setScoresOpen(false);
        return;
      }
      if (document.fullscreenElement) return;
      event.preventDefault();
      exitBrowserFullscreen();
      navigate("/games");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        overscrollBehavior: "none",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="relative z-30 shrink-0 space-y-2 px-3 pt-2 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            type="button"
            aria-label="Exit game"
            onClick={leaveGame}
            className="h-14 shrink-0 gap-2 rounded-full bg-foreground px-5 text-lg font-semibold text-background shadow-lg hover:bg-foreground/90 [&_svg]:size-6"
          >
            <X />
            Exit
          </Button>
          <p className="min-w-0 flex-1 truncate text-center font-display text-xl font-semibold leading-none sm:text-2xl">{title}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              haptic("light");
              setScoresOpen(true);
            }}
            className="h-14 shrink-0 gap-2 rounded-full px-5 text-lg font-semibold [&_svg]:size-6"
          >
            <Trophy />
            Scores
          </Button>
        </div>
        <div className="flex items-end gap-4 overflow-x-auto pb-1">{stats}</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col landscape:max-sm:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1 bg-black [container-type:size]">
          <div className="absolute inset-1 flex items-center justify-center sm:inset-2">
            <div className={boardSizeClass[aspect]}>{children}</div>
          </div>
        </div>

        {(controls || hint) && (
          <div
            className="shrink-0 space-y-3 px-3 pt-2 landscape:max-sm:flex landscape:max-sm:w-[min(280px,46vw)] landscape:max-sm:flex-col landscape:max-sm:justify-center landscape:max-sm:overflow-y-auto landscape:max-sm:px-2"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {controls}
            {hint ? <p className="hidden text-center text-sm text-muted-foreground sm:block">{hint}</p> : null}
          </div>
        )}
      </div>

      {gameOver && (
        <GameOverCelebration
          score={gameOver.score}
          best={gameOver.best}
          detail={gameOver.detail}
          onPlayAgain={gameOver.onPlayAgain}
        />
      )}

      {scoresOpen && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => setScoresOpen(false)}
        >
          <div
            className="max-h-[min(80dvh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border bg-background p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Leaderboard</h2>
              <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => setScoresOpen(false)}>
                Close
              </Button>
            </div>
            <div className="space-y-3">{leaderboard}</div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
