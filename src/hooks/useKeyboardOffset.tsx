import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// Detect if we're on iOS
function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export interface KeyboardOffsetState {
  /** Approximate keyboard height in px (0 when closed) */
  height: number;
  isOpen: boolean;
  /** Current visualViewport height */
  visualHeight: number;
  offsetTop: number;
  /** Correction to glue bottom-anchored UI to the visual viewport after iOS pan bugs */
  translateY: number;
  /**
   * Standalone-only correction for the iOS cold-start bug where the layout
   * viewport (`innerHeight`) is reported shorter than the physical screen and
   * never fires a resize on the home screen — so `fixed bottom-0` floats above
   * the real bottom over a dark band. Unlike translateY (which compares the
   * visual vs layout viewport and reads 0 here), this uses the stable
   * `screen.height`, available at mount, so no settle/resize is needed.
   */
  bottomGap: number;
}

const CLOSED_STATE: KeyboardOffsetState = {
  height: 0,
  isOpen: false,
  visualHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  offsetTop: 0,
  translateY: 0,
  bottomGap: 0,
};

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useKeyboardOffset(): KeyboardOffsetState {
  const [state, setState] = useState<KeyboardOffsetState>(CLOSED_STATE);
  const isIOSDevice = useMemo(() => isIOS(), []);
  const isStandalone = useMemo(() => isStandaloneDisplay(), []);
  const rafId = useRef<number>(0);

  const computeBottomGap = useCallback(() => {
    if (!isIOSDevice || !isStandalone) return 0;
    const screenH = window.screen?.height ?? window.innerHeight;
    const raw = Math.round(screenH - window.innerHeight);
    // Portrait-locked band is the top-inset size (~47–62px). Clamp so a rogue
    // value (rotation, split view) can never shove the bar off the screen.
    return raw > 0 && raw <= 120 ? raw : 0;
  }, [isIOSDevice, isStandalone]);

  const updatePosition = useCallback(() => {
    const viewport = window.visualViewport;
    const bottomGap = computeBottomGap();
    if (!viewport) {
      setState({
        height: 0,
        isOpen: false,
        visualHeight: window.innerHeight,
        offsetTop: 0,
        translateY: 0,
        bottomGap,
      });
      return;
    }

    const keyboardOffset = window.innerHeight - viewport.height;
    // Lower threshold so pinning starts as soon as the keyboard begins opening
    // (waiting for >100px left the composer hidden until the first keypress).
    const isOpen = isIOSDevice && keyboardOffset > 40;
    // Stuck-pan correction is only ever downward.
    const translateY = isIOSDevice
      ? Math.max(0, Math.round(viewport.offsetTop + viewport.height - window.innerHeight))
      : 0;

    setState((prev) => {
      const next: KeyboardOffsetState = {
        height: isOpen ? keyboardOffset : 0,
        isOpen,
        visualHeight: viewport.height,
        offsetTop: viewport.offsetTop,
        translateY,
        bottomGap,
      };
      if (
        prev.height === next.height &&
        prev.isOpen === next.isOpen &&
        prev.visualHeight === next.visualHeight &&
        prev.offsetTop === next.offsetTop &&
        prev.translateY === next.translateY &&
        prev.bottomGap === next.bottomGap
      ) {
        return prev;
      }
      return next;
    });
  }, [isIOSDevice, computeBottomGap]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleViewportChange = () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
      rafId.current = requestAnimationFrame(updatePosition);
    };

    viewport.addEventListener('resize', handleViewportChange);
    viewport.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);

    updatePosition();

    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [updatePosition]);

  return state;
}
