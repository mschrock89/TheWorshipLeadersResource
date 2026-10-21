/**
 * Samsung tablets often draw the system navigation bar over the page and still
 * report a 0px safe-area inset. One menu row is about 40px, so 56px clears
 * that row on a 48px navigation bar.
 */
export const ANDROID_TABLET_NAV_FALLBACK_PX = 56;

export function isAndroidTablet(userAgent: string) {
  if (!/Android/i.test(userAgent)) return false;
  if (/SM-[TXP]\d/i.test(userAgent)) return true;
  return !/Mobile/i.test(userAgent);
}

export function bottomScreenInset(measuredPx: number, userAgent: string) {
  const measured = Number.isFinite(measuredPx) && measuredPx > 0 ? measuredPx : 0;
  if (!isAndroidTablet(userAgent)) return measured;
  return Math.max(measured, ANDROID_TABLET_NAV_FALLBACK_PX);
}
