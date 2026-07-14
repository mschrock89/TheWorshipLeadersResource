import { useLayoutEffect } from "react";

function isIosStandalone(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    standaloneNavigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

/** Pixels the layout viewport stops short of the painted screen bottom. */
function measureIosBottomShift(): number {
  if (typeof window === "undefined") return 0;
  const inner = Math.round(window.innerHeight);
  const screenHeight =
    typeof window.screen?.height === "number" ? Math.round(window.screen.height) : 0;
  if (screenHeight <= inner) return 0;
  return Math.min(60, screenHeight - inner);
}

/**
 * Shift the fixed tab bar down onto the physical screen bottom on installed
 * iOS without growing the bar itself.
 */
export function useIosBottomShift() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!isIosStandalone()) {
      root.style.removeProperty("--ios-bottom-shift");
      return;
    }

    let cancelled = false;
    let rafId = 0;
    const timeouts: number[] = [];

    const sync = () => {
      if (cancelled) return;
      root.style.setProperty("--ios-bottom-shift", `${measureIosBottomShift()}px`);
    };

    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(sync);
    };

    sync();
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      sync();
      if (++frames < 45) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    for (const ms of [0, 100, 250, 500, 1000, 2000]) {
      timeouts.push(window.setTimeout(sync, ms));
    }

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      cancelled = true;
      viewport?.removeEventListener("resize", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach((id) => window.clearTimeout(id));
      root.style.removeProperty("--ios-bottom-shift");
    };
  }, []);
}
