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
    const isOpen = isIOSDevice && keyboardOffset > 100;
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

// Keeps fixed bottom-anchored elements glued to the visual viewport on iOS.
// Fixed elements anchor to the layout viewport; when the keyboard opens iOS
// pans the layout viewport up and sometimes fails to pan back after the
// keyboard closes, leaving fixed bars floating mid-screen. translateY is the
// correction needed to place the element back at the visual viewport bottom.
export function useVisualViewportOffset(): VisualViewportOffset {
  const [state, setState] = useState<VisualViewportOffset>({
    translateY: 0,
    isKeyboardOpen: false,
  });
  const isIOSDevice = useMemo(() => isIOS(), []);
  const rafId = useRef<number>(0);

  const updatePosition = useCallback(() => {
    if (!isIOSDevice) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const keyboardOffset = window.innerHeight - viewport.height;
    // The stuck-pan bug always leaves fixed elements too high, so the
    // correction is only ever downward. iOS can report a slightly short
    // visual viewport with the keyboard closed (e.g. home indicator
    // accounting) — never lift the nav for that.
    const translateY = Math.max(
      0,
      Math.round(viewport.offsetTop + viewport.height - window.innerHeight)
    );
    const isKeyboardOpen = keyboardOffset > 100;

    setState((prev) =>
      prev.translateY === translateY && prev.isKeyboardOpen === isKeyboardOpen
        ? prev
        : { translateY, isKeyboardOpen }
    );
  }, [isIOSDevice]);

  useEffect(() => {
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

    updatePosition();

    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [updatePosition, isIOSDevice]);

  return state;
}
