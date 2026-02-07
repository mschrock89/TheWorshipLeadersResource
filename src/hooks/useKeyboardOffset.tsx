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

// Hook that provides transform offset for fixed elements on iOS
export function useIOSInputPosition() {
  const [offset, setOffset] = useState({ bottom: 0, scale: 1 });
  const isIOSDevice = useMemo(() => isIOS(), []);
  const rafId = useRef<number>(0);

  const updatePosition = useCallback(() => {
    if (!isIOSDevice) return;
    
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Calculate the offset needed to keep element above keyboard
    const offsetTop = viewport.offsetTop;
    const viewportHeight = viewport.height;
    const windowHeight = window.innerHeight;
    
    // The bottom offset is how much we need to move up
    const bottomOffset = windowHeight - viewportHeight - offsetTop;
    
    setOffset({
      bottom: Math.max(0, bottomOffset),
      scale: viewport.scale,
    });
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

  return { offset, isIOS: isIOSDevice };
}

export function useIsKeyboardOpen(): boolean {
  const height = useKeyboardOffset();
  return height > 100;
}
