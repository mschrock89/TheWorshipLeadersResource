/**
 * Haptic feedback utilities using the Vibration API.
 * Gracefully degrades on unsupported devices.
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'selection';

export const HAPTICS_STORAGE_KEY = "haptics-enabled";
export const HAPTICS_CHANGE_EVENT = "app:haptics-changed";

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  selection: 5,
};

export function isHapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function areHapticsEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const storedValue = window.localStorage.getItem(HAPTICS_STORAGE_KEY);
  return storedValue !== "false";
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HAPTICS_STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new CustomEvent(HAPTICS_CHANGE_EVENT, { detail: enabled }));
}

export function haptic(pattern: HapticPattern = 'light'): void {
  if (!areHapticsEnabled() || !isHapticsSupported()) {
    return;
  }

  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return;
  }

  try {
    navigator.vibrate(patterns[pattern]);
  } catch {
    // Silently fail on unsupported devices
  }
}

export function stopHaptics(): void {
  if (!isHapticsSupported()) {
    return;
  }

  try {
    navigator.vibrate(0);
  } catch {
    // Silently fail on unsupported devices
  }
}
