const WEEKEND_MINISTRY_TYPES = new Set(["weekend", "sunday_am"]);

/** First weekend Murfreesboro Central's 2026 rotation is fully dated. */
export const CAMPUS_WEEKEND_SCHEDULE_COPY_FROM = "2026-05-01";

export interface WeekendScheduleSeedRow {
  ministry_type: string | null;
  schedule_date: string;
}

function isSundayDate(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 0;
}

/**
 * Weekend rows to copy from Murfreesboro Central so another campus follows the
 * same team-number rotation. Cannon County keeps Saturday and Sunday.
 * Shelbyville only meets on Sunday.
 * Dates already on the target campus are left alone.
 */
export function shouldCopyCentralWeekendSchedule(
  target: "cannon" | "shelbyville",
  row: WeekendScheduleSeedRow,
  existingTargetDates: ReadonlySet<string>,
): boolean {
  if (!row.ministry_type || !WEEKEND_MINISTRY_TYPES.has(row.ministry_type)) return false;
  if (row.schedule_date < CAMPUS_WEEKEND_SCHEDULE_COPY_FROM) return false;
  if (existingTargetDates.has(row.schedule_date)) return false;
  if (target === "shelbyville" && !isSundayDate(row.schedule_date)) return false;
  return true;
}
