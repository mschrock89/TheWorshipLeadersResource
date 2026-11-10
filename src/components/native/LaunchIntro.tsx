import { useEffect, useState } from "react";
import emLogo from "@/assets/em-logo-transparent-new.png";
import { isNativeApp } from "@/lib/native";
import { getResourceAppForLocation, STUDENT_RESOURCE_APP_KEYS } from "@/lib/resourceApps";

const HOLD_MS = 2300;
const EXIT_MS = 560;
const WORDMARK = "EXPERIENCE MUSIC";

const logoMask = {
  WebkitMaskImage: `url(${emLogo})`,
  maskImage: `url(${emLogo})`,
} as const;

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
        <span className="launch-intro-ring" />
        <span className="launch-intro-ring delay-2" />
        <span className="launch-intro-orbit" />
        <div className="launch-intro-mark" style={logoMask}>
          <div className="launch-intro-mark-fill" />
          <div className="launch-intro-sheen" />
        </div>
        <p className="launch-intro-word">
          {WORDMARK.split("").map((character, index) => (
            <span key={`${character}-${index}`} style={{ animationDelay: `${980 + index * 32}ms` }}>
              {character === " " ? "\u00A0" : character}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
