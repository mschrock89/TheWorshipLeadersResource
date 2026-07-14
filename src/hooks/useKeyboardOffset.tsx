import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";

// Detect if we're on iOS
function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function hasEditableFocus(): boolean {
  if (typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    activeElement instanceof HTMLElement && activeElement.isContentEditable
  );
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
}

const CLOSED_STATE: KeyboardOffsetState = {
  height: 0,
  isOpen: false,
  visualHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  offsetTop: 0,
  translateY: 0,
};

export function useKeyboardOffset(): KeyboardOffsetState {
  const [state, setState] = useState<KeyboardOffsetState>(CLOSED_STATE);
  const isIOSDevice = useMemo(() => isIOS(), []);
  const rafId = useRef<number>(0);

  const updatePosition = useCallback(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      setState({
        height: 0,
        isOpen: false,
        visualHeight: window.innerHeight,
        offsetTop: 0,
        translateY: 0,
      });
      return;
    }

    const keyboardOffset = window.innerHeight - viewport.height;
    // Lower threshold so pinning starts as soon as the keyboard begins opening
    // (waiting for >100px left the composer hidden until the first keypress).
    const isOpen = isIOSDevice && keyboardOffset > 40;
    // Stuck-pan correction is only ever downward (see useVisualViewportOffset).
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
      };
      if (
        prev.height === next.height &&
        prev.isOpen === next.isOpen &&
        prev.visualHeight === next.visualHeight &&
        prev.offsetTop === next.offsetTop &&
        prev.translateY === next.translateY
      ) {
        return prev;
      }
      return next;
    });
  }, [isIOSDevice]);

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

interface VisualViewportOffset {
  translateY: number;
  isKeyboardOpen: boolean;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    standaloneNavigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

/**
 * Distance the fixed bottom edge sits above the true visible bottom on iOS.
 *
 * Two failure modes show up as a black gap under the nav:
 * 1. visualViewport extends below the layout viewport
 * 2. standalone PWAs report innerHeight short of screen.height (home indicator)
 *
 * Padding with safe-area cannot fill that gap — it only grows the bar upward.
 * Positive translateY shifts the bar down onto the physical bottom.
 */
function getBottomPinGap(pinToPhysicalBottom: boolean): number {
  const viewport = window.visualViewport;
  const visualBottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight;
  const visualGap = Math.max(0, Math.round(visualBottom - window.innerHeight));

  if (
    pinToPhysicalBottom &&
    isStandaloneDisplay() &&
    typeof window.screen?.height === "number"
  ) {
    const layoutBottom = Math.max(window.innerHeight, visualBottom);
    const screenGap = Math.max(0, Math.round(window.screen.height - layoutBottom));
    return Math.max(visualGap, screenGap);
  }

  return visualGap;
}

function getInitialVisualViewportOffset(
  isIOSDevice: boolean,
  pinToPhysicalBottom: boolean,
): VisualViewportOffset {
  if (!isIOSDevice || typeof window === "undefined") {
    return { translateY: 0, isKeyboardOpen: false };
  }

  return {
    translateY: pinToPhysicalBottom ? getBottomPinGap(true) : 0,
    isKeyboardOpen: false,
  };
}

// Keeps fixed bottom-anchored elements glued to the visible bottom on iOS.
export function useVisualViewportOffset(pinToPhysicalBottom = false): VisualViewportOffset {
  const isIOSDevice = useMemo(() => isIOS(), []);
  const [state, setState] = useState<VisualViewportOffset>(() =>
    getInitialVisualViewportOffset(isIOSDevice, pinToPhysicalBottom)
  );
  const rafId = useRef<number>(0);
  const hadKeyboardOpen = useRef(false);

  const updatePosition = useCallback(() => {
    if (!isIOSDevice) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const keyboardOffset = window.innerHeight - viewport.height;
    // Browser chrome and an early visualViewport measurement can also make the
    // visual viewport look shorter during startup. Only classify that as a
    // keyboard when an editable control actually owns focus.
    const isKeyboardOpen = keyboardOffset > 100 && hasEditableFocus();
    if (isKeyboardOpen) {
      hadKeyboardOpen.current = true;
    }

    // Non-chat screens pin immediately. Other callers only correct after a
    // real keyboard-open cycle (stuck-pan recovery).
    const translateY =
      !isKeyboardOpen && (pinToPhysicalBottom || hadKeyboardOpen.current)
        ? getBottomPinGap(pinToPhysicalBottom)
        : 0;

    if (!isKeyboardOpen && translateY === 0) {
      hadKeyboardOpen.current = false;
    }

    setState((prev) =>
      prev.translateY === translateY && prev.isKeyboardOpen === isKeyboardOpen
        ? prev
        : { translateY, isKeyboardOpen }
    );
  }, [pinToPhysicalBottom, isIOSDevice]);

  useLayoutEffect(() => {
    if (!isIOSDevice) return;

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
    rafId.current = requestAnimationFrame(updatePosition);

    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [updatePosition, isIOSDevice]);

  return state;
}
