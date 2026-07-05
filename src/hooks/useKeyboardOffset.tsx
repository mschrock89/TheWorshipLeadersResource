import { useState, useEffect, useCallback, useMemo, useRef } from "react";

interface KeyboardState {
  isOpen: boolean;
  height: number;
  offsetTop: number;
}

// Detect if we're on iOS
function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useKeyboardOffset(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isIOSDevice = useMemo(() => isIOS(), []);
  const rafId = useRef<number>(0);

  const updatePosition = useCallback(() => {
    if (!isIOSDevice) return;
    
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Calculate how much the keyboard is pushing up the viewport
    const keyboardOffset = window.innerHeight - viewport.height;
    
    // Only count as keyboard if it's significant (> 100px)
    if (keyboardOffset > 100) {
      setKeyboardHeight(keyboardOffset);
    } else {
      setKeyboardHeight(0);
    }
  }, [isIOSDevice]);

  useEffect(() => {
    if (!isIOSDevice) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleViewportChange = () => {
      // Use RAF to batch updates and reduce jank
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
      rafId.current = requestAnimationFrame(updatePosition);
    };

    viewport.addEventListener('resize', handleViewportChange);
    viewport.addEventListener('scroll', handleViewportChange);

    // Initial check
    updatePosition();

    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [updatePosition, isIOSDevice]);

  return keyboardHeight;
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
    const translateY = Math.round(
      viewport.offsetTop + viewport.height - window.innerHeight
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
