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

/** Height of the painted strip below the layout viewport on installed iOS. */
function measureIosBottomFill(): number {
  if (typeof window === "undefined") return 0;
  const inner = Math.round(window.innerHeight);
  const screenHeight =
    typeof window.screen?.height === "number" ? Math.round(window.screen.height) : 0;
  if (screenHeight <= inner) return 0;
  // Ignore wild values; the home-indicator band is never this large.
  return Math.min(60, screenHeight - inner);
}

/**
 * iOS installed PWAs can paint below the layout viewport. A fixed strip (not
 * part of the tab bar) fills that band so we don't inflate nav padding.
 */
export function useIosBottomFill() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!isIosStandalone()) {
      root.style.removeProperty("--ios-bottom-fill");
      root.classList.remove("ios-bottom-fill");
      return;
    }

    let cancelled = false;
    let rafId = 0;
    const timeouts: number[] = [];

    const sync = () => {
      if (cancelled) return;
      const fill = measureIosBottomFill();
      root.style.setProperty("--ios-bottom-fill", `${fill}px`);
      root.classList.toggle("ios-bottom-fill", fill > 0);
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
      root.style.removeProperty("--ios-bottom-fill");
      root.classList.remove("ios-bottom-fill");
    };
  }, []);
}
