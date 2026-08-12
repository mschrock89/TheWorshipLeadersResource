export const WEEKEND_ANCHOR_MINISTRY_TYPES = new Set(["weekend", "sunday_am", "weekend_team"]);
export const WEEKEND_SUPPORT_MINISTRY_TYPES = new Set(["production", "video"]);

export interface TeamScheduleRowLike {
  team_id: string;
  schedule_date: string;
  rotation_period?: string | null;
  campus_id?: string | null;
  ministry_type?: string | null;
}

export function filterValidSupportTeamScheduleEntries<T extends TeamScheduleRowLike>(
  entries: T[],
): T[] {
  return entries;
}

export function shouldSkipMisalignedSupportScheduleEntry(
  _entry: TeamScheduleRowLike,
  _allEntries: TeamScheduleRowLike[],
): boolean {
  return false;
}

function getServiceDayForDate(dateStr: string): "saturday" | "sunday" | null {
  const dayOfWeek = parseLocalDate(dateStr).getDay();
  if (dayOfWeek === 6) return "saturday";
  if (dayOfWeek === 0) return "sunday";
  return null;
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Null / both / weekend means the assignment covers the whole weekend.
 * Calendar roster uses this; Team Builder split cards must match.
 */
export function assignmentBelongsOnServiceDay(
  serviceDay: string | null | undefined,
  targetServiceDay: "saturday" | "sunday",
): boolean {
  if (!serviceDay) return true;

  const normalizedServiceDay = serviceDay.toLowerCase();
  if (normalizedServiceDay === "both" || normalizedServiceDay === "weekend") {
    return true;
  }

  return normalizedServiceDay === targetServiceDay;
}

export function assignmentMatchesServiceDay(
  serviceDay: string | null | undefined,
  scheduleDate: string,
): boolean {
  const dateServiceDay = getServiceDayForDate(scheduleDate);
  if (!dateServiceDay) return true;

  return assignmentBelongsOnServiceDay(serviceDay, dateServiceDay);
}

// Group the interchangeable weekend worship aliases, but keep video/production distinct:
// support teams rotate on their own schedule, so a video member is only "scheduled" on
// their team's video rows, never on the team's weekend worship dates.
const normalizeScheduleMinistryGroup = (ministryType: string) =>
  WEEKEND_ANCHOR_MINISTRY_TYPES.has(ministryType) ? "weekend" : ministryType;

export function assignmentMatchesSupportScheduleMinistry(
  memberMinistryTypes: string[],
  scheduleMinistryType: string,
): boolean {
  if (memberMinistryTypes.length === 0 || !scheduleMinistryType) {
    return true;
  }

  const normalizedSchedule = normalizeScheduleMinistryGroup(scheduleMinistryType);
  return memberMinistryTypes.some(
    (memberMinistry) => normalizeScheduleMinistryGroup(memberMinistry) === normalizedSchedule,
  );
}
