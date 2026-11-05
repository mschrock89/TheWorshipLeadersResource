/** Individual usage rows from get_songs_with_stats only cover this many months. */
export const USAGE_HISTORY_WINDOW_MONTHS = 24;
export const REGULAR_ROTATION_MIN_USES = 4;

export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

type SongHistory = {
  usage_count?: number | null;
  upcoming_uses?: number | null;
  first_used?: string | null;
  last_used?: string | null;
  usages?: unknown[] | null;
};

/** Never scheduled by any campus or ministry, including upcoming plans. */
export function isSongGloballyNew(song: SongHistory): boolean {
  const hasAllTimeHistory =
    Number(song.usage_count || 0) > 0 ||
    Number(song.upcoming_uses || 0) > 0 ||
    !!dateOnly(song.first_used) ||
    !!dateOnly(song.last_used);
  return !hasAllTimeHistory && (song.usages?.length || 0) === 0;
}

/** First service falls in the same calendar year as the date being planned. */
export function wasIntroducedInCalendarYear(
  firstUsed: string | null | undefined,
  referenceDate: string,
): boolean {
  const first = dateOnly(firstUsed);
  const reference = dateOnly(referenceDate);
  if (!first || !reference) return false;
  return first.slice(0, 4) === reference.slice(0, 4);
}

/**
 * New-song spacing matches the song library: introduced during the calendar
 * year being planned, still under four plays, and not already in rotation.
 * Usage rows stop at 24 months, so a first service older than that window is
 * a returning song. A first service inside the window but before this year
 * is established too.
 */
export function isSongInNewRotation(input: {
  totalUses: number;
  isInRegularRotation: boolean;
  firstUsed: string | null | undefined;
  usageWindowStart: string;
  referenceDate: string;
}): boolean {
  const firstUsed = dateOnly(input.firstUsed);
  const introducedThisYear = wasIntroducedInCalendarYear(firstUsed, input.referenceDate);
  const recentRowsCoverFullHistory = !firstUsed || firstUsed >= input.usageWindowStart;
  return (
    introducedThisYear &&
    recentRowsCoverFullHistory &&
    input.totalUses > 0 &&
    input.totalUses < REGULAR_ROTATION_MIN_USES &&
    !input.isInRegularRotation
  );
}
