/**
 * Haptic feedback utilities using the Vibration API.
 * Gracefully degrades on unsupported devices.
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'selection';

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  selection: 5,
};

export function haptic(pattern: HapticPattern = 'light'): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(patterns[pattern]);
    } catch {
      // Silently fail on unsupported devices
    }
  }
}
