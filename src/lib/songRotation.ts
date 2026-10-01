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

/**
 * New-song spacing applies only while the usage rows cover the song's whole
 * history. Those rows stop at 24 months, so an older first service means a
 * small recent count is a returning song, not a new one.
 */
export function isSongInNewRotation(input: {
  totalUses: number;
  isInRegularRotation: boolean;
  firstUsed: string | null | undefined;
  usageWindowStart: string;
}): boolean {
  const firstUsed = dateOnly(input.firstUsed);
  const recentRowsCoverFullHistory = !firstUsed || firstUsed >= input.usageWindowStart;
  return (
    recentRowsCoverFullHistory &&
    input.totalUses > 0 &&
    input.totalUses < REGULAR_ROTATION_MIN_USES &&
    !input.isInRegularRotation
  );
}
