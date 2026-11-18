export interface RosterFallbackPeriod {
  isActive: boolean;
  containsDate: boolean;
  distance: number;
  startTime: number;
}

/**
 * A date that already belongs to a campus rotation should show that rotation.
 * An empty Team Builder period stays empty. Borrowing is only for a date that
 * has no rotation period of its own.
 */
export function shouldBorrowRosterFromAnotherPeriod(
  resolvedPeriodCount: number,
  standingMemberCount: number,
): boolean {
  return resolvedPeriodCount === 0 && standingMemberCount === 0;
}

/** The period that contains the service date wins over a stale is_active flag. */
export function compareRosterFallbackPeriods(
  a: RosterFallbackPeriod,
  b: RosterFallbackPeriod,
): number {
  if (a.containsDate !== b.containsDate) return a.containsDate ? -1 : 1;
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  if (a.distance !== b.distance) return a.distance - b.distance;
  return b.startTime - a.startTime;
}
