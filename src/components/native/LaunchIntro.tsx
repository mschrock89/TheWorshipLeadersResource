import { useEffect, useState } from "react";
import emLogo from "@/assets/em-logo-transparent-new.png";
import { isNativeApp } from "@/lib/native";
import { getResourceAppForLocation, STUDENT_RESOURCE_APP_KEYS } from "@/lib/resourceApps";

const HOLD_MS = 2900;
const EXIT_MS = 560;
const WORDMARK = "EXPERIENCE MUSIC";

function shouldShowLaunchIntro() {
  const app = getResourceAppForLocation();
  if (STUDENT_RESOURCE_APP_KEYS.includes(app.key)) return false;

  const intro = new URLSearchParams(window.location.search).get("intro");
  if (intro === "0") return false;
  if (intro === "1") return true;
  if (isNativeApp()) return true;
  if (!import.meta.env.DEV) return false;
  return sessionStorage.getItem("launch-intro-played") !== "1";
}

async function hideNativeSplash() {
  if (!isNativeApp()) return;

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 160 });
  } catch (error) {
    console.error("Splash screen hide failed:", error);
  }
}

export function LaunchIntro() {
  const [phase, setPhase] = useState<"play" | "exit" | "done">(() =>
    shouldShowLaunchIntro() ? "play" : "done",
  );

  useEffect(() => {
    void hideNativeSplash();
    if (phase === "play" && import.meta.env.DEV && !isNativeApp()) {
      sessionStorage.setItem("launch-intro-played", "1");
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "done") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduceMotion ? 420 : HOLD_MS;
    const delay = phase === "play" ? hold : EXIT_MS;
    const nextPhase = phase === "play" ? "exit" : "done";
    const timer = window.setTimeout(() => setPhase(nextPhase), delay);

    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div className={`launch-intro${phase === "exit" ? " is-leaving" : ""}`} aria-hidden="true">
      <div className="launch-intro-stage">
        <svg className="launch-intro-mark" viewBox="0 0 500 500">
          <defs>
            <mask id="launch-intro-mask" maskUnits="userSpaceOnUse">
              <path className="launch-intro-stroke box" pathLength="1" d="M125 100 H225.5 V359.5 H125 Z" />
              <path className="launch-intro-stroke bar" pathLength="1" d="M125 227.5 H203" />
              <path
                className="launch-intro-stroke m"
                pathLength="1"
                d="M226 100 H234 L301 363 L370 100 H375.5 V359.5"
              />
            </mask>
          </defs>
          <image href={emLogo} width="500" height="500" mask="url(#launch-intro-mask)" />
        </svg>
        <p className="launch-intro-word">{WORDMARK}</p>
      </div>
    </div>
  );
}
